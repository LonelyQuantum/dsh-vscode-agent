/** Authenticated, route-limited byte transport between one Webview and its owned DSH Host. */
import WebSocket from 'ws'

/** Shared envelope marker prevents accidental handling of unrelated editor messages. */
export const CHANNEL = 'dsh-vscode'
/** Development upload limit; larger attachments fail explicitly before forwarding. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024
type Send = (message: object) => PromiseLike<boolean>
interface Transfer { controller: AbortController; reader?: ReadableStreamDefaultReader<Uint8Array>; reading: boolean }

/**
 * Validate a path without allowing an arbitrary authority or traversal.
 * @param path Webview-supplied path.
 * @returns Admitted relative path.
 */
export function admittedPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n#]/.test(path)) throw new Error('Unsupported DSH route')
  const decoded = decodeURIComponent(path.split('?')[0] ?? '')
  if (decoded.split('/').some(part => part === '.' || part === '..') || decoded.includes('\\')) throw new Error('Invalid DSH path')
  if (!(path.startsWith('/api/') || path.startsWith('/plugins/'))) throw new Error('Unsupported DSH route')
  return path
}

/** One panel's proxy. Closing a panel releases its requests but not the shared runtime. */
export class HostProxy {
  private readonly transfers = new Map<number, Transfer>()
  private readonly sockets = new Map<number, WebSocket>()
  private readonly tasks = new Set<Promise<void>>()
  private disposed = false
  private readonly nativeLifetime = new AbortController()
  private constructor(private readonly origin: string, private readonly cookie: string, private readonly send: Send) {}

  /**
   * Exchange the private launch URL for a cookie.
   * @param launchUrl Owned child URL.
   * @param send Panel-owned sender.
   * @returns Authenticated proxy.
   */
  static async connect(launchUrl: string, send: Send): Promise<HostProxy> {
    const url = new URL(launchUrl)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) throw new Error('DSH must use owned loopback HTTP')
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    await response.body?.cancel()
    if (response.status !== 303 || !cookie) throw new Error('DSH authentication failed')
    return new HostProxy(url.origin, cookie, send)
  }

  /**
   * Read complete versions from the fixed captured-content route for native review.
   * @param sessionId Capture owner.
   * @param seq Announcing event sequence.
   * @param index Original summary index.
   * @returns Bounded JSON; disposal aborts and awaits the request.
   */
  readCaptured(sessionId: string, seq: number, index: number): Promise<unknown> {
    const work = (async (): Promise<unknown> => {
      const signal = AbortSignal.any([this.nativeLifetime.signal, AbortSignal.timeout(15_000)])
      signal.throwIfAborted()
      const query = new URLSearchParams({ sessionId, seq: String(seq), index: String(index) })
      const response = await fetch(new URL(`/api/changes.contents?${query}`, this.origin), {
        headers: { cookie: this.cookie }, redirect: 'manual', signal,
      })
      if (!response.ok || response.body === null) {
        await response.body?.cancel()
        throw new Error(response.status === 404 ? 'expired' : 'capture-unavailable')
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        for (;;) {
          const next = await reader.read()
          if (next.done) return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
          bytes += next.value.byteLength
          if (bytes > 24 * 1024 * 1024) throw new Error('oversized')
          chunks.push(next.value)
        }
      } finally { await reader.cancel().catch(() => {}) }
    })()
    const settled = work.then(() => {}, () => {})
    this.tasks.add(settled)
    void settled.then(() => { this.tasks.delete(settled) })
    return work
  }

  /** Validate and dispatch a Webview wire message. @param raw Untrusted message from the panel. */
  receive(raw: unknown): void {
    if (this.disposed || typeof raw !== 'object' || raw === null) return
    const message = raw as Record<string, unknown>
    if (message.channel !== CHANNEL || !Number.isSafeInteger(message.id) || Number(message.id) < 1) return
    const id = Number(message.id)
    const task = this.dispatch(id, message).catch(async () => {
      await this.reply(id, 'error', { error: 'DSH transport request failed' })
    })
    this.tasks.add(task)
    void task.finally(() => this.tasks.delete(task))
  }

  private async reply(id: number, kind: string, fields: object = {}): Promise<void> {
    if (this.disposed) return
    try { await this.send({ channel: CHANNEL, id, kind, ...fields }) }
    catch { /* VS Code can reject delivery after the panel closes; its disposer releases this proxy. */ }
  }

  private async dispatch(id: number, message: Record<string, unknown>): Promise<void> {
    switch (message.kind) {
      case 'fetch': {
        if (this.transfers.has(id) || this.transfers.size >= 32 || typeof message.path !== 'string') throw new Error('Invalid request')
        const path = admittedPath(message.path)
        const method = message.method
        if (typeof method !== 'string' || !['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('Invalid method')
        if (path.startsWith('/plugins/') && method !== 'GET') throw new Error('Read-only assets')
        if (message.body !== undefined && (typeof message.body !== 'string' || message.body.length > Math.ceil(MAX_BODY_BYTES / 3) * 4)) {
          throw new Error('Upload too large')
        }
        const headers = new Headers({ cookie: this.cookie })
        if (typeof message.contentType === 'string') headers.set('content-type', message.contentType)
        const controller = new AbortController()
        const transfer: Transfer = { controller, reading: false }
        this.transfers.set(id, transfer)
        try {
          const response = await fetch(new URL(path, this.origin), {
            method, headers, redirect: 'manual', signal: controller.signal,
            ...(typeof message.body === 'string' ? { body: Buffer.from(message.body, 'base64') } : {}),
          })
          if (response.status >= 300 && response.status < 400) throw new Error('Redirects are not forwarded')
          if (response.body) transfer.reader = response.body.getReader()
          const outgoing: Record<string, string> = {}
          for (const key of ['content-type', 'content-disposition']) {
            const value = response.headers.get(key)
            if (value !== null) outgoing[key] = value
          }
          await this.reply(id, 'headers', { status: response.status, headers: outgoing, body: transfer.reader !== undefined })
          if (!transfer.reader) this.transfers.delete(id)
        } catch (error) { this.transfers.delete(id); controller.abort(); throw error }
        return
      }
      case 'pull': {
        const transfer = this.transfers.get(id)
        if (!transfer?.reader || transfer.reading) return
        transfer.reading = true
        try {
          const result = await transfer.reader.read()
          transfer.reading = false
          if (result.done) { this.transfers.delete(id); await this.reply(id, 'end') }
          else await this.reply(id, 'chunk', { data: Buffer.from(result.value).toString('base64') })
        } catch (error) {
          this.transfers.delete(id)
          transfer.controller.abort()
          throw error
        } finally { transfer.reading = false }
        return
      }
      case 'cancel': {
        const transfer = this.transfers.get(id)
        this.transfers.delete(id)
        transfer?.controller.abort()
        await transfer?.reader?.cancel().catch(() => {})
        return
      }
      case 'socket-open': {
        if (this.sockets.has(id) || this.sockets.size >= 4) throw new Error('Too many streams')
        const socket = new WebSocket(this.origin.replace('http:', 'ws:') + '/api/remote.mux', {
          headers: { cookie: this.cookie }, maxPayload: 16 * 1024 * 1024, handshakeTimeout: 15_000,
        })
        this.sockets.set(id, socket)
        let pending = 0
        socket.on('open', () => { void this.reply(id, 'socket-open') })
        socket.on('message', (data, binary) => {
          if (binary || ++pending > 128) { socket.terminate(); return }
          const text = (Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)).toString('utf8')
          void this.reply(id, 'socket-message', { data: text }).finally(() => { pending-- })
        })
        socket.on('error', () => { void this.reply(id, 'socket-error') })
        socket.once('close', () => { this.sockets.delete(id); void this.reply(id, 'socket-close') })
        return
      }
      case 'socket-send': {
        const socket = this.sockets.get(id)
        if (!socket || socket.readyState !== WebSocket.OPEN || typeof message.data !== 'string'
          || message.data.length > MAX_BODY_BYTES || socket.bufferedAmount > MAX_BODY_BYTES) throw new Error('Stream unavailable')
        socket.send(message.data)
        return
      }
      case 'socket-close': this.sockets.get(id)?.terminate(); return
      default: throw new Error('Unknown bridge message')
    }
  }

  /** Abort requests and await socket closure and in-flight dispatches. @returns Quiescent transport disposal. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.nativeLifetime.abort()
    for (const transfer of this.transfers.values()) transfer.controller.abort()
    this.transfers.clear()
    await Promise.all([...this.sockets.values()].map(socket => new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) { resolve(); return }
      socket.once('close', () => { resolve() })
      socket.terminate()
    })))
    await Promise.allSettled([...this.tasks])
  }
}
