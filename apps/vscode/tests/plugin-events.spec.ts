import { expect, it, vi } from 'vitest'
import { pluginEventSource } from '../src/plugin-events.ts'

function connection(signal: AbortSignal | null | undefined) {
  if (!signal) throw new Error('EventSource must own an abort signal')
  let controller: ReadableStreamDefaultController<Uint8Array>
  const abort = (): void => { controller.error(signal.reason) }
  const response = new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; signal.addEventListener('abort', abort, { once: true }) },
  }), { headers: { 'content-type': 'text/event-stream' } })
  return {
    signal, response,
    write(bytes: Uint8Array) { controller.enqueue(bytes) },
    end(failed: boolean) {
      signal.removeEventListener('abort', abort)
      if (failed) controller.error(new TypeError('Disconnected'))
      else controller.close()
    },
  }
}

function event(source: EventTarget, name: string): Promise<Event> {
  return new Promise((resolve) => { source.addEventListener(name, resolve, { once: true }) })
}

it.each(['https://outside.test/plugins/events', '//outside.test/plugins/events',
  'http://user@dsh.internal/plugins/events', '/api/remote.mux', '/plugins/events?token=secret', '/plugins/events#fragment'])
('rejects an unowned EventSource URL before fetching: %s', (url) => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  const Source = pluginEventSource(fetch)
  expect(() => new Source(url)).toThrow('Unsupported DSH plugin event URL')
  expect(fetch).not.toHaveBeenCalled()
})

it('decodes fragmented UTF-8 graphs through the authenticated carrier and aborts on close', async () => {
  const connections: ReturnType<typeof connection>[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const value = connection(init?.signal)
    connections.push(value)
    return value.response
  })
  const Source = pluginEventSource(fetch)
  const source = new Source('/plugins/events')
  try {
    await event(source, 'open')
    expect(source.readyState).toBe(Source.OPEN)
    expect(fetch.mock.calls[0]?.[0]).toEqual(new URL('http://dsh.internal/plugins/events'))
    const message = event(source, 'message')
    const graph = { type: 'graph', label: '插件' }
    for (const byte of new TextEncoder().encode(`: connected\n\ndata: ${JSON.stringify(graph)}\n\n`)) {
      connections[0].write(Uint8Array.of(byte))
    }
    expect(JSON.parse((await message as MessageEvent<string>).data)).toEqual(graph)
    source.close()
    expect(connections[0].signal.aborted).toBe(true)
    expect(source.readyState).toBe(Source.CLOSED)
  } finally { source.close() }
})

it.each([false, true])('reconnects after stream loss (error=%s), then cancels a pending retry on close', async (failed) => {
  vi.useFakeTimers()
  const connections: ReturnType<typeof connection>[] = []
  const Source = pluginEventSource(async (_url, init) => {
    const value = connection(init?.signal)
    connections.push(value)
    return value.response
  })
  const source = new Source(new URL('http://dsh.internal/plugins/events'))
  try {
    await event(source, 'open')
    const firstGraph = event(source, 'message')
    connections[0].write(new TextEncoder().encode('retry: 25\ndata: first graph\n\n'))
    await firstGraph
    const disconnected = event(source, 'error')
    connections[0].end(failed)
    await disconnected
    expect(source.readyState).toBe(Source.CONNECTING)
    const reopened = event(source, 'open')
    await vi.advanceTimersByTimeAsync(25)
    await reopened
    expect(connections).toHaveLength(2)
    const refreshed = event(source, 'message')
    connections[1].write(new TextEncoder().encode('data: refreshed graph\n\n'))
    expect((await refreshed as MessageEvent<string>).data).toBe('refreshed graph')
    const retrying = event(source, 'error')
    connections[1].end(failed)
    await retrying
    source.close()
    await vi.advanceTimersByTimeAsync(100)
    expect(connections).toHaveLength(2)
    expect(source.readyState).toBe(Source.CLOSED)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    source.close()
    vi.useRealTimers()
  }
})
