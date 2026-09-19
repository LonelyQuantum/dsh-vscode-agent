/** Own one DSH profile process; credentials remain in the Extension Host. */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Child boot information, never forwarded verbatim to the Webview. */
export interface RuntimeReady { url: string; injections: unknown[]; pid: number }
/** Local development runtime locations and executable. */
export interface RuntimeOptions { node: string; repository: string; entry: string; workspace: string; home: string; apiKey?: string }

/** Owned process with a readiness handshake and awaited shutdown. */
export class AgentRuntime {
  private child: ChildProcess | undefined
  private exited: Promise<void> = Promise.resolve()
  private stopping: Promise<void> | undefined

  /**
   * Start once; failed startup drains the child before rejecting.
   * @param options Explicit local launch locations.
   * @returns Authenticated boot data.
   */
  async start(options: RuntimeOptions): Promise<RuntimeReady> {
    if (this.child) throw new Error('DSH runtime is already started')
    await readFile(join(options.repository, 'apps/cli/lib/profile-boot.js'))
    await mkdir(options.home, { recursive: true })
    if (this.stopping) throw new Error('DSH startup was cancelled')
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: options.home }
    if (options.apiKey !== undefined) env.DEEPSEEK_API_KEY = options.apiKey
    delete env.NODE_OPTIONS
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(options.node, [options.entry, options.repository], {
      cwd: options.workspace, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    this.child = child
    this.exited = new Promise((resolve) => { child.once('close', () => { resolve() }) })
    try {
      return await new Promise<RuntimeReady>((resolve, reject) => {
        const timeout = setTimeout(() => { fail(new Error('DSH startup timed out after 120 seconds')) }, 120_000)
        const cleanup = (): void => {
          clearTimeout(timeout)
          child.off('message', message)
          child.off('error', fail)
          child.off('exit', exited)
        }
        const fail = (error: Error): void => { cleanup(); reject(error) }
        const exited = (): void => { fail(new Error('DSH exited before readiness; verify the repository build and Node version')) }
        const message = (value: unknown): void => {
          if (typeof value !== 'object' || value === null || !('type' in value)) return
          if (value.type === 'fatal') { exited(); return }
          if (value.type !== 'ready' || !('url' in value) || typeof value.url !== 'string'
            || !('injections' in value) || !Array.isArray(value.injections)) return
          let url: URL
          try { url = new URL(value.url) }
          catch { fail(new Error('DSH reported an invalid URL')); return }
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) {
            fail(new Error('DSH reported an invalid loopback address')); return
          }
          cleanup()
          if (child.pid === undefined) { fail(new Error('DSH process identity is missing')); return }
          resolve({ url: url.href, injections: value.injections, pid: child.pid })
        }
        child.on('message', message)
        child.once('error', fail)
        child.once('exit', exited)
      })
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  /** Stop admission and await process exit; repeated callers join the same shutdown. @returns Quiescent child exit. */
  stop(): Promise<void> {
    return this.stopping ??= this.stopChild()
  }

  private async stopChild(): Promise<void> {
    const child = this.child
    if (!child) return
    const kill = async (): Promise<void> => {
      if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        await new Promise<void>((resolve, reject) => { killer.once('close', () => { resolve() }); killer.once('error', reject) })
      } else child.kill('SIGKILL')
    }
    let escalation: Promise<void> | undefined
    const timeout = setTimeout(() => { escalation = kill(); void escalation.catch(() => child.kill()) }, 10_000)
    if (child.connected) child.send({ type: 'shutdown' }, () => {})
    try { await this.exited; await escalation } finally { clearTimeout(timeout); this.child = undefined }
  }
}
