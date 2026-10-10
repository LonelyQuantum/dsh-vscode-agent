/** Single-writer backend owner and authenticated native-client leases. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import WebSocket, { WebSocketServer } from 'ws'
import { controlDirectory, writeRecord } from './files.ts'
import { MAX_CONTROL_BYTES, SHARED_PROTOCOL, record, controlText, type ClientRole, type ControlAction, type SharedReady } from './protocol.ts'

/** Product-owned operations; the broker owns transport, leases, and update exclusion only. */
export interface SharedApplication {
  ready: SharedReady
  shutdown(): Promise<void>
  inspectQuit(): Promise<{ activeTasks: boolean; scheduledTasks: boolean }>
  updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean>
}

/** Backend lease owner's immutable inputs. */
export interface ServeSharedHost {
  home: string
  version: string
  /** Boot must use the normal dsh profile runner. */
  start(publishPlatform: (session: unknown) => void): Promise<SharedApplication>
}

const actions = new Set<ControlAction>(['inspect-quit', 'inspect-update', 'lock-update', 'unlock-update', 'release', 'release-exclusive'])

/**
 * Own one Harness home until its last native lease is released and the application stops.
 * A kernel/process crash releases discovery ownership through the existing stale-PID lock policy.
 * @param options Product version, home, and profile boot callback.
 * @returns Completion after application teardown, endpoint removal, and listener closure.
 */
export async function serveSharedHost(options: ServeSharedHost): Promise<void> {
  const directory = await controlDirectory(options.home)
  await withFileLock(join(directory, 'owner'), async () => {
    const token = randomBytes(32).toString('hex')
    const server = createServer((_request, response) => { response.writeHead(404).end() })
    const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_CONTROL_BYTES })
    const clients = new Map<WebSocket, ClientRole>()
    const readyClients = new Set<WebSocket>()
    let updating: WebSocket | undefined
    let shuttingDown: Promise<void> | undefined
    let platformSession: unknown = null
    let acquired = false
    let finish!: () => void
    const finished = new Promise<void>((resolve) => { finish = resolve })
    let application: Promise<SharedApplication> | undefined
    const removeEndpoint = async (): Promise<void> => {
      await unlink(join(directory, 'endpoint.json')).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
    }
    const send = (socket: WebSocket, value: object): void => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value), (error) => { if (error) socket.terminate() })
    }
    const publishPlatform = (session: unknown): void => {
      platformSession = session
      for (const [socket, role] of clients) if (role === 'desktop' && readyClients.has(socket)) send(socket, { type: 'platform-session', session })
    }
    const stop = (): Promise<void> => shuttingDown ??= (async () => {
      const running = await application?.catch(() => undefined)
      await running?.shutdown()
    })()
    const release = async (socket: WebSocket, exclusive: boolean): Promise<{ stopped: boolean }> => {
      if (exclusive && clients.size !== 1) throw new Error('Close the other DSH clients before updating Desktop')
      clients.delete(socket)
      readyClients.delete(socket)
      if (updating === socket) updating = undefined
      if (clients.size === 0) {
        try { await stop(); await removeEndpoint() } catch (error) { finish(); throw error }
        return { stopped: true }
      }
      return { stopped: false }
    }
    server.on('upgrade', (request, socket, head) => {
      const expected = Buffer.from(`Bearer ${token}`)
      const supplied = Buffer.from(request.headers.authorization ?? '')
      const role = request.headers['x-dsh-client']
      if (request.url !== '/lease' || request.headers.origin !== undefined
        || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)
        || request.headers['x-dsh-version'] !== options.version || request.headers['x-dsh-protocol'] !== String(SHARED_PROTOCOL)
        || (role !== 'desktop' && role !== 'vscode') || shuttingDown || updating) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
      }
      sockets.handleUpgrade(request, socket, head, (peer) => { sockets.emit('connection', peer, role) })
    })
    sockets.on('connection', (socket: WebSocket, role: ClientRole) => {
      acquired = true
      clients.set(socket, role)
      socket.on('error', () => { socket.terminate() })
      socket.once('close', () => {
        readyClients.delete(socket)
        if (!clients.delete(socket)) return
        const unlocked = updating === socket
        if (unlocked) updating = undefined
        void (async () => {
          if (clients.size === 0) { try { await stop() } finally { finish() } }
          else if (unlocked) await (await application)?.updateTasks('unlock')
        })().catch(() => { finish() })
      })
      void application?.then((running) => {
        if (!clients.has(socket)) return
        send(socket, { type: 'ready', ...running.ready })
        readyClients.add(socket)
        if (role === 'desktop') send(socket, { type: 'platform-session', session: platformSession })
      }).catch(() => { socket.close(1011) })
      let operations = Promise.resolve()
      socket.on('message', (bytes) => {
        let message: unknown
        try { message = JSON.parse(controlText(bytes)) } catch (_error) { socket.close(1008); return }
        if (!record(message) || message.type !== 'control' || typeof message.id !== 'number' || !Number.isSafeInteger(message.id)
          || typeof message.action !== 'string' || !actions.has(message.action as ControlAction)) {
          socket.close(1008); return
        }
        const id = message.id
        const action = message.action as ControlAction
        operations = operations.then(async () => {
          if (!clients.has(socket)) return
          if (action === 'release' || action === 'release-exclusive') {
            const result = await release(socket, action === 'release-exclusive')
            await new Promise<void>((resolve) => {
              if (socket.readyState !== WebSocket.OPEN) { resolve(); return }
              socket.send(JSON.stringify({ type: 'response', id, result }), () => { resolve() })
            })
            socket.close()
            if (result.stopped) finish()
            return
          }
          if (role !== 'desktop') throw new Error('Only Desktop may control backend updates')
          const running = await application
          if (!running) throw new Error('Shared backend has not started')
          let result: unknown
          switch (action) {
            case 'inspect-quit':
              result = clients.size > 1 ? { activeTasks: false, scheduledTasks: false } : await running.inspectQuit()
              break
            case 'inspect-update':
              result = clients.size > 1 || await running.updateTasks('inspect')
              break
            case 'lock-update':
              if (clients.size > 1) throw new Error('Close the other DSH clients before updating Desktop')
              updating = socket
              try { result = await running.updateTasks('lock') } catch (error) { updating = undefined; throw error }
              break
            case 'unlock-update':
              if (updating !== undefined && updating !== socket) throw new Error('Another client owns the update')
              result = await running.updateTasks('unlock')
              updating = undefined
              break
            default:
              assertNever(action)
          }
          send(socket, { type: 'response', id, result })
        }).catch((_error: unknown) => {
          // Product failures can contain credentials; only fixed control diagnostics cross this channel.
          send(socket, { type: 'response', id, error: 'Shared backend control refused; close other clients before updating Desktop' })
        })
      })
    })
    let idle: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Shared backend listener has no port')
      application = options.start(publishPlatform)
      void application.catch(() => { void stop().then(finish, finish) })
      await writeRecord(join(directory, 'endpoint.json'), { protocol: SHARED_PROTOCOL, version: options.version,
        pid: process.pid, port: address.port, token })
      // A launcher may disappear between spawn and lease acquisition; do not leave an unclaimed daemon.
      idle = setTimeout(() => { if (!acquired) void stop().then(finish, finish) }, 120_000)
      await finished
      await shuttingDown
      await application
    } finally {
      clearTimeout(idle)
      try { await stop() } finally {
        try {
          await removeEndpoint()
        } finally {
          for (const socket of sockets.clients) socket.terminate()
          await new Promise<void>((resolve) => { sockets.close(() => { resolve() }) })
          await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
        }
      }
    }
  }, { waitMs: 10_000 })
}
