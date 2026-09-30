/** Native-carrier leases over one authenticated local Desktop profile process. */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { mkdir, realpath } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import WebSocket from 'ws'
import { controlDirectory, parseEndpoint, parseLaunch, readRecord, writeRecord } from './files.ts'
import { MAX_CONTROL_BYTES, SHARED_PROTOCOL, record, controlText, type ClientRole, type ControlAction, type DesktopLaunch, type Endpoint, type SharedReady } from './protocol.ts'

export type { DesktopLaunch, SharedReady } from './protocol.ts'

/** Shared startup cannot safely reuse another backend version or incomplete discovery data. */
export class SharedHostError extends Error {}

/** One native carrier's attachment; release never kills a backend held by another carrier. */
export class SharedHostClient {
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  private nextId = 1
  private closing = false
  private readonly closed: Promise<void>
  private readonly failures = new Set<() => void>()
  private constructor(private readonly socket: WebSocket, readonly ready: SharedReady,
    private readonly platformSession?: (value: unknown) => void) {
    this.closed = new Promise((resolve) => { socket.once('close', () => {
      for (const pending of this.pending.values()) pending.reject(new SharedHostError('Shared backend connection closed'))
      this.pending.clear()
      if (!this.closing) for (const listener of this.failures) {
        try { listener() } catch (_error) { /* One carrier observer cannot block lease cleanup. */ }
      }
      resolve()
    }) })
    socket.on('message', (data) => {
      let value: unknown
      try { value = JSON.parse(controlText(data)) } catch (_error) { socket.terminate(); return }
      if (!record(value)) { socket.terminate(); return }
      if (value.type === 'platform-session') { this.platformSession?.(value.session); return }
      if (value.type !== 'response' || typeof value.id !== 'number') return
      const pending = this.pending.get(value.id)
      if (!pending) return
      this.pending.delete(value.id)
      if (typeof value.error === 'string') pending.reject(new SharedHostError(value.error))
      else pending.resolve(value.result)
    })
    socket.on('error', () => { socket.terminate() })
  }

  /** Observe an unexpected transport loss. @param listener Credential-free notification. @returns Disposer. */
  onExit(listener: () => void): () => void { this.failures.add(listener); return () => { this.failures.delete(listener) } }

  /**
   * Attach to a validated discovery endpoint; absence/refused transport permits a new launch.
   * Authentication and version refusal never permit another writer.
   * @param endpoint Private endpoint, if present.
   * @param version Exact expected product version.
   * @param role Native client type.
   * @param platformSession Desktop-only private account callback.
   * @returns Live client, or undefined when no listener accepts connections.
   */
  static async connect(endpoint: Endpoint | undefined, version: string, role: ClientRole,
    platformSession?: (value: unknown) => void): Promise<SharedHostClient | undefined> {
    if (!endpoint) return undefined
    const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}/lease`, {
      headers: { authorization: `Bearer ${endpoint.token}`, 'x-dsh-version': version,
        'x-dsh-protocol': String(SHARED_PROTOCOL), 'x-dsh-client': role },
      // Profile startup can occupy the server before it processes the HTTP upgrade.
      maxPayload: MAX_CONTROL_BYTES, handshakeTimeout: 120_000,
    })
    return await new Promise((resolve, reject) => {
      let settled = false
      const finish = (error?: Error, client?: SharedHostClient): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        socket.off('error', failed)
        socket.off('message', message)
        socket.off('close', closed)
        if (!client) { socket.on('error', () => {}); socket.terminate() }
        if (error) reject(error); else resolve(client)
      }
      const timeout = setTimeout(() => { finish(new SharedHostError('Shared backend startup timed out')) }, 120_000)
      const failed = (error: Error): void => {
        if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') finish()
        else finish(new SharedHostError('Shared backend refused connection; close other clients before upgrading', { cause: error }))
      }
      const closed = (): void => { finish(new SharedHostError('Shared backend closed before readiness')) }
      const message = (data: WebSocket.RawData): void => {
        let value: unknown
        try { value = JSON.parse(controlText(data)) } catch (_error) { finish(new SharedHostError('Invalid shared backend handshake')); return }
        if (!record(value) || value.type !== 'ready' || typeof value.url !== 'string'
          || !Array.isArray(value.injections) || typeof value.pid !== 'number' || value.pid !== endpoint.pid) {
          finish(new SharedHostError('Invalid shared backend handshake')); return
        }
        let url: URL
        try { url = new URL(value.url) } catch (_error) { finish(new SharedHostError('Invalid shared backend address')); return }
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) {
          finish(new SharedHostError('Invalid shared backend address')); return
        }
        finish(undefined, new SharedHostClient(socket, { url: value.url, injections: value.injections, pid: value.pid }, platformSession))
      }
      socket.on('error', failed)
      socket.on('message', message)
      socket.once('close', closed)
    })
  }

  /** Send a fixed lifecycle control. @param action Allowed control. @returns Host-owned result, validated by its native consumer. */
  async control(action: ControlAction): Promise<unknown> {
    if (this.socket.readyState !== WebSocket.OPEN) throw new SharedHostError('Shared backend is disconnected')
    const id = this.nextId++
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject })
        timer = setTimeout(() => { reject(new SharedHostError('Shared backend control timed out')) }, 15_000)
        this.socket.send(JSON.stringify({ type: 'control', id, action }), (error) => { if (error) reject(error) })
      })
    } finally { clearTimeout(timer); this.pending.delete(id) }
  }

  /**
   * Release only this lease.
   * @param exclusive Refuse release if an update would affect another client.
   * @returns Quiescent socket closure.
   */
  async close(exclusive = false): Promise<void> {
    if (this.closing) return this.closed
    this.closing = true
    try {
      if (this.socket.readyState === WebSocket.OPEN) await this.control(exclusive ? 'release-exclusive' : 'release')
    } catch (error) {
      if (exclusive && this.socket.readyState === WebSocket.OPEN) { this.closing = false; throw error }
      throw error
    } finally {
      if (this.closing) {
        this.socket.terminate()
        await this.closed
      }
    }
  }
}

/** Inputs to native shared-host acquisition; launch and preparation belong exclusively to Desktop. */
export interface AcquireSharedHost {
  home: string
  version: string
  role: ClientRole
  launch?: DesktopLaunch
  /** Desktop development only; never persisted or applied to an existing backend. */
  inspectPort?: number | undefined
  /** Runs under the startup lock only when no backend is listening. */
  prepare?: () => Promise<void>
  platformSession?: (value: unknown) => void
}

/**
 * Reuse one backend or launch Desktop's saved Node entry, serialized across native clients.
 * No secret or arbitrary environment value is persisted in the launch record.
 * @param options Trusted native-carrier choices, never Webview input.
 * @returns One lease with authenticated boot data.
 */
export async function acquireSharedHost(options: AcquireSharedHost): Promise<SharedHostClient> {
  if (options.launch) await mkdir(options.home, { recursive: true, mode: 0o700 })
  const home = await realpath(options.home)
  const directory = await controlDirectory(home)
  const connect = async (): Promise<SharedHostClient | undefined> => SharedHostClient.connect(
    parseEndpoint(await readRecord(join(directory, 'endpoint.json'))), options.version, options.role, options.platformSession)
  return await withFileLock(join(directory, 'startup'), async () => {
    const existing = await connect()
    if (existing) return existing
    await options.prepare?.()
    const launch = parseLaunch(options.launch ?? await readRecord(join(directory, 'launch.json')))
    if (launch.version !== options.version) throw new SharedHostError('Desktop and VS Code must use the same DSH version')
    if (options.launch) await writeRecord(join(directory, 'launch.json'), launch)
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: home, DSH_SHARED_HOST: '1',
      DSH_SHARED_VERSION: launch.version, ELECTRON_RUN_AS_NODE: '1' }
    delete env.NODE_OPTIONS
    delete env.DSH_VSCODE_DESKTOP_HOME
    const child = spawn(launch.node, ['--expose-internals',
      ...(options.inspectPort === undefined ? [] : [`--inspect=127.0.0.1:${String(options.inspectPort)}`]),
      join(launch.runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'),
      launch.runtime, join(home, 'profiles/desktop'), launch.primaryRuntime,
      ...(launch.pnpm === undefined ? [] : [launch.pnpm, launch.nodeBin ?? ''])], {
      cwd: join(home, 'profiles/desktop'), env, detached: true, windowsHide: true, stdio: 'ignore',
    })
    let failure: Error | undefined
    child.once('error', () => { failure = new SharedHostError('Shared backend executable is unavailable') })
    child.once('exit', () => { failure = new SharedHostError('Shared backend exited during startup') })
    const closed = new Promise<void>((resolve) => { child.once('close', () => { resolve() }) })
    child.unref()
    const deadline = Date.now() + 120_000
    try {
      while (Date.now() < deadline) {
        const client = await connect()
        if (client) return client
        if (failure) throw failure
        await delay(50)
      }
      throw new SharedHostError('Shared backend did not publish its endpoint')
    } catch (error) {
      // The startup lock excludes other launchers until this unclaimed child exits.
      const escalation = setTimeout(() => { child.kill('SIGKILL') }, 10_000)
      child.kill('SIGTERM')
      try { await closed } finally { clearTimeout(escalation) }
      throw error
    }
  }, { waitMs: 130_000 })
}

/**
 * Exclude both launchers and a live backend during destructive profile recovery.
 * @param home Desktop Harness home.
 * @param operation Desktop-owned repair operation.
 * @returns Operation result after both shared-host locks are acquired.
 */
export async function withStoppedSharedHost<T>(home: string, operation: () => Promise<T>): Promise<T> {
  const directory = await controlDirectory(home)
  return await withFileLock(join(directory, 'startup'), async () =>
    withFileLock(join(directory, 'owner'), operation, { waitMs: 5000 }), { waitMs: 5000 })
}
