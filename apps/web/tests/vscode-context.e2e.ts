/** The real Web composition mounts the editor layout and shared reference composer without model credentials. */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { compareOrRefreshGolden, launchWebScaffold, webSnapshotMode } from './scaffold.ts'

it('renders explicit editor references and native previews in a narrow conversation', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/bundle/vscode-app/cordis.patch.yml', import.meta.url)),
  })
  try {
    const browser = await chromium.launch(process.env.DSH_VSCODE_TEST_BROWSER === 'msedge' ? { channel: 'msedge' } : {})
    try {
      const page = await browser.newPage({ viewport: { width: 420, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Shanghai' })
      const snapshot = 'Editor context snapshot (explicitly attached by the user):\n{"version":7,"dirty":true,"text":"unsaved 你好"}\n'
      await page.addInitScript(({ workspace, snapshot }) => {
        const state = { preview: '', configured: false, selected: '' }
        Reflect.set(globalThis, '__DSH_EDITOR_OBSERVATIONS__', state)
        Reflect.set(globalThis, '__DSH_VSCODE__', {
          workspace: () => workspace, capture: async () => ({ label: 'context.ts · v7*', text: snapshot }),
          preview: (text: string) => { state.preview = text }, configure: () => { state.configured = true },
          selected: (id: string) => { state.selected = id }, lastSession: () => undefined, ready: () => {},
          openFile: () => {}, openChanges: () => {},
        })
      }, { workspace: scaffold.workspaceCwd, snapshot })
      await page.goto(scaffold.authenticatedUrl)
      const root = page.locator('[data-vscode-conversation]')
      const input = root.locator('[data-composer-input][contenteditable="true"]').first()
      await input.waitFor()
      await root.getByRole('button', { name: 'Attach selection', exact: true }).click()
      const chip = input.locator('[data-composer-chip="editor-context"]')
      await chip.waitFor()
      expect(await chip.textContent()).toContain('context.ts · v7*')
      await chip.click()
      await expect.poll(() => page.evaluate(() => (Reflect.get(globalThis, '__DSH_EDITOR_OBSERVATIONS__') as { preview: string }).preview))
        .toBe(snapshot)
      await root.getByRole('button', { name: 'API key', exact: true }).click()
      expect(await page.evaluate(() => (Reflect.get(globalThis, '__DSH_EDITOR_OBSERVATIONS__') as { configured: boolean }).configured)).toBe(true)
      await root.getByRole('button', { name: 'History', exact: true }).click()
      await root.getByRole('navigation', { name: 'Conversations in this workspace' }).waitFor()
      await root.getByRole('button', { name: 'Back to conversation', exact: true }).click()
      await chip.waitFor({ state: 'visible' })
      const geometry = await root.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }))
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/vscode-context/interaction.expected.md', import.meta.url)),
        ['- Editor layout: single column at 420 px', '- Selection reference: context.ts · v7*',
          '- Preview: exact immutable snapshot', '- Credential gesture: native carrier', '- History return: draft retained'].join('\n'),
        webSnapshotMode())
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
