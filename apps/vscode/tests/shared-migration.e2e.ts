/** Released history migrates only in the temporary home owned by this shared-profile test. */
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { acquireSharedHost, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { SessionId } from '@deepseek-ai/dsh-session'
import { generationLogPath, compressZstdFrame, readSessionLog } from './read-session-log.ts'
import { HostProxy } from '../src/proxy.ts'
import { sharedBackendApi } from '../../desktop/tests/shared-backend-harness.ts'

it('continues V3 history through both shared clients without rewriting its predecessor or trusting stale diff coordinates', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-migration-'))
  context.onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const version = (JSON.parse(await readFile(resolve('apps/cli/package.json'), 'utf8')) as { version: string }).version
  const clients: SharedHostClient[] = []
  context.onTestFinished(async () => { await Promise.all(clients.map(client => client.close())) })
  const attach = async (role: 'desktop' | 'vscode') => {
    const client = await acquireSharedHost({ home, version, role,
      environment: { ...process.env, DSH_TELEMETRY_DISABLED: '1' },
      launch: { protocol: 1, version, node: process.execPath,
        runtime: process.env.DSH_TEST_SHARED_RUNTIME ?? resolve('apps/vscode') } })
    clients.push(client)
    return client
  }
  const editor = await attach('vscode')
  const id = SessionId('shared-v3-migration-fixture')
  const source = generationLogPath(join(home, 'sessions'), workspace, id, 3, 'zstd')
  const createdAt = Date.now()
  const header = { type: 'session', version: 3, id, cwd: workspace, createdAt, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
  const rows = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'system/message', surfaceOp: 'append', data: { turn: 1, step: 1,
      message: { id: 'legacy-system', role: 'system', source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
        content: [{ type: 'text', text: 'Remember the user-provided project facts.' }] } } },
    { type: 'user/message', surfaceOp: 'append', data: { id: 'legacy-input', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: 'Remember LEGACY_SHARED_42.' }] } },
    { type: 'session/title', data: { title: 'Shared V3 fixture', source: { kind: 'fallback' }, messageSeqs: [3] } },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ].map((row, seq) => ({ ...row, seq, time: createdAt + seq }))
  const bytes = Buffer.concat([await compressZstdFrame(JSON.stringify(header) + '\n'),
    await compressZstdFrame(rows.map(row => JSON.stringify(row) + '\n').join(''))])
  await mkdir(dirname(source), { recursive: true })
  await writeFile(source, bytes, { flag: 'wx' })
  const before = await stat(source, { bigint: true })
  await editor.close()
  const desktop = await attach('desktop')
  const desktopApi = await sharedBackendApi(desktop)
  expect(JSON.stringify(await desktopApi('session/list', { _request: {} }))).toContain(id)
  expect(await readdir(dirname(source))).toEqual(['session.v3.jsonl.zstd'])
  const provider = await startMockLlmServer({ sequence: ['success'], successText: 'LEGACY_SHARED_42 MIGRATED' })
  context.onTestFinished(() => provider.close())
  await desktopApi('credentials/set', { ref: 'DSH_MIGRATION_FIXTURE_KEY', value: 'fixture-only-key' })
  await desktopApi('settings/update', { ns: 'llm-deepseek', patch: {
    baseURL: provider.baseURL, apiKeyEnv: 'DSH_MIGRATION_FIXTURE_KEY',
    models: [{ id: 'fixture', name: 'Fixture', contextWindow: 64000, maxTokens: 4096 }],
  } })
  const workspaceResult = await desktopApi('workspace/create', { request: { path: workspace } }) as { workspace: { workspaceId: string } }
  await desktopApi('session/create', { request: { sessionId: id, workspaceId: workspaceResult.workspace.workspaceId } })
  await desktopApi('session/selectModel', { request: { sessionId: id, provider: 'deepseek-official', model: 'fixture', reasoningEffort: 'off' } })
  await desktopApi('session/prompt', { request: { sessionId: id, requestId: randomUUID(), mode: 'queue',
    content: [{ type: 'text', text: 'Return the remembered code.' }] } })
  const current = generationLogPath(join(home, 'sessions'), workspace, id, 4, 'zstd')
  await vi.waitFor(async () => {
    const end = (await readSessionLog(current)).find(row => row.type === 'turn/end' && row.data.turn === 2)
    expect(end).toBeDefined()
  }, { timeout: 30_000 })
  const resumed = await readSessionLog(current)
  const end = resumed.find(row => row.type === 'turn/end' && row.data.turn === 2)
  if (end?.type !== 'turn/end') throw new Error('Resumed turn did not settle')
  expect(end?.data.reason, JSON.stringify(end?.data.reason)).toMatchObject({ kind: 'completed' })
  expect(JSON.stringify(provider.requests)).toContain('LEGACY_SHARED_42')
  const returning = await attach('vscode')
  const proxy = await HostProxy.connect(returning.ready.url, async () => true)
  context.onTestFinished(() => proxy.dispose())
  await expect(proxy.readCaptured(id, 999, 0)).rejects.toThrow('expired')
  expect(await readFile(source)).toEqual(bytes)
  const after = await stat(source, { bigint: true })
  expect(after.ino).toBe(before.ino)
  expect(after.mtimeNs).toBe(before.mtimeNs)
  const events = await readSessionLog(current)
  expect(events.filter(row => row.type === 'user/message' && row.data.id === 'legacy-input')).toHaveLength(1)
  expect(events.some(row => row.type === 'assistant/message' && JSON.stringify(row.data).includes('MIGRATED'))).toBe(true)
  expect(await readdir(dirname(source))).toEqual(expect.arrayContaining(['session.v3.jsonl.zstd', 'session.v4.jsonl.zstd']))
}, 120_000)
