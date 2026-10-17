import { expect, it, vi } from 'vitest'
import { MAX_PLUGIN_EVENT_BYTES, pluginEventFetch, pluginEventSource } from '../src/plugin-events.ts'

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

function streamingCarrier() {
  const connections: ReturnType<typeof connection>[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const value = connection(init?.signal)
    connections.push(value)
    return value.response
  }
  return { connections, fetch }
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
      connections[0]!.write(Uint8Array.of(byte))
    }
    expect(JSON.parse((await message as MessageEvent<string>).data)).toEqual(graph)
    source.close()
    expect(connections[0]!.signal.aborted).toBe(true)
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
    connections[0]!.write(new TextEncoder().encode('retry: 25\ndata: first graph\n\n'))
    await firstGraph
    const disconnected = event(source, 'error')
    connections[0]!.end(failed)
    await disconnected
    expect(source.readyState).toBe(Source.CONNECTING)
    const reopened = event(source, 'open')
    await vi.advanceTimersByTimeAsync(25)
    await reopened
    expect(connections).toHaveLength(2)
    const refreshed = event(source, 'message')
    connections[1]!.write(new TextEncoder().encode('data: refreshed graph\n\n'))
    expect((await refreshed as MessageEvent<string>).data).toBe('refreshed graph')
    const retrying = event(source, 'error')
    connections[1]!.end(failed)
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

it('delivers multiline UTF-8 frames across a shell Fetch reconnect and cancels its retry', async () => {
  vi.useFakeTimers()
  const { connections, fetch } = streamingCarrier()
  const Base = pluginEventSource(fetch)
  let sourceEvent!: (name: string) => Promise<Event>
  let opened!: Promise<Event>
  class ObservedSource extends Base {
    constructor(url: string | URL) {
      super(url)
      sourceEvent = name => event(this, name)
      opened = event(this, 'open')
    }
  }
  const adapter = pluginEventFetch(fetch, ObservedSource)
  const abort = new AbortController()
  const response = await adapter('plugins/events', { signal: abort.signal })
  const reader = response.body!.getReader()
  try {
    await opened
    connections[0]!.write(new TextEncoder().encode('retry: 25\ndata: 插件\ndata: graph\n\n'))
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: 插件\ndata: graph\n\n')
    const disconnected = sourceEvent('error')
    connections[0]!.end(false)
    await disconnected
    const reopened = sourceEvent('open')
    await vi.advanceTimersByTimeAsync(25)
    await reopened
    connections[1]!.write(new TextEncoder().encode('data: next graph\n\n'))
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: next graph\n\n')
    const retrying = sourceEvent('error')
    connections[1]!.end(true)
    await retrying
    await reader.cancel()
    await vi.advanceTimersByTimeAsync(100)
    expect(connections).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    abort.abort()
    try { await Promise.allSettled([reader.cancel()]) }
    finally { vi.useRealTimers() }
  }
})

it('preserves ordinary Fetch requests and refuses an already aborted event subscription before fetching', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('ordinary'))
  const adapter = pluginEventFetch(fetch, pluginEventSource(fetch))
  expect(await (await adapter('/api/fixture')).text()).toBe('ordinary')
  expect(await (await adapter('/plugins/events', { method: 'POST' })).text()).toBe('ordinary')
  const before = fetch.mock.calls.length
  await expect(adapter('/plugins/events', { signal: AbortSignal.abort() })).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(before)
})

it('surfaces a terminal HTTP refusal instead of retaining a disconnected shell stream', async () => {
  const fetch: typeof globalThis.fetch = async () => new Response(null, { status: 403 })
  const response = await pluginEventFetch(fetch, pluginEventSource(fetch))('/plugins/events')
  await expect(response.body!.getReader().read()).rejects.toThrow('refused')
})

it('bounds a paused consumer and cancels an active subscription on abort', async () => {
  const { connections, fetch } = streamingCarrier()
  const Source = pluginEventSource(fetch)
  const response = await pluginEventFetch(fetch, Source)('/plugins/events')
  const reader = response.body!.getReader()
  try {
    await vi.waitFor(() => { expect(connections).toHaveLength(1) })
    connections[0]!.write(new TextEncoder().encode('data: ' + 'x'.repeat(MAX_PLUGIN_EVENT_BYTES) + '\n\n'))
    await expect(reader.read()).rejects.toThrow('buffering limit')
    expect(connections[0]!.signal.aborted).toBe(true)
  } finally { await Promise.allSettled([reader.cancel()]) }
  const abort = new AbortController()
  const next = await pluginEventFetch(fetch, Source)('/plugins/events', { signal: abort.signal })
  const nextReader = next.body!.getReader()
  try {
    await vi.waitFor(() => { expect(connections).toHaveLength(2) })
    const pending = nextReader.read()
    abort.abort(new Error('fixture aborted'))
    await expect(pending).rejects.toThrow('fixture aborted')
    expect(connections[1]!.signal.aborted).toBe(true)
  } finally { abort.abort(); await Promise.allSettled([nextReader.cancel()]) }
})
