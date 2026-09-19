/** VS Code-owned lifecycle for the local DSH application preview. */
import * as vscode from 'vscode'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentRuntime, type RuntimeReady } from './runtime.ts'
import { CHANNEL, HostProxy } from './proxy.ts'
import { webviewDocument } from './document.ts'

let stopExtension: (() => Promise<void>) | undefined

/** Non-sensitive development diagnostics returned to Extension Host tooling. */
export interface PreviewDiagnostics {
  boot: boolean
  rpc: number
  assets: number
  socket: boolean
  clientFailure: boolean
  pid?: number
  reason?: string
}

/**
 * Register editor commands without starting a process during activation.
 * @param context VS Code-owned extension lifetime.
 * @returns Non-sensitive diagnostics for development tooling.
 */
export function activate(context: vscode.ExtensionContext): { diagnostics(): PreviewDiagnostics } {
  let diagnostics: PreviewDiagnostics = { boot: false, rpc: 0, assets: 0, socket: false, clientFailure: false }
  const chinese = vscode.env.language.toLowerCase().startsWith('zh')
  const text = {
    title: chinese ? 'DSH Agent 开发预览' : 'DSH Agent Development Preview',
    workspace: chinese ? '此预览需要一个已信任的本地文件夹，不支持多根工作区或远程窗口。'
      : 'This preview requires one trusted local folder; multi-root and remote windows are not supported.',
    starting: chinese ? '正在启动 DSH…' : 'Starting DSH…',
    failed: chinese ? 'DSH 启动失败。请检查 Node 路径并构建 DSH 仓库。' : 'DSH failed to start. Check the Node path and build the DSH repository.',
  }
  let runtime: AgentRuntime | undefined
  let booting: Promise<RuntimeReady> | undefined
  let panel: vscode.WebviewPanel | undefined
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
      panel?.dispose()
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
    if (panel) { panel.reveal(); return }
    const folders = vscode.workspace.workspaceFolders
    if (!vscode.workspace.isTrusted || vscode.env.remoteName || folders?.length !== 1 || folders[0]?.uri.scheme !== 'file') {
      await vscode.window.showWarningMessage(text.workspace); return
    }
    const workspace = folders[0].uri.fsPath
    const current = vscode.window.createWebviewPanel('dsh.agent', text.title, vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri],
    })
    panel = current
    diagnostics = { boot: false, rpc: 0, assets: 0, socket: false, clientFailure: false }
    const lifetime = { closed: false }
    const isClosed = (): boolean => lifetime.closed
    current.onDidDispose(() => {
      lifetime.closed = true
      if (panel === current) { panel = undefined; disposeProxy(proxy); proxy = undefined }
    })
    current.webview.html = `<html><body><p>${text.starting}</p></body></html>`
    try {
      if (!booting) {
        const metadata = JSON.parse(await readFile(join(context.extensionPath, 'development.json'), 'utf8')) as { repository: string }
        if (isClosed()) return
        const config = vscode.workspace.getConfiguration('dsh')
        const repository = config.get<string>('repositoryPath') || metadata.repository
        runtime = new AgentRuntime()
        booting = runtime.start({ node: config.get<string>('nodePath') || 'node', repository,
          entry: join(context.extensionPath, 'host.mjs'), workspace,
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
      const receive = current.webview.onDidReceiveMessage((message: unknown) => {
        if (lifetime.closed || !vscode.workspace.isTrusted) return
        if (typeof message === 'object' && message !== null && 'channel' in message && message.channel === CHANNEL) {
          if ('kind' in message && message.kind === 'client-failure') {
            diagnostics.clientFailure = true
            if ('reason' in message && typeof message.reason === 'string') diagnostics.reason = message.reason.slice(0, 400)
            return
          }
          if ('kind' in message && message.kind === 'fetch' && 'path' in message && typeof message.path === 'string') {
            if (message.path.startsWith('/api/')) diagnostics.rpc++
            if (message.path.startsWith('/plugins/')) diagnostics.assets++
          }
        }
        if (typeof message === 'object' && message !== null && 'channel' in message && message.channel === CHANNEL
          && 'kind' in message && message.kind === 'boot' && 'id' in message && Number.isSafeInteger(message.id)) {
          void current.webview.postMessage({ channel: CHANNEL, kind: 'boot', id: message.id, injections: ready.injections })
          diagnostics.boot = true
        } else activeProxy.receive(message)
      })
      current.onDidDispose(() => { receive.dispose() })
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
    vscode.commands.registerCommand('dsh.open', requestOpen),
    vscode.commands.registerCommand('dsh.stop', stop),
    vscode.commands.registerCommand('dsh.restart', async () => { await stop(); await requestOpen() }),
  )
  stopExtension = stop
  return { diagnostics: () => ({ ...diagnostics }) }
}

/** Await the owned runtime and transport shutdown. @returns Completion after the extension releases its resources. */
export async function deactivate(): Promise<void> { await stopExtension?.() }
