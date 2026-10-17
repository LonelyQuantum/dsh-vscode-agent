/** Native trust changes wait for the installed-extension inventory, not a startup delay. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { runWorkspaceTrustCheck } from '../scripts/test-trust.mjs'

async function fixture(visible: () => Promise<boolean>) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-trust-ready-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const actions: string[] = []
  const files = new Map<string, string>()
  const page = {
    url: () => 'vscode-file://test/workbench.html',
    getByText: () => ({ first: () => ({ isVisible: visible }) }),
    getByRole: (_role: 'button', { name }: { name: string }) => ({ click: async () => {
      actions.push(name)
      files.set(name === 'Trust' ? 'granted' : 'revoked', 'passed')
    } }),
  }
  return { root, actions, tools: {
    browser: { contexts: () => [{ pages: () => [page] }] }, root,
    waitFor: async <T>(check: () => T | Promise<T>): Promise<T> => {
      const result = await check()
      if (!result) throw new Error('Expected readiness observation')
      return result
    },
    readIfPresent: async (path: string) => files.get(path.split(/[\\/]/).at(-1)!),
  } }
}

it('does not grant trust until the installed extension entry is visible', async () => {
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const visible = Promise.withResolvers<boolean>()
  const test = await fixture(() => { entered.resolve(); return visible.promise })
  const running = runWorkspaceTrustCheck(test.tools)
  try {
    await Promise.race([entered.promise, running])
    expect(test.actions).toEqual([])
    await expect(readFile(join(test.root, 'phase'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    visible.resolve(true)
    await running
  }
  expect(test.actions).toEqual(['Trust', "Don't Trust"])
  expect(await readFile(join(test.root, 'phase'), 'utf8')).toBe('revoking')
})

it('does not change trust when the installed extension cannot be observed', async () => {
  const test = await fixture(async () => { throw new Error('Extension inventory unavailable') })
  await expect(runWorkspaceTrustCheck(test.tools)).rejects.toThrow('Extension inventory unavailable')
  expect(test.actions).toEqual([])
  await expect(readFile(join(test.root, 'phase'))).rejects.toMatchObject({ code: 'ENOENT' })
})
