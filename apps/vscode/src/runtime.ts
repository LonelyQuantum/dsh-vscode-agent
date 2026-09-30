/** Attach to the shared Desktop backend or own an isolated editor profile process. */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireSharedHost, SharedHostError, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'

/** Child boot information, never forwarded verbatim to the Webview. */
export interface RuntimeReady { url: string; injections: unknown[]; pid: number }
/** Explicit CLI installation, version, private data directory, and external Node executable. */
export interface RuntimeOptions {
  node: string
  installation: string
  version: string
  entry: string
  workspace: string
  home: string
  apiKey?: string
  /** Shared Desktop backend home; private home is unused in shared mode. */
  desktopHome?: string
}

/** The child's Harness home could not be locked; no profile was started. */
export class RuntimeOwnershipError extends Error {}

/** Native backend attachment with readiness validation and awaited lease or child cleanup. */
export class AgentRuntime {
  private readonly exitListeners = new Set<() => void>()
  private child: ChildProcess | undefined
  private exited: Promise<void> = Promise.resolve()
  private stopping: Promise<void> | undefined
  private shared: Promise<SharedHostClient> | undefined

  /** Observe post-readiness exit. @param listener Receives no raw process output. @returns Listener disposer. */
  onExit(listener: () => void): () => void {
    this.exitListeners.add(listener)
    return () => { this.exitListeners.delete(listener) }
  }

  /**
   * Start once; failed startup drains the child before rejecting.
   * @param options Explicit local launch locations.
   * @returns Authenticated boot data.
   */
  async start(options: RuntimeOptions): Promise<RuntimeReady> {
    if (this.child || this.shared) throw new Error('DSH runtime is already started')
    if (options.desktopHome !== undefined) {
      this.shared = acquireSharedHost({ home: options.desktopHome, version: options.version, role: 'vscode' }).catch(() => {
        throw new SharedHostError('Shared Desktop backend is unavailable')
      })
      const client = await this.shared
      if (this.stopping) { await client.close(); throw new Error('DSH startup was cancelled') }
      client.onExit(() => { for (const listener of this.exitListeners) listener() })
      return client.ready
    }
    await readFile(join(options.installation, 'lib/profile-boot.js'))
    await mkdir(options.home, { recursive: true })
    if (this.stopping) throw new Error('DSH startup was cancelled')
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: options.home }
    if (options.apiKey !== undefined) env.DEEPSEEK_API_KEY = options.apiKey
    delete env.DSH_VSCODE_DESKTOP_HOME
    delete env.NODE_OPTIONS
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(options.node, [options.entry, options.installation, options.version], {
      cwd: options.workspace, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    this.child = child
    let ready = false
    this.exited = new Promise((resolve) => { child.once('close', () => {
      resolve()
      if (ready) for (const listener of this.exitListeners) listener()
    }) })
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
          if (value.type === 'ownership') { fail(new RuntimeOwnershipError('DSH runtime home is unavailable')); return }
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
          ready = true
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

  /** Release the shared lease or stop the isolated child; repeated callers join cleanup. @returns Completed native attachment cleanup. */
  stop(): Promise<void> {
    return this.stopping ??= this.stopChild()
  }

  private async stopChild(): Promise<void> {
    if (this.shared) {
      const client = await this.shared.catch(() => undefined)
      await client?.close()
      return
    }
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
