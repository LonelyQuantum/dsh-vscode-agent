/** Built Desktop profile shared by independent native clients in a disposable Harness home. */
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it, vi } from 'vitest'
import { acquireSharedHost, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { prepareDevelopmentProject } from '../scripts/development-project.ts'
import { DesktopProjectManager } from '../src/project-manager.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'

const primaryRuntime = process.env.DSH_TEST_PRIMARY_RUNTIME

it.skipIf(!primaryRuntime)('shares provider settings and durable Sessions across Desktop, editor-only cold launch, and crash recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-profile-'))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  const runtime = join(root, 'runtime')
  const repository = resolve(import.meta.dirname, '../../..')
  const manifest = JSON.parse(await readFile(join(repository, 'apps/cli/package.json'), 'utf8')) as { version: string }
  const version = manifest.version
  const clients: SharedHostClient[] = []
  const pids = new Set<number>()
  const provider = await startMockLlmServer({ sequence: ['success'], repeatLast: true, successText: 'Shared transcript fixture reply' })
  const waitForExit = async (pid: number): Promise<void> => {
    await vi.waitFor(() => {
      let alive = true
      try { process.kill(pid, 0) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        alive = false
      }
      expect(alive).toBe(false)
    }, { timeout: 30_000 })
    pids.delete(pid)
  }
  const attach = async (role: 'desktop' | 'vscode', first = false): Promise<SharedHostClient> => {
    const client = await acquireSharedHost({ home, version, role, ...(first ? {
      launch: { protocol: 1, version, node: process.execPath, runtime, primaryRuntime: resolve(primaryRuntime!) },
      prepare: () => new DesktopProjectManager(resolveDesktopPaths(home), { dsh: runtime }).applyRelease(),
    } : {}) })
    clients.push(client)
    pids.add(client.ready.pid)
    return client
  }
  const api = async (client: SharedHostClient) => {
    const authenticated = await fetch(client.ready.url, { redirect: 'manual' })
    await authenticated.body?.cancel()
    const cookie = authenticated.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    expect(cookie).not.toBe('')
    return async (method: string, args: object): Promise<unknown> => {
      const rpcId = randomUUID()
      const response = await fetch(new URL(`/api/${method}`, client.ready.url), { method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
      })
      expect(response.status).toBe(200)
      const envelope = await response.json() as { result: { ok: boolean; value: unknown } }
      expect(envelope.result.ok, `${method}: ${JSON.stringify(envelope.result)}`).toBe(true)
      return envelope.result.value
    }
  }
  try {
    await mkdir(workspace)
    prepareDevelopmentProject({ projectDir: runtime, cliDir: join(repository, 'apps/cli'),
      hostDir: join(repository, 'apps/desktop-host'), dependencyDir: join(repository, 'node_modules/.pnpm/node_modules'),
      target: 'win-x64', release: { schemaVersion: 1, version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        nodeVersion: process.versions.node, pnpmVersion: '11.7.0' } })
    const desktop = await attach('desktop', true)
    const editor = await attach('vscode')
    expect(editor.ready.pid).toBe(desktop.ready.pid)
    const desktopApi = await api(desktop)
    const editorApi = await api(editor)
    const vscode = process.env.DSH_TEST_VSCODE
    if (vscode) {
      const result = await promisify(execFile)(process.execPath, [join(repository, 'apps/vscode/scripts/test-extension.mjs'),
        vscode, '--shared-home', home,
        ...process.env.DSH_TEST_VSIX ? ['--vsix', resolve(process.env.DSH_TEST_VSIX), '--ux'] : [],
      ], { windowsHide: true, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 })
      expect(result.stdout).toContain('VSCODE_WEBVIEW_SMOKE_OK')
      expect(result.stdout).toContain(`"pid":${desktop.ready.pid}`)
      expect(await desktop.control('inspect-update')).toBe(true)
    }
    const created = await desktopApi('workspace/create', { request: { path: workspace } }) as { workspace: { workspaceId: string } }
    const session = await desktopApi('session/create', { request: { workspaceId: created.workspace.workspaceId } }) as { sessionId: string }
    const history = async (request: typeof desktopApi): Promise<string> => {
      const projection = await request('session/projections', { request: { sessionId: session.sessionId } }) as { asOfSeq: number }
      return JSON.stringify(await request('session/page', { request: { address: { kind: 'session', sessionId: session.sessionId },
        throughSeq: projection.asOfSeq, maxMessages: 20 } }))
    }
    await desktopApi('session/rename', { request: { sessionId: session.sessionId, title: 'Shared fixture history' } })
    expect(JSON.stringify(await editorApi('session/list', { _request: {} }))).toContain('Shared fixture history')
    await desktopApi('credentials/set', { ref: 'DSH_SHARED_FIXTURE_KEY', value: 'fixture-only-first-key' })
    expect(await editorApi('credentials/describe', { refs: ['DSH_SHARED_FIXTURE_KEY'] })).toMatchObject({ DSH_SHARED_FIXTURE_KEY: { configured: true } })
    await desktopApi('settings/update', { ns: 'llm-deepseek', patch: {
      baseURL: provider.baseURL, apiKeyEnv: 'DSH_SHARED_FIXTURE_KEY',
      models: [{ id: 'shared-fixture-model', name: 'Shared fixture model', contextWindow: 64000, maxTokens: 4096 }],
    } })
    const sharedSettings = JSON.stringify(await editorApi('settings/describe', {}))
    expect(sharedSettings).toContain(provider.baseURL)
    expect(sharedSettings).toContain('shared-fixture-model')
    expect(sharedSettings).not.toContain('fixture-only-first-key')
    await desktopApi('settings/update', { ns: 'locale', patch: { preference: 'zh-CN' } })
    expect(JSON.stringify(await editorApi('settings/describe', {}))).toContain('zh-CN')
    expect(JSON.stringify(editor.ready)).not.toContain('fixture-only-first-key')
    await editorApi('session/selectModel', { request: { sessionId: session.sessionId,
      provider: 'deepseek-official', model: 'shared-fixture-model', reasoningEffort: 'off' } })
    await editorApi('session/prompt', { request: { sessionId: session.sessionId, requestId: randomUUID(),
      mode: 'queue', content: [{ type: 'text', text: 'Shared transcript fixture question' }] } })
    await vi.waitFor(async () => { expect(await history(desktopApi)).toContain('Shared transcript fixture reply') }, { timeout: 20_000 })
    expect(provider.requests[0]?.headers['x-api-key']).toBe('fixture-only-first-key')
    await desktopApi('credentials/set', { ref: 'DSH_SHARED_FIXTURE_KEY', value: 'fixture-only-rotated-key' })
    await editorApi('session/prompt', { request: { sessionId: session.sessionId, requestId: randomUUID(),
      mode: 'queue', content: [{ type: 'text', text: 'Shared rotated credential fixture question' }] } })
    await vi.waitFor(() => { expect(provider.requests.some(request => request.headers['x-api-key'] === 'fixture-only-rotated-key')).toBe(true) }, { timeout: 20_000 })
    await desktop.close()
    expect(JSON.stringify(await editorApi('session/list', { _request: {} }))).toContain(session.sessionId)
    await editor.close()
    const standalone = await attach('vscode')
    await waitForExit(editor.ready.pid)
    expect(standalone.ready.pid).not.toBe(editor.ready.pid)
    const standaloneApi = await api(standalone)
    await standaloneApi('session/create', { request: { sessionId: session.sessionId, workspaceId: created.workspace.workspaceId } })
    expect(JSON.stringify(await standaloneApi('session/list', { _request: {} }))).toContain('Shared fixture history')
    expect(await history(standaloneApi)).toContain('Shared transcript fixture reply')
    process.kill(standalone.ready.pid, 'SIGKILL')
    await waitForExit(standalone.ready.pid)
    const recovered = await attach('vscode')
    const recoveredApi = await api(recovered)
    expect(JSON.stringify(await recoveredApi('session/list', { _request: {} }))).toContain(session.sessionId)
    expect(await history(recoveredApi)).toContain('Shared transcript fixture reply')
    const returning = await attach('desktop')
    expect(returning.ready.pid).toBe(recovered.ready.pid)
    await recovered.close()
    await returning.close()
    await waitForExit(returning.ready.pid)
  } finally {
    await provider.close()
    await Promise.allSettled(clients.map(client => client.close()))
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
      await waitForExit(pid)
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
