// @vitest-environment jsdom
/** Carrier palette changes use non-persistent registry entries and stop at disposal. */
import { Context } from '@deepseek-ai/cordis'
import { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { expect, it, vi } from 'vitest'
import { installEditorTheme } from '../src/client/theme.ts'

it('follows editor classes, does not persist them, and releases its palette registrations', async () => {
  const root = new Context()
  const owner = root.plugin(() => {})
  await owner.await()
  const set = vi.fn()
  const theme = new ThemeRuntime(owner.ctx, {
    getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set,
  } as never)
  owner.ctx.provide('theme', theme)
  const classes = document.body.className
  document.body.className = 'vscode-dark'
  const fork = owner.ctx.plugin(installEditorTheme)
  try {
    await fork.await()
    expect(theme.getTheme().active.id).toBe('vscode-dark')
    document.body.className = 'vscode-high-contrast-light'
    await vi.waitFor(() => { expect(theme.getTheme().active.id).toBe('vscode-light') })
    expect(set).not.toHaveBeenCalled()
    await fork.dispose()
    document.body.className = 'vscode-dark'
    await Promise.resolve()
    expect(theme.getTheme().themes.map(item => item.id)).toEqual(['light', 'dark'])
    expect(theme.getTheme().active.id).not.toContain('vscode')
  } finally { await owner.dispose(); document.body.className = classes }
})
