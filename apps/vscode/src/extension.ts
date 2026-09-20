/** VS Code-owned lifecycle for the local DSH application preview. */
import * as vscode from 'vscode'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentRuntime, type RuntimeReady } from './runtime.ts'
import { CHANNEL, HostProxy } from './proxy.ts'
import { webviewDocument } from './document.ts'
import { extensionCopy } from './locale.ts'
import { captureEditor, openWorkspaceFile, SnapshotDocuments } from './native-context.ts'
import { capturedPair } from './review.ts'

let stopExtension: (() => Promise<void>) | undefined

/** Non-sensitive development diagnostics returned to Extension Host tooling. */
export interface PreviewDiagnostics {
  boot: boolean
  rpc: number
  assets: number
  socket: boolean
  clientFailure: boolean
  pid?: number
  editorUI?: boolean
}

/**
 * Register editor commands without starting a process during activation.
 * @param context VS Code-owned extension lifetime.
 * @returns Non-sensitive diagnostics for development tooling.
 */
export function activate(context: vscode.ExtensionContext): { diagnostics(): PreviewDiagnostics } {
  let diagnostics: PreviewDiagnostics = { boot: false, rpc: 0, assets: 0, socket: false, clientFailure: false }
  const text = extensionCopy(vscode.env.language)
  const snapshots = new SnapshotDocuments()
  context.subscriptions.push(snapshots)
  let runtime: AgentRuntime | undefined
  let booting: Promise<RuntimeReady> | undefined
  let panel: vscode.WebviewView | undefined
  let closeActive: (() => void) | undefined
  let proxy: HostProxy | undefined
  let opening: Promise<void> | undefined
  let stopping: Promise<void> | undefined
  const pendingDisposals = new Set<Promise<void>>()
  const disposeProxy = (previous: HostProxy | undefined): void => {
    if (!previous) return
    const done = previous.dispose()
    pendingDisposals.add(done)
    void done.finally(() => pendingDisposals.delete(done))
  }
  const stop = (): Promise<void> => {
    const activeOpening = opening
    return stopping ??= (async () => {
      closeActive?.()
      if (panel) panel.webview.html = `<html><body><p>${text.stopped}</p></body></html>`
      await runtime?.stop()
      await activeOpening?.catch(() => {})
      await Promise.allSettled(pendingDisposals)
      runtime = undefined
      booting = undefined
      stopping = undefined
    })()
  }
  const open = async (): Promise<void> => {
    if (stopping) await stopping
    const current = panel
    if (!current) return
    current.show(true)
    if (proxy) return
    const folders = vscode.workspace.workspaceFolders
    if (!vscode.workspace.isTrusted || vscode.env.remoteName || folders?.length !== 1 || folders[0]?.uri.scheme !== 'file') {
      await vscode.window.showWarningMessage(text.workspace); return
    }
    const workspace = folders[0].uri.fsPath
    current.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] }
    diagnostics = { boot: false, rpc: 0, assets: 0, socket: false, clientFailure: false }
    const lifetime = { closed: false }
    const nativeLifetime = new AbortController()
    const isClosed = (): boolean => lifetime.closed
    const bindings: vscode.Disposable[] = []
    closeActive = () => {
      lifetime.closed = true
      nativeLifetime.abort()
      disposeProxy(proxy)
      proxy = undefined
      for (const binding of bindings) binding.dispose()
      closeActive = undefined
    }
    current.webview.html = `<html><body><p>${text.starting}</p></body></html>`
    try {
      if (!booting) {
        const metadata = JSON.parse(await readFile(join(context.extensionPath, 'development.json'), 'utf8')) as { repository: string }
        const apiKey = await context.secrets.get('deepseek.apiKey')
        if (isClosed()) return
        const config = vscode.workspace.getConfiguration('dsh')
        const repository = config.get<string>('repositoryPath') || metadata.repository
        runtime = new AgentRuntime()
        const owner = runtime
        owner.onExit(() => {
          if (stopping || runtime !== owner) return
          closeActive?.()
          runtime = undefined
          booting = undefined
          diagnostics.clientFailure = true
          delete diagnostics.pid
          if (panel) panel.webview.html = `<html><body><p>${text.crashed}</p></body></html>`
        })
        booting = runtime.start({ node: config.get<string>('nodePath') || 'node', repository,
          entry: join(context.extensionPath, 'host.mjs'), workspace,
          ...(apiKey === undefined ? {} : { apiKey }),
          home: join(context.globalStorageUri.fsPath, 'homes', createHash('sha256').update(workspace).digest('hex').slice(0, 24)) })
      }
      const ready = await booting
      diagnostics.pid = ready.pid
      if (isClosed()) return
      const activeProxy = await HostProxy.connect(ready.url, (message) => {
        if ('kind' in message && message.kind === 'socket-open') diagnostics.socket = true
        return current.webview.postMessage(message)
      })
      if (isClosed()) { await activeProxy.dispose(); return }
      proxy = activeProxy
      let capturing = false
      let reviewing = false
      const receive = current.webview.onDidReceiveMessage((message: unknown) => {
        if (lifetime.closed || !vscode.workspace.isTrusted) return
        if (typeof message === 'object' && message !== null && 'channel' in message && message.channel === CHANNEL) {
          if ('kind' in message && message.kind === 'native-file' && 'path' in message && typeof message.path === 'string'
            && 'cwd' in message && typeof message.cwd === 'string' && message.cwd.length <= 4096
            && message.path.length <= 4096 && (!('line' in message) || message.line === undefined
              || typeof message.line === 'number' && Number.isSafeInteger(message.line) && message.line > 0)) {
            void openWorkspaceFile(workspace, message.path,
              'line' in message ? message.line as number | undefined : undefined, message.cwd, nativeLifetime.signal)
              .catch(() => { if (!isClosed()) void vscode.window.showWarningMessage(text.fileFailed) })
            return
          }
          if ('kind' in message && message.kind === 'native-diff' && 'sessionId' in message && typeof message.sessionId === 'string'
            && message.sessionId.length > 0 && message.sessionId.length <= 256 && 'seq' in message && 'index' in message
            && Number.isSafeInteger(message.seq) && Number(message.seq) >= 0
            && Number.isSafeInteger(message.index) && Number(message.index) >= 0) {
            if (reviewing) return
            reviewing = true
            void activeProxy.readCaptured(message.sessionId, Number(message.seq), Number(message.index)).then(async (value) => {
              if (!isClosed() && vscode.workspace.isTrusted) await snapshots.diff(capturedPair(value))
            }).catch((error: unknown) => {
              if (!isClosed()) void vscode.window.showWarningMessage(error instanceof Error && error.message === 'expired'
                ? text.diffExpired : error instanceof Error && (error.message === 'binary' || error.message === 'oversized')
                  ? text.diffUnsupported : text.previewFailed)
            }).finally(() => { reviewing = false })
            return
          }
          if ('kind' in message && message.kind === 'native-capture' && 'id' in message && Number.isSafeInteger(message.id)
            && 'capture' in message && (message.capture === 'file' || message.capture === 'selection' || message.capture === 'problems')) {
            const id = message.id
            if (capturing) {
              void current.webview.postMessage({ channel: CHANNEL, kind: 'native-result', id, ok: false })
              return
            }
            capturing = true
            void captureEditor(message.capture, workspace).then((value) => {
              if (!isClosed() && vscode.workspace.isTrusted) void current.webview.postMessage({ channel: CHANNEL, kind: 'native-result', id, ok: true, ...value })
            }).catch(() => {
              if (!isClosed()) void current.webview.postMessage({ channel: CHANNEL, kind: 'native-result', id, ok: false })
            }).finally(() => { capturing = false })
            return
          }
          if ('kind' in message && message.kind === 'native-preview' && 'text' in message && typeof message.text === 'string') {
            void snapshots.preview(message.text).catch(() => { void vscode.window.showWarningMessage(text.previewFailed) })
            return
          }
          if ('kind' in message && message.kind === 'native-configure') {
            void vscode.commands.executeCommand('dsh.configure')
            return
          }
          if ('kind' in message && message.kind === 'ui-ready' && 'mounted' in message) {
            diagnostics.editorUI = message.mounted === true
            return
          }
          if ('kind' in message && message.kind === 'client-failure') {
            diagnostics.clientFailure = true
            return
          }
          if ('kind' in message && message.kind === 'fetch' && 'path' in message && typeof message.path === 'string') {
            if (message.path.startsWith('/api/')) diagnostics.rpc++
            if (message.path.startsWith('/plugins/')) diagnostics.assets++
          }
        }
        if (typeof message === 'object' && message !== null && 'channel' in message && message.channel === CHANNEL
          && 'kind' in message && message.kind === 'boot' && 'id' in message && Number.isSafeInteger(message.id)) {
          void current.webview.postMessage({ channel: CHANNEL, kind: 'boot', id: message.id, injections: ready.injections, workspace })
          diagnostics.boot = true
        } else activeProxy.receive(message)
      })
      bindings.push(receive)
      const index = await readFile(join(context.extensionPath, 'web/index.html'), 'utf8')
      if (!isClosed()) current.webview.html = webviewDocument(index,
        path => current.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, path)).toString(),
        current.webview.cspSource, randomBytes(24).toString('hex'))
    } catch {
      diagnostics.clientFailure = true
      if (!lifetime.closed) current.webview.html = `<html><body><p>${text.failed}</p></body></html>`
      disposeProxy(proxy)
      proxy = undefined
      await runtime?.stop()
      runtime = undefined
      booting = undefined
    }
  }
  const requestOpen = (): Promise<void> => {
    if (opening) return opening
    opening = open().finally(() => { opening = undefined })
    return opening
  }
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('dsh.agent', {
      resolveWebviewView(view) {
        panel = view
        view.onDidDispose(() => { closeActive?.(); if (panel === view) panel = undefined })
        void requestOpen()
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('dsh.open', async () => {
      await vscode.commands.executeCommand('dsh.agent.focus')
      await requestOpen()
    }),
    vscode.commands.registerCommand('dsh.stop', stop),
    vscode.commands.registerCommand('dsh.restart', async () => { await stop(); await requestOpen() }),
    vscode.commands.registerCommand('dsh.configure', async () => {
      const key = await vscode.window.showInputBox({ title: text.apiKey, password: true, ignoreFocusOut: true })
      if (key === undefined || key.trim() === '') return
      await context.secrets.store('deepseek.apiKey', key.trim())
      await vscode.window.showInformationMessage(text.configured)
    }),
    vscode.commands.registerCommand('dsh.clearApiKey', async () => {
      await context.secrets.delete('deepseek.apiKey')
      await vscode.window.showInformationMessage(text.removed)
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void stop() }),
  )
  stopExtension = stop
  return { diagnostics: () => ({ ...diagnostics }) }
}

/** Await the owned runtime and transport shutdown. @returns Completion after the extension releases its resources. */
export async function deactivate(): Promise<void> { await stopExtension?.() }
