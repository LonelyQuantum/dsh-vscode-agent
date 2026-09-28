/** Trust and workspace admission before asynchronous startup can reach the runtime. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

const state = vi.hoisted(() => ({
  trusted: true, remote: undefined as string | undefined,
  folders: [{ uri: { scheme: 'file', fsPath: '/workspace' } }],
  commands: new Map<string, (...args: never[]) => unknown>(),
  resolve: undefined as ((view: object) => void) | undefined,
  start: vi.fn(), stop: vi.fn(), secret: vi.fn(), realpath: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({ realpath: state.realpath, readFile: vi.fn() }))
vi.mock('../src/runtime.ts', () => ({ RuntimeOwnershipError: class extends Error {}, AgentRuntime: class {
  start = state.start
  stop = state.stop
  onExit = vi.fn()
} }))
vi.mock('../src/native-context.ts', () => ({ SnapshotDocuments: class { dispose() {} } }))
vi.mock('../src/installation.ts', () => ({ resolveInstallation: vi.fn(async () => ({ directory: '/installation', version: 'fixture' })) }))
vi.mock('vscode', () => ({
  env: { language: 'en', get remoteName() { return state.remote } },
  Uri: { file: (fsPath: string) => ({ fsPath }), joinPath: (_base: object, path: string) => ({ fsPath: '/extension/' + path }) },
  workspace: {
    get isTrusted() { return state.trusted }, get workspaceFolders() { return state.folders },
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }), getConfiguration: () => ({ get: () => undefined }),
  },
  window: {
    showWarningMessage: vi.fn(), registerWebviewViewProvider: (_id: string, provider: { resolveWebviewView(view: object): void }) => {
      state.resolve = (view) => { provider.resolveWebviewView(view) }
      return { dispose() {} }
    },
  },
  commands: {
    registerCommand: (id: string, run: (...args: never[]) => unknown) => { state.commands.set(id, run); return { dispose() {} } },
    executeCommand: async () => {},
  },
}))
import { activate, deactivate } from '../src/extension.ts'

beforeEach(() => {
  state.trusted = true
  state.remote = undefined
  state.folders = [{ uri: { scheme: 'file', fsPath: '/workspace' } }]
  state.commands.clear()
  state.start.mockReset()
  state.stop.mockReset()
  state.secret.mockReset().mockResolvedValue(undefined)
  state.realpath.mockReset().mockResolvedValue('/workspace')
})
afterEach(async () => { await deactivate() })

function open(): Promise<unknown> {
  // The test supplies only activation-owned VS Code members; native editor services are mocked above.
  const context = { subscriptions: [], extensionUri: {}, extensionPath: '/extension', globalStorageUri: { fsPath: '/storage' },
    secrets: { get: state.secret } } as vscode.ExtensionContext
  activate(context)
  state.resolve!({ show() {}, onDidDispose() {}, webview: { options: {}, html: '' } })
  return Promise.resolve(state.commands.get('dsh.open')!())
}

it.each(['untrusted', 'remote', 'multi-root', 'virtual'])('refuses %s workspaces before accessing credentials or processes', async (mode) => {
  if (mode === 'untrusted') state.trusted = false
  if (mode === 'remote') state.remote = 'ssh-remote'
  if (mode === 'multi-root') state.folders.push({ uri: { scheme: 'file', fsPath: '/other' } })
  if (mode === 'virtual') state.folders[0].uri.scheme = 'vscode-vfs'
  await open()
  expect(state.secret).not.toHaveBeenCalled()
  expect(state.start).not.toHaveBeenCalled()
})

it('rechecks trust after the asynchronous credential read', async () => {
  let release!: (key: string | undefined) => void
  state.secret.mockReturnValue(new Promise<string | undefined>((resolve) => { release = resolve }))
  const opening = open()
  await vi.waitFor(() => { expect(state.secret).toHaveBeenCalledOnce() })
  state.trusted = false
  release(undefined)
  await opening
  expect(state.start).not.toHaveBeenCalled()
})

it('joins startup cancellation without launching a late runtime', async () => {
  let release!: (path: string) => void
  state.realpath.mockReturnValue(new Promise<string>((resolve) => { release = resolve }))
  const opening = open()
  const stopped = Promise.resolve(state.commands.get('dsh.stop')!())
  release('/workspace')
  await Promise.all([opening, stopped])
  expect(state.secret).not.toHaveBeenCalled()
  expect(state.start).not.toHaveBeenCalled()
})
