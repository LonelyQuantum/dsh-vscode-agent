/** Select the editor's palette without persisting an application theme preference. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'

/**
 * Follow VS Code's body classes through the shared theme presenter.
 * @param ctx Client plugin lifetime and theme registry.
 */
export function installEditorTheme(ctx: Context): void {
  ctx.effect(() => {
    const disposers = (['light', 'dark'] as const).map(colorScheme => ctx.theme.register({
      id: `vscode-${colorScheme}`, colorScheme, tokens: {},
    }))
    let closed = false
    const sync = (): void => {
      if (closed) return
      const classes = document.body.classList
      const mode = classes.contains('vscode-dark') || classes.contains('vscode-high-contrast') ? 'dark'
        : classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light') ? 'light' : undefined
      if (mode !== undefined && ctx.theme.getTheme().active.id !== `vscode-${mode}`) ctx.theme.setTheme(`vscode-${mode}`)
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    const off = ctx.on('theme/change', () => { queueMicrotask(sync) })
    sync()
    return () => {
      closed = true
      observer.disconnect()
      off()
      for (const dispose of disposers) dispose()
    }
  }, 'ui-vscode: editor palette')
}
