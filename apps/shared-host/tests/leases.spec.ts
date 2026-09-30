/** Real loopback leases keep one application alive until every native carrier leaves. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { SharedHostClient } from '../src/client.ts'
import { parseEndpoint, parseLaunch } from '../src/files.ts'
import { serveSharedHost } from '../src/server.ts'
import { controlText, record } from '../src/protocol.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(pauseBoot = false) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-shared-'))
  const shutdown = vi.fn(async () => {})
  const updates = vi.fn(async () => false)
  const clients: SharedHostClient[] = []
  const boot = Promise.withResolvers<undefined>()
  let publishAccount: ((session: unknown) => void) | undefined
  if (!pauseBoot) boot.resolve(undefined)
  const serving = serveSharedHost({ home, version: 'fixture', start: async (publish) => {
    publishAccount = publish
    await boot.promise
    publish({ token: 'fixture-only-private-account' })
    return { ready: { url: 'http://127.0.0.1:49152/?token=fixture-only', injections: [], pid: process.pid },
      shutdown, inspectQuit: async () => ({ activeTasks: true, scheduledTasks: true }), updateTasks: updates }
  } })
  let failure: unknown
  void serving.catch((error: unknown) => { failure = error })
  cleanups.push(async () => {
    boot.resolve(undefined)
    try {
      if (clients.length === 0 && !failure) {
        const cleanupClient = await SharedHostClient.connect(endpoint, 'fixture', 'desktop')
        if (cleanupClient) clients.push(cleanupClient)
      }
      for (const client of clients) await client.close()
      await serving
    } finally { await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  })
  let endpoint: ReturnType<typeof parseEndpoint>
  await vi.waitFor(async () => {
    if (failure) throw failure
    endpoint = parseEndpoint(JSON.parse(await readFile(join(home, '.shared-host/endpoint.json'), 'utf8')))
    expect(endpoint).toBeDefined()
  }, { timeout: 15_000 })
  const attach = async (role: 'desktop' | 'vscode', version = 'fixture', platform?: (value: unknown) => void) => {
    const client = await SharedHostClient.connect(endpoint, version, role, platform)
    if (!client) throw new Error('Fixture endpoint was not listening')
    clients.push(client)
    return client
  }
  return { home, shutdown, updates, serving, attach, endpoint, completeBoot: () => { boot.resolve(undefined) },
    publishAccount: (value: unknown) => { publishAccount?.(value) } }
}

it('delivers account events only after the native readiness handshake', async () => {
  const fixtureState = await fixture(true)
  const endpoint = fixtureState.endpoint!
  const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}/lease`, { headers: {
    authorization: `Bearer ${endpoint.token}`, 'x-dsh-client': 'desktop', 'x-dsh-version': 'fixture', 'x-dsh-protocol': '1',
  } })
  const closed = new Promise(resolve => socket.once('close', resolve))
  const frames: unknown[] = []
  socket.on('message', (data) => { frames.push(JSON.parse(controlText(data))) })
  try {
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
    fixtureState.publishAccount({ token: 'fixture-before-ready' })
    fixtureState.completeBoot()
    await vi.waitFor(() => { expect(frames).toHaveLength(2) })
    expect(record(frames[0]) && frames[0].type).toBe('ready')
    expect(frames[1]).toEqual({ type: 'platform-session', session: { token: 'fixture-only-private-account' } })
  } finally {
    fixtureState.completeBoot()
    socket.terminate()
    await closed
    await fixtureState.serving
  }
})

it('shares one process, withholds account credentials from VS Code, and releases the last lease', async () => {
  const fixtureState = await fixture()
  const desktopAccount = vi.fn()
  const editorAccount = vi.fn()
  const [desktop, editor] = await Promise.all([
    fixtureState.attach('desktop', 'fixture', desktopAccount), fixtureState.attach('vscode', 'fixture', editorAccount),
  ])
  expect(desktop.ready.pid).toBe(editor.ready.pid)
  await vi.waitFor(() => { expect(desktopAccount).toHaveBeenCalledWith({ token: 'fixture-only-private-account' }) })
  expect(editorAccount).not.toHaveBeenCalled()
  expect(await desktop.control('inspect-quit')).toEqual({ activeTasks: false, scheduledTasks: false })
  await desktop.close()
  expect(fixtureState.shutdown).not.toHaveBeenCalled()
  const replacement = await fixtureState.attach('desktop')
  expect(replacement.ready.pid).toBe(editor.ready.pid)
  await editor.close()
  expect(await replacement.control('inspect-quit')).toEqual({ activeTasks: true, scheduledTasks: true })
  await replacement.close()
  await expect(readFile(join(fixtureState.home, '.shared-host/endpoint.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await fixtureState.serving
  expect(fixtureState.shutdown).toHaveBeenCalledOnce()
})

it('refuses updates while another carrier is attached and refuses new leases during an update', async () => {
  const fixtureState = await fixture()
  const desktop = await fixtureState.attach('desktop')
  const editor = await fixtureState.attach('vscode')
  await expect(desktop.control('lock-update')).rejects.toThrow('close other clients')
  await expect(desktop.close(true)).rejects.toThrow('close other clients')
  await expect(editor.control('inspect-update')).rejects.toThrow()
  expect(fixtureState.updates).not.toHaveBeenCalled()
  await editor.close()
  expect(await desktop.control('lock-update')).toBe(false)
  await expect(fixtureState.attach('vscode')).rejects.toThrow('refused')
  expect(await desktop.control('unlock-update')).toBe(false)
  await desktop.close(true)
})

it('rejects incorrect tokens and incompatible clients without creating another owner', async () => {
  const fixtureState = await fixture()
  const desktop = await fixtureState.attach('desktop')
  await expect(fixtureState.attach('vscode', 'different-version')).rejects.toThrow('refused')
  await expect(SharedHostClient.connect({ ...fixtureState.endpoint!, token: '0'.repeat(64) }, 'fixture', 'vscode')).rejects.toThrow('refused')
  const browser = new WebSocket(`ws://127.0.0.1:${fixtureState.endpoint!.port}/lease`, { headers: {
    authorization: `Bearer ${fixtureState.endpoint!.token}`, origin: 'http://127.0.0.1',
    'x-dsh-client': 'desktop', 'x-dsh-version': 'fixture', 'x-dsh-protocol': '1',
  } })
  const closed = new Promise(resolve => browser.once('close', resolve))
  let refused: Error | undefined
  browser.on('error', (error) => { refused = error })
  try { await vi.waitFor(() => { expect(refused?.message).toContain('403') }) }
  finally { browser.terminate(); await closed }
  expect(fixtureState.shutdown).not.toHaveBeenCalled()
  await desktop.close()
})

it('accepts only absolute Desktop launch locations and drops extra disk fields', () => {
  const location = tmpdir()
  expect(parseLaunch({ protocol: 1, version: 'fixture', node: location, runtime: location, primaryRuntime: location,
    environment: { DEEPSEEK_API_KEY: 'fixture-only' } })).not.toHaveProperty('environment')
  expect(() => parseLaunch({ protocol: 1, version: 'fixture', node: 'relative', runtime: location, primaryRuntime: location })).toThrow()
  expect(() => parseEndpoint({ port: 65536 })).toThrow()
})
