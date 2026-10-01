/** Independent native processes race to initialize one fresh home through the built runtime. */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { parseEndpoint } from '../../shared-host/src/files.ts'

it('serializes two process launchers and keeps the backend until the last process releases it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-processes-'))
  const home = join(root, 'home')
  const repository = resolve(import.meta.dirname, '../../..')
  const { version } = JSON.parse(await readFile(join(repository, 'apps/cli/package.json'), 'utf8')) as { version: string }
  const peers: { role: 'desktop' | 'vscode'; child: ReturnType<typeof spawn>; closed: Promise<void>; frames: { type?: string; pid?: number }[] }[] = []
  let backendPid: number | undefined
  const waitForExit = async (pid: number): Promise<void> => {
    await vi.waitFor(() => { expect(() => process.kill(pid, 0)).toThrow() }, { timeout: 30_000 })
  }
  try {
    for (const role of ['desktop', 'vscode'] as const) {
      const child = spawn(process.execPath, [join(import.meta.dirname, 'fixtures/shared-carrier.mjs'),
        pathToFileURL(join(repository, 'apps/shared-host/lib/client.js')).href],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      const closed = new Promise<void>((resolve) => { child.once('close', () => { resolve() }) })
      const frames: { type?: string; pid?: number }[] = []
      const peer = { role, child, closed, frames }
      peers.push(peer)
      child.on('message', (message) => { frames.push(message as { type?: string; pid?: number }) })
      await vi.waitFor(() => { expect(frames).toContainEqual({ type: 'waiting' }) })
    }
    // Both processes are waiting on the same barrier before either can acquire the startup lock.
    peers.forEach(peer => peer.child.send({ type: 'acquire', options: {
      home, version, role: peer.role,
      launch: { protocol: 1, version, node: process.execPath, runtime: join(repository, 'apps/vscode') },
    } }))
    await vi.waitFor(() => {
      for (const peer of peers) {
        expect(peer.frames).not.toContainEqual({ type: 'failed' })
        expect(peer.frames.some(frame => frame.type === 'ready')).toBe(true)
      }
    }, { timeout: 90_000 })
    backendPid = peers[0]!.frames.find(frame => frame.type === 'ready')!.pid!
    expect(peers[1]!.frames.find(frame => frame.type === 'ready')?.pid).toBe(backendPid)
    expect(parseEndpoint(JSON.parse(await readFile(join(home, '.shared-host/endpoint.json'), 'utf8')))?.pid).toBe(backendPid)
    peers[0]!.child.send({ type: 'release' })
    await peers[0]!.closed
    expect(() => process.kill(backendPid!, 0)).not.toThrow()
    peers[1]!.child.send({ type: 'release' })
    await peers[1]!.closed
    await waitForExit(backendPid)
  } finally {
    for (const peer of peers) if (peer.child.connected) peer.child.send({ type: 'release' })
    const kill = setTimeout(() => { for (const peer of peers) if (peer.child.exitCode === null) peer.child.kill('SIGKILL') }, 10_000)
    try { await Promise.all(peers.map(peer => peer.closed)) } finally { clearTimeout(kill) }
    const endpoint = await readFile(join(home, '.shared-host/endpoint.json'), 'utf8').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return undefined
    })
    const pid = backendPid ?? (endpoint === undefined ? undefined : parseEndpoint(JSON.parse(endpoint))?.pid)
    if (pid !== undefined) {
      try { process.kill(pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
      await waitForExit(pid)
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
