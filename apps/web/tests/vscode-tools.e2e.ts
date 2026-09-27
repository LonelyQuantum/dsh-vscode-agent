/** Recorded tool groups remain navigable inside the editor's narrow conversation. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-workspace'
import { launchWebScaffold, seedSession, watchConsole } from './scaffold.ts'
import { expandOwningTurnProcess } from './support.ts'

it('keeps grouped tool results accessible at editor sidebar widths', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('../../../packages/bundle/vscode-app/cordis.patch.yml', import.meta.url)),
  })
  try {
    const id = await seedSession(scaffold,
      await readFile(new URL('../../../snapshots/web/tool-details/session.v3.jsonl', import.meta.url), 'utf8'),
      'vscode-tool-groups', 'standard')
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    await workspace.attachSession(id)
    const browser = await chromium.launch(process.env.DSH_VSCODE_TEST_BROWSER === 'msedge' ? { channel: 'msedge' } : {})
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Shanghai' })
      const tripwire = watchConsole(page)
      await page.addInitScript(({ workspace, id }) => {
        Reflect.set(globalThis, '__DSH_VSCODE__', { workspace: () => workspace,
          capture: () => Promise.reject(new Error('No capture in recorded tool qualification')),
          preview: () => {}, configure: () => {}, selected: () => {}, lastSession: () => id,
          ready: () => {}, openFile: () => {}, openChanges: () => {},
        })
      }, { workspace: scaffold.workspaceCwd, id })
      await page.goto(scaffold.authenticatedUrl)
      const root = page.locator('[data-vscode-conversation]')
      const tool = root.locator('[data-tool="create_goal"]')
      await tool.waitFor({ state: 'attached' })
      const process = root.locator('[data-turn-process]').first()
      expect(await process.getAttribute('aria-expanded')).toBe('false')
      for (const width of [320, 420]) {
        await page.setViewportSize({ width, height: 900 })
        await expandOwningTurnProcess(page, tool)
        expect(await tool.isVisible()).toBe(true)
        expect(await root.locator('[data-chat-call-id] [data-tool]').count()).toBe(45)
        await tool.getByRole('button', { expanded: false }).first().click()
        expect(await tool.getByRole('button', { name: 'Inspect', exact: true }).isVisible()).toBe(true)
        expect(await tool.getByRole('listitem').count()).toBeGreaterThan(0)
        expect(await root.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await tool.getByRole('button', { expanded: true }).first().click()
        await process.focus()
        await page.keyboard.press('Enter')
        expect(await process.getAttribute('aria-expanded')).toBe('false')
        expect(await tool.isVisible()).toBe(false)
        expect(await process.evaluate(element => document.activeElement === element)).toBe(true)
      }
      expect(tripwire.pageErrors).toEqual([])
      expect(tripwire.warnings).toEqual([])
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
