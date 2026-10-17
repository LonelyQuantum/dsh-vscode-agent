/** Plugin graph events over the Webview's authenticated Fetch carrier. */
import { EventSource } from 'eventsource'

const endpoint = 'http://dsh.internal/plugins/events'
/** A stalled plugin-event consumer cannot retain an unbounded graph backlog. */
export const MAX_PLUGIN_EVENT_BYTES = 16 * 1024 * 1024

/**
 * Bind EventSource parsing, reconnect and cancellation to the owned plugin route.
 * @param fetch Authenticated Webview Fetch adapter; never a direct loopback fetch.
 * @returns EventSource constructor accepting only the plugin-event endpoint.
 */
export function pluginEventSource(fetch: typeof globalThis.fetch): typeof EventSource {
  return class PluginEventSource extends EventSource {
    constructor(url: string | URL, init?: EventSourceInit) {
      const target = new URL(url, 'http://dsh.internal')
      if (target.href !== endpoint) throw new TypeError('Unsupported DSH plugin event URL')
      super(target, { ...init, fetch })
    }
  }
}

/**
 * Keep the shell-owned HMR Fetch stream alive across EventSource reconnects.
 * Only the exact plugin-event GET is adapted; other requests retain the authenticated Fetch carrier.
 * Fatal refusals and buffer overflow error the body; cancellation closes the source and its pending retry.
 * @param fetch Authenticated carrier, also used by Source.
 * @param Source The page-owned EventSource constructor.
 * @returns Fetch adapter for the upstream shell transport.
 */
export function pluginEventFetch(fetch: typeof globalThis.fetch, Source: typeof EventSource): typeof globalThis.fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://dsh.internal')
    if (url.href !== endpoint) return fetch(input, init)
    const request = new Request(input instanceof Request ? input : url, init)
    if (request.method !== 'GET') return fetch(input, init)
    request.signal.throwIfAborted()
    let stopped = false
    let controller: ReadableStreamDefaultController<Uint8Array>
    const source = new Source(endpoint)
    const close = (): void => {
      if (stopped) return
      stopped = true
      request.signal.removeEventListener('abort', aborted)
      source.removeEventListener('message', message)
      source.removeEventListener('error', error)
      source.close()
    }
    const fail = (reason: unknown): void => { if (!stopped) { close(); controller.error(reason) } }
    const aborted = (): void => { fail(request.signal.reason) }
    const message = (event: MessageEvent<string>): void => {
      if (stopped) return
      const frame = new TextEncoder().encode(event.data.split(/\r\n|\r|\n/u).map(line => `data: ${line}\n`).join('') + '\n')
      if (frame.byteLength > (controller.desiredSize ?? 0)) {
        fail(new Error('DSH plugin event buffering limit exceeded; reload the view'))
        return
      }
      controller.enqueue(frame)
    }
    const error = (): void => {
      if (source.readyState === Source.CLOSED) fail(new Error('DSH plugin events were refused; reload the view'))
    }
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      cancel() { close() },
    }, { highWaterMark: MAX_PLUGIN_EVENT_BYTES, size: chunk => chunk.byteLength })
    source.addEventListener('message', message)
    source.addEventListener('error', error)
    request.signal.addEventListener('abort', aborted, { once: true })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }
}
