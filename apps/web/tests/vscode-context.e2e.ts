/** The real Web composition mounts the editor layout and shared reference composer without model credentials. */
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { compareOrRefreshGolden, launchWebScaffold, webSnapshotMode } from './scaffold.ts'
import { writeComposerDraft } from './support.ts'

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
      await root.getByRole('navigation', { name: 'All conversations' }).waitFor()
      await root.getByRole('button', { name: 'Add files or run commands', exact: true }).click()
      const fileOption = page.getByRole('option', { name: 'File', exact: true })
      await fileOption.waitFor()
      const chooser = page.waitForEvent('filechooser')
      await fileOption.click({ timeout: 5_000 })
      await (await chooser).setFiles({ name: 'editor-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('EDITOR_UPLOAD_BYTES') })
      await root.getByText('editor-upload.txt', { exact: true }).waitFor()
      await expect.poll(async () => root.getByRole('button', { name: 'Send message', exact: true }).isEnabled()).toBe(true)
      expect(await root.getByRole('button', { name: 'History', exact: true }).count()).toBe(0)
      expect(await root.getByRole('button', { name: 'New conversation', exact: true }).count()).toBe(0)
      expect(await root.getByRole('button', { name: 'Attach file', exact: true }).count()).toBe(0)
      await root.getByRole('button', { name: 'Attach selection', exact: true }).click()
      const chip = input.locator('[data-composer-chip="editor-context"]')
      await chip.waitFor()
      expect(await chip.textContent()).toContain('context.ts · v7*')
      await chip.click()
      await expect.poll(() => page.evaluate(() => (Reflect.get(globalThis, '__DSH_EDITOR_OBSERVATIONS__') as { preview: string }).preview))
        .toBe(snapshot)
      await root.getByRole('button', { name: 'API settings', exact: true }).click()
      expect(await page.evaluate(() => (Reflect.get(globalThis, '__DSH_EDITOR_OBSERVATIONS__') as { configured: boolean }).configured)).toBe(true)
      for (const width of [320, 420]) {
        await page.setViewportSize({ width, height: 900 })
        const geometry = await root.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }))
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
        const listBox = await root.getByRole('navigation').boundingBox()
        const composerBox = await root.locator('[data-composer-seat]').boundingBox()
        const footerBox = await root.locator('footer').boundingBox()
        expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(composerBox!.y + 1)
        expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(footerBox!.y + 1)
        expect(footerBox!.y + footerBox!.height).toBeCloseTo(900, 0)
        const access = root.getByRole('button', { name: /^Access mode/ })
        await access.focus()
        await page.keyboard.press('Enter')
        const menu = page.getByRole('menu').last()
        await menu.waitFor()
        const bounds = await menu.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await page.keyboard.press('Escape')
        await menu.waitFor({ state: 'hidden' })
        await access.click()
        await menu.waitFor()
        await root.locator('header strong').click()
        await menu.waitFor({ state: 'hidden' })
        const add = root.getByRole('button', { name: 'Add files or run commands', exact: true })
        await add.click()
        const files = page.getByRole('option', { name: 'File', exact: true })
        await files.click({ trial: true })
        const fileMenu = page.locator('[data-trigger-menu]')
        const fileBounds = await fileMenu.boundingBox()
        expect(fileBounds!.x).toBeGreaterThanOrEqual(0)
        expect(fileBounds!.y).toBeGreaterThanOrEqual(0)
        expect(fileBounds!.x + fileBounds!.width).toBeLessThanOrEqual(width)
        await input.press('Escape')
        await fileMenu.waitFor({ state: 'hidden' })
        await add.click()
        await files.waitFor()
        await root.locator('header strong').click()
        await fileMenu.waitFor({ state: 'hidden' })
      }
      for (const draft of ['unsent draft', '/']) {
        await writeComposerDraft(page, input, draft)
        const markup = await input.innerHTML()
        for (const chord of ['Alt+Enter', 'Meta+Alt+Enter', 'Control+Alt+Enter', 'Control+Meta+Enter', 'Meta+Shift+Enter', 'Control+Shift+Enter']) {
          await input.press(chord)
          expect(await input.innerHTML(), `${draft}: ${chord}`).toBe(markup)
        }
        await input.press('Escape')
      }
      await writeComposerDraft(page, input, 'first line')
      await input.press('Shift+Enter')
      await page.keyboard.insertText('second line')
      expect(await input.innerText()).toBe('first line\nsecond line')
      await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
      expect(await input.innerText()).toBe('first line\nsecond line')
      expect(await root.locator('[data-user-message]').count()).toBe(0)
      await page.addStyleTag({ content: await readFile(new URL('../../vscode/resources/editor.css', import.meta.url), 'utf8') })
      for (const [theme, background, foreground] of [
        ['vscode-light', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)'],
        ['vscode-dark', 'rgb(30, 30, 30)', 'rgb(240, 240, 240)'],
        ['vscode-high-contrast', 'rgb(0, 0, 0)', 'rgb(255, 255, 0)'],
        ['vscode-high-contrast-light', 'rgb(255, 255, 255)', 'rgb(0, 0, 128)'],
      ]) {
        await page.evaluate(({ theme, background, foreground }) => {
          document.body.className = theme!
          document.body.style.setProperty('--vscode-sideBar-background', background!)
          document.body.style.setProperty('--vscode-foreground', foreground!)
          document.body.style.setProperty('--vscode-input-background', background!)
        }, { theme, background, foreground })
        await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')))
          .toBe(theme === 'vscode-dark' || theme === 'vscode-high-contrast')
        expect(await root.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(background)
        expect(await root.evaluate(element => getComputedStyle(element).color)).toBe(foreground)
        expect(await root.locator('[data-composer-card]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(background)
      }
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/vscode-context/interaction.expected.md', import.meta.url)),
        ['- Editor layout: single column at 320/420 px', '- Initial layout: all conversations when this workspace is empty, above a bottom-docked new-message composer', '- Selection reference: context.ts · v7*',
          '- Preview: exact immutable snapshot', '- Credential gesture: native carrier', '- Footer: selection, Problems, API settings; no History, new-conversation or file button',
          '- Plus menu: file chooser uploads editor-upload.txt; menu stays clickable and viewport-contained; Escape and outside click dismiss',
          '- Keyboard: modified Enter and IME retain drafts; Shift+Enter inserts a line',
          '- Permission menu: viewport-contained; Escape and outside click dismiss',
          '- Theme: light, dark, high contrast dark/light carrier colors'].join('\n'),
        webSnapshotMode())
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
