/** View replacement, cancellation, and trust admission during asynchronous startup. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import type { RuntimeReady } from '../src/runtime.ts'

const state = vi.hoisted(() => ({
  trusted: true, remote: undefined as string | undefined,
  folders: [{ uri: { scheme: 'file', fsPath: '/workspace' } }],
  commands: new Map<string, (...args: never[]) => unknown>(),
  resolve: undefined as ((view: object) => void) | undefined,
  start: vi.fn(), stop: vi.fn(), readBoot: vi.fn(), secret: vi.fn(), realpath: vi.fn(),
  desktop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), readFile: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({ realpath: state.realpath, readFile: state.readFile }))
vi.mock('../src/proxy.ts', () => ({ CHANNEL: 'dsh', NativeRequestError: class extends Error {}, HostProxy: { connect: state.connect } }))
vi.mock('../src/runtime.ts', () => ({ RuntimeOwnershipError: class extends Error {}, AgentRuntime: class {
  start = state.start
  stop = state.stop
  readBoot = state.readBoot
  onExit = vi.fn()
} }))
vi.mock('../src/native-context.ts', () => ({ SnapshotDocuments: class { dispose() {} } }))
vi.mock('../src/installation.ts', () => ({ resolveInstallation: vi.fn(async () => ({ directory: '/installation', version: 'fixture', sharedRuntime: '/runtime' })) }))
vi.mock('../src/desktop-home.ts', () => ({ DesktopHomeError: class extends Error {}, resolveDesktopHome: state.desktop }))
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
  state.start.mockReset().mockResolvedValue({ pid: 123, url: 'http://fixture.invalid', injections: [] })
  state.stop.mockReset()
  state.readBoot.mockReset().mockResolvedValue([])
  state.secret.mockReset().mockResolvedValue(undefined)
  state.desktop.mockReset().mockResolvedValue('/new-shared-home')
  state.realpath.mockReset().mockResolvedValue('/workspace')
  state.readFile.mockReset().mockResolvedValue('<html><head></head><body id="fixture-client"></body></html>')
  state.disconnect.mockReset().mockResolvedValue(undefined)
  state.connect.mockReset().mockImplementation(async () => ({ dispose: state.disconnect, receive: vi.fn() }))
})
afterEach(async () => { await deactivate() })

function initialize(): void {
  // The test supplies only activation-owned VS Code members; native editor services are mocked above.
  const context: Partial<vscode.ExtensionContext> = { subscriptions: [], extensionUri: vscode.Uri.file('/extension'), extensionPath: '/extension', globalStorageUri: vscode.Uri.file('/storage'),
    secrets: { get: state.secret, store: vi.fn(), delete: vi.fn(), onDidChange: () => ({ dispose() {} }) } }
  activate(context as vscode.ExtensionContext)
}

class TestView {
  show = vi.fn()
  private disposed: (() => void)[] = []
  private receive: ((message: object) => void) | undefined
  emit(message: object): void { this.receive?.(message) }
  webview = { options: {}, html: '', cspSource: 'fixture-resource:',
    onDidReceiveMessage: (callback: (message: object) => void) => {
      this.receive = callback
      return { dispose: () => { this.receive = undefined } }
    }, postMessage: vi.fn(async () => true),
    asWebviewUri: () => ({ toString: () => 'fixture-resource:/asset' }) }
  onDidDispose(callback: () => void): void { this.disposed.push(callback) }
  dispose(): void { for (const callback of this.disposed.splice(0)) callback() }
}

function command(id: string): Promise<unknown> { return Promise.resolve(state.commands.get(id)!()) }
function open(): Promise<unknown> {
  initialize()
  state.resolve!(new TestView())
  return command('dsh.open')
}

function barrier<T>(): { promise: Promise<T>; release(value: T): void } {
  let release!: (value: T) => void
  return { promise: new Promise<T>((resolve) => { release = resolve }), release: (value) => { release(value) } }
}

const ready: RuntimeReady = { pid: 123, url: 'http://fixture.invalid', injections: [] }

it('reloads the editor page using fresh boot data while keeping its native runtime lease', async () => {
  initialize()
  const view = new TestView()
  state.resolve!(view)
  await command('dsh.open')
  const fresh = [{ kind: 'global', name: '__DSH_BOOT__', value: { release: { version: 'next-fixture' } } }]
  state.readBoot.mockResolvedValue(fresh)
  view.emit({ channel: 'dsh', kind: 'boot', id: 1 })
  await vi.waitFor(() => { expect(view.webview.postMessage).toHaveBeenCalledWith({ channel: 'dsh', kind: 'boot', id: 1,
    injections: fresh, workspace: '/workspace' }) })
  view.emit({ channel: 'dsh', kind: 'native-reload' })
  await vi.waitFor(() => { expect(state.connect).toHaveBeenCalledTimes(2) })
  await command('dsh.open')
  expect(state.start).toHaveBeenCalledOnce()
  expect(state.stop).not.toHaveBeenCalled()
  view.emit({ channel: 'dsh', kind: 'boot', id: 2 })
  await vi.waitFor(() => { expect(state.readBoot).toHaveBeenCalledTimes(2) })
})

it('reports a failed fresh bootstrap without forwarding backend diagnostics', async () => {
  initialize()
  const view = new TestView()
  state.resolve!(view)
  await command('dsh.open')
  state.readBoot.mockRejectedValue(new Error('fixture-only-secret diagnostic'))
  view.emit({ channel: 'dsh', kind: 'boot', id: 9 })
  await vi.waitFor(() => { expect(view.webview.postMessage).toHaveBeenCalledWith({ channel: 'dsh', kind: 'boot-failed', id: 9 }) })
  expect(JSON.stringify(view.webview.postMessage.mock.calls)).not.toContain('fixture-only-secret')
})

it('does not forward a delayed boot response after the originating view closes', async () => {
  initialize()
  const view = new TestView()
  state.resolve!(view)
  await command('dsh.open')
  const pending = barrier<unknown[]>()
  state.readBoot.mockReturnValue(pending.promise)
  view.emit({ channel: 'dsh', kind: 'boot', id: 10 })
  expect(state.readBoot).toHaveBeenCalledOnce()
  view.dispose()
  pending.release([])
  await pending.promise
  await Promise.resolve()
  expect(view.webview.postMessage).not.toHaveBeenCalled()
})

it('opens a replacement view after the disposed view finishes its credential read', async () => {
  const entered = barrier<undefined>()
  const credential = barrier<string | undefined>()
  state.secret.mockImplementationOnce(() => { entered.release(undefined); return credential.promise })
  initialize()
  const first = new TestView()
  state.resolve!(first)
  const firstOpening = command('dsh.open')
  const second = new TestView()
  let replacement: Promise<unknown> | undefined
  try {
    await entered.promise
    first.dispose()
    state.resolve!(second)
    replacement = command('dsh.open')
    credential.release(undefined)
    await Promise.all([firstOpening, replacement])
    expect(second.show).toHaveBeenCalled()
    expect(second.webview.html).toContain('fixture-client')
    expect(state.secret).toHaveBeenCalledTimes(2)
    expect(state.start).toHaveBeenCalledOnce()
    expect(state.connect).toHaveBeenCalledOnce()
  } finally {
    credential.release(undefined)
    await Promise.all([firstOpening, replacement])
  }
})

it('coalesces concurrent open commands for the same view', async () => {
  const entered = barrier<undefined>()
  const credential = barrier<string | undefined>()
  state.secret.mockImplementationOnce(() => { entered.release(undefined); return credential.promise })
  const opening = open()
  let repeated: Promise<unknown> | undefined
  try {
    await entered.promise
    repeated = command('dsh.open')
    credential.release(undefined)
    await Promise.all([opening, repeated])
    expect(state.secret).toHaveBeenCalledOnce()
    expect(state.start).toHaveBeenCalledOnce()
    expect(state.connect).toHaveBeenCalledOnce()
  } finally {
    credential.release(undefined)
    await Promise.all([opening, repeated])
  }
})

it('reuses an in-flight runtime when the view is replaced during boot', async () => {
  const entered = barrier<undefined>()
  const runtime = barrier<RuntimeReady>()
  state.start.mockImplementationOnce(() => { entered.release(undefined); return runtime.promise })
  initialize()
  const first = new TestView()
  state.resolve!(first)
  const opening = command('dsh.open')
  let replacement: Promise<unknown> | undefined
  try {
    await entered.promise
    first.dispose()
    const second = new TestView()
    state.resolve!(second)
    replacement = command('dsh.open')
    runtime.release(ready)
    await Promise.all([opening, replacement])
    expect(second.webview.html).toContain('fixture-client')
    expect(first.webview.html).not.toContain('fixture-client')
    expect(state.secret).toHaveBeenCalledOnce()
    expect(state.start).toHaveBeenCalledOnce()
    expect(state.connect).toHaveBeenCalledOnce()
  } finally {
    runtime.release(ready)
    await Promise.all([opening, replacement])
  }
})

it('starts only the latest queued view and ignores disposal of superseded views', async () => {
  const entered = barrier<undefined>()
  const credential = barrier<string | undefined>()
  state.secret.mockImplementationOnce(() => { entered.release(undefined); return credential.promise })
  initialize()
  const first = new TestView()
  state.resolve!(first)
  const opening = command('dsh.open')
  let replacement: Promise<unknown> | undefined
  try {
    await entered.promise
    first.dispose()
    const second = new TestView()
    state.resolve!(second)
    const latest = new TestView()
    state.resolve!(latest)
    replacement = command('dsh.open')
    credential.release(undefined)
    await Promise.all([opening, replacement])
    expect(second.show).not.toHaveBeenCalled()
    expect(latest.webview.html).toContain('fixture-client')
    second.dispose()
    await command('dsh.open')
    expect(state.start).toHaveBeenCalledOnce()
    expect(state.connect).toHaveBeenCalledOnce()
    expect(state.disconnect).not.toHaveBeenCalled()
  } finally {
    credential.release(undefined)
    await Promise.all([opening, replacement])
  }
})

it('opens an explicitly requested view after shutdown without waiting on itself', async () => {
  await open()
  const shutdown = barrier<undefined>()
  state.stop.mockImplementationOnce(() => shutdown.promise)
  const stopped = command('dsh.stop')
  const reopening = command('dsh.open')
  const repeated = command('dsh.open')
  try {
    shutdown.release(undefined)
    await Promise.all([stopped, reopening, repeated])
    expect(state.start).toHaveBeenCalledTimes(2)
    expect(state.connect).toHaveBeenCalledTimes(2)
  } finally {
    shutdown.release(undefined)
    await Promise.all([stopped, reopening, repeated])
  }
})

it.each(['stop', 'deactivate', 'trust', 'dispose'])('cancels a queued replacement on %s without late startup', async (mode) => {
  const entered = barrier<undefined>()
  const credential = barrier<string | undefined>()
  state.secret.mockImplementationOnce(() => { entered.release(undefined); return credential.promise })
  initialize()
  const first = new TestView()
  state.resolve!(first)
  const opening = command('dsh.open')
  let replacement: Promise<unknown> | undefined
  let stopped: Promise<unknown> | undefined
  try {
    await entered.promise
    first.dispose()
    const second = new TestView()
    state.resolve!(second)
    replacement = command('dsh.open')
    if (mode === 'stop') stopped = command('dsh.stop')
    if (mode === 'deactivate') stopped = deactivate()
    if (mode === 'trust') state.trusted = false
    if (mode === 'dispose') second.dispose()
    credential.release(undefined)
    await Promise.all([opening, replacement, stopped])
    expect(state.start).not.toHaveBeenCalled()
    expect(state.connect).not.toHaveBeenCalled()
    expect(state.secret).toHaveBeenCalledOnce()
  } finally {
    credential.release(undefined)
    await Promise.all([opening, replacement, stopped])
  }
})

it.each(['stop', 'trust'])('disposes a late transport on %s without mounting the client', async (mode) => {
  const entered = barrier<undefined>()
  const connection = { dispose: state.disconnect, receive: vi.fn() }
  const transport = barrier<typeof connection>()
  state.connect.mockImplementationOnce(() => { entered.release(undefined); return transport.promise })
  initialize()
  const view = new TestView()
  state.resolve!(view)
  const opening = command('dsh.open')
  let stopped: Promise<unknown> | undefined
  try {
    await entered.promise
    if (mode === 'stop') stopped = command('dsh.stop')
    else state.trusted = false
    transport.release(connection)
    await Promise.all([opening, stopped])
    expect(state.disconnect).toHaveBeenCalledOnce()
    expect(view.webview.html).not.toContain('fixture-client')
  } finally {
    transport.release(connection)
    await Promise.all([opening, stopped])
  }
})

it.each(['untrusted', 'remote', 'multi-root', 'virtual'])('refuses %s workspaces before accessing credentials or processes', async (mode) => {
  if (mode === 'untrusted') state.trusted = false
  if (mode === 'remote') state.remote = 'ssh-remote'
  if (mode === 'multi-root') state.folders.push({ uri: { scheme: 'file', fsPath: '/other' } })
  if (mode === 'virtual') state.folders[0]!.uri.scheme = 'vscode-vfs'
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

it('rechecks trust after resolving Desktop configuration', async () => {
  let release!: (home: string | undefined) => void
  state.desktop.mockReturnValue(new Promise<string | undefined>((resolve) => { release = resolve }))
  const opening = open()
  await vi.waitFor(() => { expect(state.desktop).toHaveBeenCalledOnce() })
  state.trusted = false
  release('/desktop')
  await opening
  expect(state.start).not.toHaveBeenCalled()
})

it('supplies its own runtime for a new shared home without requiring Desktop registration', async () => {
  state.start.mockRejectedValueOnce(new Error('Fixture ends at runtime startup'))
  await open()
  expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ desktopHome: '/new-shared-home', sharedRuntime: '/runtime' }))
})
