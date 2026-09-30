/** Desktop lifecycle adapter for the home-wide shared backend. */
import { acquireSharedHost, type DesktopLaunch, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { isDesktopHostEvent, type DesktopHostReady, type DesktopQuitInspection } from './host-process.ts'

/** Desktop alone can prepare its profile and publish trusted launch locations. */
export interface SharedDesktopOptions {
  home: string
  version: string
  launch: DesktopLaunch
  inspectPort?: number | undefined
  prepare(): Promise<void>
  failure(error: Error): void
  platformSession(session: PlatformSession | null): void
}

/** Releasing the Desktop lease preserves backend work while VS Code is attached. */
export class SharedDesktopHost {
  private pending: Promise<SharedHostClient> | undefined
  private client: SharedHostClient | undefined
  private stopping: Promise<void> | undefined
  private closed = false
  /** @param options Desktop-owned home, launch facts, and shell callbacks. */
  constructor(private readonly options: SharedDesktopOptions) {}

  /** Acquire one shared lease. @returns Authenticated boot data for the native shell. */
  async start(): Promise<DesktopHostReady> {
    if (this.closed) throw new Error('Desktop backend attachment is closed')
    const options = this.options
    this.pending ??= acquireSharedHost({ home: options.home, version: options.version, role: 'desktop',
      launch: options.launch, inspectPort: options.inspectPort, prepare: () => options.prepare(), platformSession: (session) => {
        const event = { type: 'platform-session', session }
        if (!isDesktopHostEvent(event)) {
          options.failure(new Error('Shared backend sent an invalid platform session')); return
        }
        if (!this.closed) options.platformSession(event.session)
      } })
    const client = await this.pending
    this.client = client
    // stop() can close this carrier while native acquisition is pending.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.closed) { await client.close(); throw new Error('Desktop startup was cancelled') }
    client.onExit(() => { if (!this.closed) options.failure(new Error('Shared backend disconnected; reopen Desktop to reconnect')) })
    return client.ready
  }

  /** Inspect or reserve exclusive update access. @param action Update operation. @returns Whether work is active. */
  async updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean> {
    if (!this.client) throw new Error('Shared backend is unavailable')
    const result = await this.client.control(action === 'inspect' ? 'inspect-update' : action === 'lock' ? 'lock-update' : 'unlock-update')
    if (typeof result !== 'boolean') throw new Error('Invalid shared backend update response')
    return result
  }

  /** Inspect work that quitting the last client interrupts. @returns Product-owned task facts. */
  async inspectQuit(): Promise<DesktopQuitInspection> {
    const result = await this.client?.control('inspect-quit')
    if (typeof result !== 'object' || result === null || !('activeTasks' in result) || typeof result.activeTasks !== 'boolean'
      || !('scheduledTasks' in result) || typeof result.scheduledTasks !== 'boolean') throw new Error('Invalid shared backend quit response')
    return { activeTasks: result.activeTasks, scheduledTasks: result.scheduledTasks }
  }

  /** Release the Desktop lease. @param exclusive Require sole ownership for installation. @returns Socket and pending-start cleanup. */
  stop(exclusive = false): Promise<void> {
    this.closed = true
    return this.stopping ??= (async () => {
      const client = this.client ?? await this.pending?.catch(() => undefined)
      try { await client?.close(exclusive) } catch (error) {
        if (exclusive) { this.closed = false; this.stopping = undefined }
        throw error
      } finally { if (this.closed) this.options.platformSession(null) }
    })()
  }
}
