/** Model orientation belongs to the editor composition and follows its plugin lifetime. */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { expect, it } from 'vitest'
import * as Vscode from '../src/index.ts'

it('contributes editor-specific context without a private runtime URL and disposes it', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt, {})
    const fork = ctx.plugin(Vscode)
    await fork
    const text = renderPrompt(await ctx.systemPrompt.assemble())
    expect(text).toContain('VS Code extension')
    expect(text).toContain('no implicit access')
    expect(text).toContain('read-only')
    expect(text).not.toContain('http://')
    await fork.dispose()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('VS Code extension')
  } finally { await ctx.fiber.dispose() }
})
