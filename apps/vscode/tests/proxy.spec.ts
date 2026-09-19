import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { CHANNEL, HostProxy, admittedPath, MAX_BODY_BYTES } from '../src/proxy.ts'

it.each(['https://outside.test/api/foo', '//outside.test/api/foo', '/api/../secret', '/api/%2e%2e/secret', '/api/\\evil', '/private'])
('rejects an unadmitted proxy path %s', (path) => { expect(() => admittedPath(path)).toThrow() })

it('admits Gateway endpoints and plugin combo URLs', () => {
  expect(admittedPath('/api/remote.call')).toBe('/api/remote.call')
  expect(admittedPath('/plugins/??a/client.js&rev=2')).toBe('/plugins/??a/client.js&rev=2')
})

it('keeps credentials private, streams bytes on demand, rejects redirects and drains sockets', async () => {
  const seen: string[] = []
  let closeStalled: (() => void) | undefined
  const stalledClosed = new Promise<void>((resolve) => { closeStalled = resolve })
  const server = createServer((request, response) => {
    if (request.url === '/launch?token=test-only') {
      response.writeHead(303, { 'set-cookie': 'dsh=test-cookie; HttpOnly', location: '/' }).end(); return
    }
    seen.push(request.headers.cookie ?? '')
    if (request.url === '/api/redirect') { response.writeHead(302, { location: 'https://outside.test/' }).end(); return }
    if (request.url === '/api/stalled') {
      response.once('close', () => { closeStalled?.() })
      response.writeHead(200, { 'content-type': 'application/octet-stream' }).flushHeaders()
      return
    }
    response.writeHead(200, { 'content-type': 'text/plain', 'set-cookie': 'must-not-reach-webview=1' }).end('hello')
  })
  const sockets = new WebSocketServer({ server, path: '/api/remote.mux' })
  sockets.on('connection', (socket, request) => {
    seen.push(request.headers.cookie ?? '')
    socket.on('message', (message) => {
      socket.send((Buffer.isBuffer(message) ? message : Array.isArray(message) ? Buffer.concat(message) : Buffer.from(message)).toString('utf8'))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing test listener')
  const replies: Array<Record<string, unknown>> = []
  const waiters = new Map<string, (message: Record<string, unknown>) => void>()
  const receive = (id: number, kind: string): Promise<Record<string, unknown>> => {
    const existing = replies.find(message => message.id === id && message.kind === kind)
    return existing ? Promise.resolve(existing) : new Promise(resolve => waiters.set(`${id}:${kind}`, resolve))
  }
  const proxy = await HostProxy.connect(`http://127.0.0.1:${address.port}/launch?token=test-only`, async (message) => {
    const row = message as Record<string, unknown>
    replies.push(row)
    waiters.get(`${row.id}:${row.kind}`)?.(row)
    return true
  })
  const send = (id: number, kind: string, fields: object = {}): void => { proxy.receive({ channel: CHANNEL, id, kind, ...fields }) }
  try {
    send(1, 'fetch', { path: '/api/test', method: 'GET' })
    expect((await receive(1, 'headers')).status).toBe(200)
    expect(replies.some(message => message.kind === 'chunk')).toBe(false)
    send(1, 'pull')
    expect(Buffer.from(String((await receive(1, 'chunk')).data), 'base64').toString()).toBe('hello')
    send(1, 'pull')
    await receive(1, 'end')
    send(2, 'fetch', { path: '/api/redirect', method: 'GET' })
    await receive(2, 'error')
    send(3, 'fetch', { path: '/api/test', method: 'POST', body: 'a'.repeat(MAX_BODY_BYTES * 2) })
    await receive(3, 'error')
    send(4, 'socket-open')
    await receive(4, 'socket-open')
    send(4, 'socket-send', { data: '{"ping":true}' })
    expect((await receive(4, 'socket-message')).data).toBe('{"ping":true}')
    send(5, 'fetch', { path: '/api/stalled', method: 'GET' })
    await receive(5, 'headers')
    send(5, 'cancel')
    await stalledClosed
    expect(seen.every(cookie => cookie === 'dsh=test-cookie')).toBe(true)
    expect(JSON.stringify(replies)).not.toMatch(/test-cookie|test-only|must-not-reach/)
    const peerClosures = Promise.all([...sockets.clients].map(socket => once(socket, 'close')))
    await proxy.dispose()
    await peerClosures
    expect(sockets.clients.size).toBe(0)
  } finally {
    await proxy.dispose()
    for (const socket of sockets.clients) socket.terminate()
    await new Promise<void>((resolve) => { sockets.close(() => { resolve() }) })
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => { resolve() }))
  }
})
