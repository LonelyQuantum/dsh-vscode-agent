/** Native context retains editor bytes and rejects files outside the canonical workspace. */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boundedCapture, documentCapture, workspaceFile, workspaceNavigation } from '../src/editor-context.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-editor-context-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside')
  await Promise.all([mkdir(workspace), mkdir(outside)])
  const path = join(workspace, 'file.ts')
  await Promise.all([writeFile(path, 'disk text'), writeFile(join(outside, 'secret.txt'), 'outside')])
  return { root, workspace, outside, path }
}

it('retains unsaved Unicode and exact version/range instead of disk text', async () => {
  const f = await fixture()
  const capture = await documentCapture(f.workspace, { kind: 'selection', path: f.path, language: 'typescript', version: 7,
    dirty: true, range: { start: { line: 2, character: 1 }, end: { line: 3, character: 4 } }, text: '未保存🙂\r\nnext' }, 65536)
  expect(capture.label).toBe('file.ts:3–4 · v7*')
  expect(JSON.parse(capture.text.slice(capture.text.indexOf('{')))).toMatchObject({ path: 'file.ts', workspace: f.workspace,
    version: 7, dirty: true, text: '未保存🙂\r\nnext', range: { start: { line: 2, character: 1 }, end: { line: 3, character: 4 } } })
  expect(capture.text).not.toContain('disk text')
})

it('rejects traversal, sibling prefixes, missing paths, and directory symlink escapes', async () => {
  const f = await fixture()
  await expect(workspaceFile(f.workspace, join(f.outside, 'secret.txt'))).rejects.toThrow('outside-workspace')
  await expect(workspaceFile(f.workspace, join(f.workspace, 'missing'))).rejects.toThrow()
  const link = join(f.workspace, 'link')
  await symlink(f.outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(workspaceFile(f.workspace, join(link, 'secret.txt'))).rejects.toThrow('outside-workspace')
  expect(await workspaceFile(f.workspace, f.path)).toBe('file.ts')
})

it('counts UTF-8 bytes and rejects rather than clipping captured content', () => {
  const value = { text: '🙂'.repeat(200) }
  const capture = boundedCapture('file', value, 2048)
  const bytes = Buffer.byteLength(capture.text)
  expect(boundedCapture('file', value, bytes)).toEqual(capture)
  expect(() => boundedCapture('file', value, bytes - 1)).toThrow('context-too-large')
})

it('resolves subdirectory links from the Session directory without widening native access', async () => {
  const f = await fixture()
  const nested = join(f.workspace, 'src')
  await mkdir(nested)
  await writeFile(join(nested, 'file.ts'), 'nested')
  expect(await workspaceNavigation(f.workspace, nested, 'file.ts')).toBe(join(nested, 'file.ts'))
  expect(await workspaceNavigation(f.workspace, nested, '../file.ts')).toBe(f.path)
  await expect(workspaceNavigation(f.workspace, f.outside, f.path)).rejects.toThrow('outside-workspace')
  await expect(workspaceNavigation(f.workspace, nested, '../../outside/secret.txt')).rejects.toThrow('outside-workspace')
  await expect(workspaceNavigation(f.workspace, join(f.workspace, 'missing'), f.path)).rejects.toThrow()
  const worktree = join(f.workspace, 'worktree')
  await symlink(f.outside, worktree, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(workspaceNavigation(f.workspace, worktree, 'secret.txt')).rejects.toThrow('outside-workspace')
})
