/** Recorded editor-context submission through the shared conversation and durable inbox. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { compareOrRefreshGolden, launchWebScaffold, recordFixture, webSnapshotMode } from './scaffold.ts'

const fixture = fileURLToPath(new URL('../../../snapshots/web/vscode-editor-context/session.v3.jsonl', import.meta.url))
const mode = webSnapshotMode()
const capture = 'Editor context snapshot (explicitly attached by the user):\n'
  + JSON.stringify({ kind: 'selection', path: 'context.ts', language: 'typescript', version: 7, dirty: true,
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 39 } },
    text: 'const editorOnly = "VSCODE_UNSAVED_42";', coordinates: 'zero-based, end-exclusive' }, null, 2) + '\n'
const prompt = ' Read the attached editor snapshot. Reply with the value of editorOnly, replacing its VSCODE_ prefix with VERIFIED_. Do not call tools.'

it('replays the exact immutable editor snapshot admitted to the model and Session log', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-vscode-overlay-'))
  try {
    const overlay = join(temporary, 'editor.patch.yml')
    const bundle = await readFile(new URL('../../../packages/bundle/vscode-app/cordis.patch.yml', import.meta.url), 'utf8')
    await writeFile(overlay, bundle + '\n- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n')
    const scaffold = await launchWebScaffold({ extraOverlayPath: overlay,
      ...(mode === 'record' ? {} : { replayFixture: fixture, replayProviders: [{ id: 'deepseek-official', name: 'DeepSeek',
        models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash', contextWindow: 1_000_000,
          defaultMaxTokens: 256_000, reasoningEfforts: ['off', 'low', 'high', 'max'], defaultReasoningEffort: 'high',
          systemPromptUpdate: 'in-history' }] }] }),
    })
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    let requestSignal: AbortSignal | undefined
    const disposeGate = scaffold.ctx.on('llm/stream', async function* (options, next) {
      requestSignal = options.signal
      entered.resolve(undefined)
      await release.promise
      yield* next()
    }, { prepend: true })
    try {
      const browser = await chromium.launch(process.env.DSH_VSCODE_TEST_BROWSER === 'msedge' ? { channel: 'msedge' } : {})
      try {
        const page = await browser.newPage({ viewport: { width: 420, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Shanghai' })
        await page.addInitScript(({ workspace, capture }) => {
          Reflect.set(globalThis, '__DSH_VSCODE__', { workspace: () => workspace,
            capture: async () => ({ label: 'context.ts · v7*', text: capture }), preview: () => {}, configure: () => {},
            selected: () => {}, lastSession: () => undefined, ready: () => {}, openFile: () => {}, openChanges: () => {},
          })
        }, { workspace: scaffold.workspaceCwd, capture })
        await page.goto(scaffold.authenticatedUrl)
        const root = page.locator('[data-vscode-conversation]')
        const input = root.locator('[data-composer-input][contenteditable="true"]').first()
        await input.waitFor()
        await root.getByRole('navigation', { name: 'All conversations' }).waitFor()
        await root.getByRole('button', { name: 'Attach selection', exact: true }).click()
        await input.locator('[data-composer-chip="editor-context"]').waitFor()
        await input.press('End')
        await page.keyboard.insertText(prompt)
        const settled = scaffold.whenTurnSettled()
        void settled.catch(() => {})
        await input.press('Enter')
        await Promise.race([entered.promise, settled.then((endedId) => {
          const ending = scaffold.ctx.agents.get(endedId)?.session.snapshotEvents().findLast(event => event.type === 'turn/end')
          throw new Error(`Turn settled before the held model request: ${JSON.stringify(ending?.data)}`)
        })])
        await root.getByRole('button', { name: 'Back to conversations', exact: true }).click()
        await root.getByRole('navigation', { name: 'Conversations in this workspace' }).waitFor()
        await input.waitFor()
        expect(await input.innerText()).toBe('')
        expect(requestSignal?.aborted).toBe(false)
        expect(await root.getByRole('button', { name: 'Stop generating', exact: true }).count()).toBe(0)
        release.resolve(undefined)
        const id = await settled
        const session = scaffold.ctx.agents.get(id)!.session
        const messages = session.snapshotEvents().filter(event => event.type === 'user/message')
          .filter(event => event.data.source.kind === 'user')
        expect(messages).toHaveLength(1)
        const text = messages[0]!.data.content.filter(block => block.type === 'text').map(block => block.text).join('')
        expect(text).toContain(capture)
        expect(text).toContain(prompt.trim())
        expect(requestSignal?.aborted).toBe(false)
        await root.locator('nav button').first().click()
        await expect.poll(() => root.innerText()).toContain('VERIFIED_UNSAVED_42')
        await page.addStyleTag({ content: await readFile(new URL('../../vscode/resources/editor.css', import.meta.url), 'utf8') })
        const bubble = root.locator('[data-user-message]').first()
        for (const width of [320, 420]) {
          await page.setViewportSize({ width, height: 900 })
          expect((await bubble.boundingBox())!.width).toBeGreaterThan(width * 0.65)
          expect(await root.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        }
        for (const theme of ['vscode-light', 'vscode-dark', 'vscode-high-contrast']) {
          const background = theme === 'vscode-light' ? 'rgb(255, 255, 255)' : 'rgb(30, 30, 30)'
          await page.evaluate(({ theme, background }) => {
            document.body.className = theme
            document.body.style.setProperty('--vscode-input-background', background)
          }, { theme, background })
          expect(await bubble.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(background)
        }
        await page.reload()
        await root.getByRole('navigation', { name: 'Conversations in this workspace' }).waitFor()
        await input.waitFor()
        expect(await root.locator('[data-user-message]').count()).toBe(0)
        await root.locator('nav button').first().click()
        await expect.poll(() => root.innerText()).toContain('VERIFIED_UNSAVED_42')
        const emptyWorkspace = join(scaffold.workspaceCwd, 'empty-workspace')
        await mkdir(emptyWorkspace)
        const otherPage = await browser.newPage({ viewport: { width: 420, height: 900 }, locale: 'en-US' })
        await otherPage.addInitScript((workspace) => {
          let selected: string | undefined
          Reflect.set(globalThis, '__DSH_VSCODE__', { workspace: () => workspace,
            capture: async () => null, preview: () => {}, configure: () => {}, selected: (id: string) => { selected = id },
            lastSession: () => selected, ready: () => {}, openFile: () => {}, openChanges: () => {},
          })
        }, emptyWorkspace)
        await otherPage.goto(scaffold.authenticatedUrl)
        const otherRoot = otherPage.locator('[data-vscode-conversation]')
        const all = otherRoot.getByRole('navigation', { name: 'All conversations' })
        await all.waitFor()
        const otherSelected = () => otherPage.evaluate(() =>
          (Reflect.get(globalThis, '__DSH_VSCODE__') as { lastSession(): string | undefined }).lastSession())
        await expect.poll(otherSelected).toBeDefined()
        await all.locator(`button[data-session-id="${id}"]`).click()
        await expect.poll(() => otherRoot.innerText()).toContain('VERIFIED_UNSAVED_42')
        await otherRoot.getByRole('button', { name: 'Back to conversations', exact: true }).click()
        await all.waitFor()
        expect(await otherRoot.locator('[data-composer-input][contenteditable="true"]').innerText()).toBe('')
        await expect.poll(async () => {
          const selected = await otherSelected()
          return selected === undefined ? undefined : scaffold.ctx.agents.get(SessionId(selected))?.session.header.cwd
        }).toBe(emptyWorkspace)
        await compareOrRefreshGolden(fileURLToPath(new URL('./expected/vscode-context/navigation.expected.md', import.meta.url)),
          ['- Open: all conversations when this workspace has no saved conversations, with a new-message draft',
            '- Send from list: opens the submitted conversation',
            '- Back during model request: list has an independent empty draft; running request is not aborted',
            '- Background completion: recorded response persists and is visible after reopening',
            '- Reload: returns to this workspace’s conversation list; completed conversation remains available',
            '- Empty workspace: lists conversations from other workspaces; opening and returning selects an empty draft in the editor workspace'].join('\n'), mode)
        if (mode === 'record') await recordFixture(scaffold, id, fixture)
      } finally { await browser.close() }
    } catch (error) { console.error('Editor submission failed:', error); throw error }
    finally { release.resolve(undefined); disposeGate(); await scaffold.close() }
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
