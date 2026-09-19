/** Webview carrier for the unmodified DSH Web entry and Gateway wire frames. */
declare function acquireVsCodeApi(): { postMessage(message: object): void; getState(): unknown; setState(state: object): void }
const editor = acquireVsCodeApi()
const channel = 'dsh-vscode'
let nextId = 0
let workspace: string | undefined
const listeners = new Map<number, (message: Record<string, unknown>) => void>()
const nonce = document.currentScript?.nonce ?? ''
const nativeFetch = globalThis.fetch.bind(globalThis)
const send = (id: number, kind: string, fields: object = {}): void =>{  editor.postMessage({ channel, id, kind, ...fields }) }
window.addEventListener('error', (event) =>{  send(++nextId, 'client-failure', { reason: event.message.slice(0, 400) }) })
window.addEventListener('unhandledrejection', () =>{  send(++nextId, 'client-failure') })
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (typeof event.data !== 'object' || event.data === null) return
  const message = event.data as Record<string, unknown>
  if (message.channel === channel && typeof message.id === 'number') listeners.get(message.id)?.(message)
})

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), char => char.charCodeAt(0))
}

async function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input instanceof Request ? input : new URL(String(input), location.href), init)
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/plugins/')) return nativeFetch(request)
  if (url.origin !== location.origin && url.origin !== 'http://dsh.internal') throw new Error('External DSH requests are not supported')
  request.signal.throwIfAborted()
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Development bridge attachments are limited to 8 MiB')
  request.signal.throwIfAborted()
  const id = ++nextId
  return new Promise<Response>((resolve, reject) => {
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined
    const cleanup = (): void => { listeners.delete(id); request.signal.removeEventListener('abort', aborted) }
    const fail = (error: Error): void => { cleanup(); reject(error); stream?.error(error) }
    const aborted = (): void => { send(id, 'cancel'); fail(new DOMException('Aborted', 'AbortError')) }
    request.signal.addEventListener('abort', aborted, { once: true })
    listeners.set(id, (message) => {
      switch (message.kind) {
        case 'headers': {
          const body = message.body ? new ReadableStream<Uint8Array>({
            start(controller) { stream = controller },
            pull() { send(id, 'pull') },
            cancel() { send(id, 'cancel'); cleanup() },
          }) : null
          resolve(new Response(body, { status: Number(message.status), headers: message.headers as Record<string, string> }))
          if (!body) cleanup()
          break
        }
        case 'chunk': stream?.enqueue(decode(String(message.data))); break
        case 'end': cleanup(); stream?.close(); break
        case 'error': fail(new Error(String(message.error))); break
      }
    })
    send(id, 'fetch', { path: url.pathname + url.search, method: request.method,
      contentType: request.headers.get('content-type') ?? undefined,
      ...(bytes.byteLength ? { body: encode(new Uint8Array(bytes)) } : {}) })
  })
}

/** Gateway-only socket adapter; the upstream Gateway retains framing, reconnect and cancellation. */
class GatewaySocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readyState = GatewaySocket.CONNECTING
  private readonly id = ++nextId
  constructor(url: string | URL) {
    super()
    if (String(url) !== 'ws://dsh.internal/api/remote.mux') throw new Error('Unsupported DSH stream URL')
    listeners.set(this.id, (message) => {
      switch (message.kind) {
        case 'socket-open':
          if (this.readyState !== GatewaySocket.CONNECTING) return
          this.readyState = GatewaySocket.OPEN
          this.dispatchEvent(new Event('open'))
          break
        case 'socket-message': this.dispatchEvent(new MessageEvent('message', { data: message.data })); break
        case 'socket-error':
        case 'error': this.dispatchEvent(new Event('error')); this.close(); break
        case 'socket-close':
          this.readyState = GatewaySocket.CLOSED
          listeners.delete(this.id)
          this.dispatchEvent(new CloseEvent('close'))
          break
      }
    })
    send(this.id, 'socket-open')
  }
  send(data: string): void {
    if (this.readyState !== GatewaySocket.OPEN) throw new Error('DSH stream is not open')
    send(this.id, 'socket-send', { data })
  }
  close(): void {
    if (this.readyState >= GatewaySocket.CLOSING) return
    this.readyState = GatewaySocket.CLOSING
    send(this.id, 'socket-close')
  }
}

async function loadBundle(path: string): Promise<void> {
  const response = await proxyFetch(new URL(path, 'http://dsh.internal'))
  if (!response.ok) throw new Error(`DSH asset failed: ${response.status}`)
  const blob = URL.createObjectURL(new Blob([await response.text()], { type: 'text/javascript' }))
  const script = document.createElement('script')
  script.nonce = nonce
  script.src = blob
  try {
    await new Promise<void>((resolve, reject) => {
      script.onload = () =>{  resolve() }
      script.onerror = () =>{  reject(new Error('DSH client bundle failed to load')) }
      document.head.append(script)
    })
  } finally { script.remove(); URL.revokeObjectURL(blob) }
}

async function boot(): Promise<void> {
  const id = ++nextId
  const injections = await new Promise<unknown[]>((resolve, reject) => {
    listeners.set(id, (message) => {
      listeners.delete(id)
      if (message.kind === 'boot' && Array.isArray(message.injections) && typeof message.workspace === 'string' && message.workspace !== '') {
        workspace = message.workspace
        resolve(message.injections)
      }
      else reject(new Error('DSH bootstrap failed'))
    })
    send(id, 'boot')
  })
  for (const raw of injections) {
    const row = raw as Record<string, unknown>
    switch (row.kind) {
      case 'global': Reflect.set(globalThis, String(row.name), row.value); break
      case 'script': {
        const script = document.createElement('script')
        script.nonce = nonce
        script.textContent = String(row.text)
        document.head.append(script)
        break
      }
      case 'script-src': await loadBundle(String(row.src)); break
      case 'script-preload': break
      case 'style': {
        const style = document.createElement('style')
        style.textContent = String(row.text)
        document.head.append(style)
        break
      }
      case 'html': throw new Error('DSH HTML injections need an explicit Webview adapter')
      default: throw new Error('Unknown DSH boot injection')
    }
  }
}

globalThis.fetch = proxyFetch
globalThis.WebSocket = GatewaySocket as unknown as typeof WebSocket
Reflect.set(globalThis, '__DSH_TRANSPORT__', { fetch: proxyFetch, loadBundle, ownsHost: true, streamBaseUrl: 'http://dsh.internal' })
Reflect.set(globalThis, '__DSH_FILE_UPLOAD__', { fetch: proxyFetch })
Reflect.set(globalThis, '__DSH_VSCODE__', {
  workspace: () => {
    if (workspace === undefined) throw new Error('Editor workspace is not ready')
    return workspace
  },
  configure: () => { send(++nextId, 'native-configure') },
  selected: (id: string) => { editor.setState({ sessionId: id }) },
  lastSession: () => {
    const state = editor.getState()
    return typeof state === 'object' && state !== null && 'sessionId' in state && typeof state.sessionId === 'string' ? state.sessionId : undefined
  },
  ready: () => { send(++nextId, 'ui-ready', { mounted: document.querySelector('[data-vscode-conversation]') !== null }) },
})
const ready = boot()
// The static entry observes this rejection and renders its existing boot failure UI.
void ready.catch((error: unknown) => {
  send(++nextId, 'client-failure', { reason: error instanceof Error ? error.message.slice(0, 400) : 'Boot failed' })
})
Reflect.set(globalThis, '__DSH_BOOT_READY__', { promise: ready })
