import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, onTestFinished } from 'vitest'
import { CHANNEL, HostProxy, fileRevisionRedirect } from '../src/proxy.ts'

it.each([
  'https://outside.test/api/file?path=%2Fworkspace%2Ffile&v=1',
  '/api/other?path=%2Fworkspace%2Ffile&v=1',
  '?path=%2Fworkspace%2Fsecret&v=1',
  '?path=%2Fworkspace%2Ffile&v=1&extra=1',
  '?path=%2Fworkspace%2Ffile&path=%2Fworkspace%2Ffile&v=1',
  '?path=%2Fworkspace%2Ffile&v=1&v=2',
  '?path=%2Fworkspace%2Ffile&v=',
  '?path=%2Fworkspace%2Ffile&v=1#fragment',
  'http://user:pass@127.0.0.1:1234/api/file?path=%2Fworkspace%2Ffile&v=1',
])('refuses a redirect outside the exact version contract: %s', (location) => {
  expect(() => fileRevisionRedirect(new URL('http://127.0.0.1:1234/api/file?path=%2Fworkspace%2Ffile'), location)).toThrow()
})

it('follows a same-file revision privately, preserves bytes and bounds redirect loops', async () => {
  const seen: string[] = []
  const cookies: string[] = []
  const server = createServer((request, response) => {
    if (request.url === '/launch') { response.writeHead(303, { 'set-cookie': 'private=test; HttpOnly', location: '/' }).end(); return }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    seen.push(url.search)
    cookies.push(request.headers.cookie ?? '')
    if (url.searchParams.get('path') === 'loop' || !url.searchParams.has('v')) {
      url.searchParams.set('v', String(Number(url.searchParams.get('v') ?? '0') + 1))
      response.writeHead(302, { location: url.search }).end(); return
    }
    response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(Buffer.from([0, 255, 10, 42]))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  onTestFinished(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => { server.close(() => { resolve() }) }) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing listener')
  const replies: Array<Record<string, unknown>> = []
  const waiters = new Map<string, (value: Record<string, unknown>) => void>()
  const proxy = await HostProxy.connect(`http://127.0.0.1:${address.port}/launch`, async (message) => {
    const row = message as Record<string, unknown>
    replies.push(row); waiters.get(`${row.id}:${row.kind}`)?.(row); return true
  })
  onTestFinished(() => proxy.dispose())
  const receive = (id: number, kind: string): Promise<Record<string, unknown>> => {
    const ready = replies.find(row => row.id === id && row.kind === kind)
    return ready ? Promise.resolve(ready) : new Promise((resolve) => { waiters.set(`${id}:${kind}`, resolve) })
  }
  proxy.receive({ channel: CHANNEL, id: 1, kind: 'fetch', path: '/api/file?path=file', method: 'GET' })
  expect((await receive(1, 'headers')).status).toBe(200)
  proxy.receive({ channel: CHANNEL, id: 1, kind: 'pull' })
  expect(Buffer.from(String((await receive(1, 'chunk')).data), 'base64')).toEqual(Buffer.from([0, 255, 10, 42]))
  proxy.receive({ channel: CHANNEL, id: 1, kind: 'pull' })
  await receive(1, 'end')
  proxy.receive({ channel: CHANNEL, id: 2, kind: 'fetch', path: '/api/file?path=loop', method: 'GET' })
  await receive(2, 'error')
  expect(seen).toEqual(['?path=file', '?path=file&v=1', '?path=loop', '?path=loop&v=1', '?path=loop&v=2'])
  expect(cookies.every(cookie => cookie === 'private=test')).toBe(true)
  expect(JSON.stringify(replies)).not.toContain('private=test')
})
