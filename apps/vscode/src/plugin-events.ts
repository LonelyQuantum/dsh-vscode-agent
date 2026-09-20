/** Plugin graph events over the Webview's authenticated Fetch carrier. */
import { EventSource } from 'eventsource'

const endpoint = 'http://dsh.internal/plugins/events'

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
