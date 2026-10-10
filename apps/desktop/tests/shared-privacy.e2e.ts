/** Shared profile collection policies verified against loopback-only OTLP collectors. */
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { initProfile, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { acquireSharedHost, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { expect, it, onTestFinished, vi } from 'vitest'
import { sharedBackendApi } from './shared-backend-harness.ts'

const policies = [
  { name: 'fresh ordinary activity', existing: false, feedback: false, disabled: false },
  { name: 'fresh explicit feedback', existing: false, feedback: true, disabled: false },
  { name: 'existing analytics with feedback disabled', existing: true, feedback: true, disabled: true },
  { name: 'existing independent analytics and feedback', existing: true, feedback: true, disabled: false },
]

it.each(policies)('exports only the authorized records for $name', { retry: 0 }, async ({ existing, feedback, disabled }) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-privacy-'))
  const captures: { path: string; body: unknown }[] = []
  const failures: unknown[] = []
  let client: SharedHostClient | undefined
  const model: { provider?: Awaited<ReturnType<typeof startMockLlmServer>> } = {}
  const collector = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('error', (error) => { failures.push(error) })
    request.on('end', () => {
      try {
        const bytes = Buffer.concat(chunks)
        const body: unknown = JSON.parse((request.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes).toString())
        captures.push({ path: request.url ?? '', body })
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}')
      } catch (error) {
        failures.push(error)
        response.writeHead(400).end()
      }
    })
  })
  const stopBackend = async (): Promise<void> => {
    if (client === undefined) return
    const owned = client
    await owned.close()
    await vi.waitFor(() => {
      let exited = false
      try { process.kill(owned.ready.pid, 0) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        exited = true
      }
      expect(exited).toBe(true)
    }, { timeout: 20_000 })
    client = undefined
  }
  onTestFinished(async () => {
    try { await stopBackend() }
    finally {
      try { await model.provider?.close() }
      finally {
        if (collector.listening) {
          const closed = once(collector, 'close')
          collector.close()
          collector.closeAllConnections()
          await closed
        }
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    }
  })
  collector.listen(0, '127.0.0.1')
  await once(collector, 'listening')
  const address = collector.address()
  if (address === null || typeof address === 'string') throw new Error('Shared privacy collector has no TCP address')
  const endpoint = `http://127.0.0.1:${address.port}`
  const home = join(root, 'home')
  const profile = join(home, 'profiles/desktop')
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const repository = resolve(import.meta.dirname, '../../..')
  const runtime = process.env.DSH_TEST_SHARED_RUNTIME ?? join(repository, 'apps/vscode')
  const manifest = JSON.parse(await readFile(join(repository, 'apps/cli/package.json'), 'utf8')) as { version: string }
  let existingPatch: string | undefined
  if (existing) {
    initProfile(profile, PROFILE_TEMPLATES.web!.bundles)
    existingPatch = '- id: product-analytics\n  config:\n    enabled: true\n    appVersion: !!js process.env.DSH_CLIENT_VERSION\n'
    await writeFile(join(profile, 'cordis.patch.yml'), existingPatch)
  }
  const provider = await startMockLlmServer({ sequence: ['success'], repeatLast: true, successText: 'Shared privacy fixture reply' })
  model.provider = provider
  const environment = { ...process.env,
    DSH_TELEMETRY_DISABLED: disabled ? '1' : '', DSH_TELEMETRY_MODE: 'FEEDBACK_ONLY',
    DSH_PRODUCT_ANALYTICS_OTLP_URL: `${endpoint}/product`, DSH_TELEMETRY_OTLP_URL: `${endpoint}/feedback`,
  }
  client = await acquireSharedHost({ home, version: manifest.version, role: 'vscode', environment,
    launch: { protocol: 1, version: manifest.version, node: process.execPath, runtime } })
  const api = await sharedBackendApi(client)
  expect(await api('productAnalytics/enabled', {})).toBe(existing)
  if (existing) expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe(existingPatch)
  await api('productAnalytics/report', { event: { eventName: 'desktop_app_launch', attributes: {}, timestamp: Date.now() } })
  const created = await api('workspace/create', { request: { path: workspace } }) as { workspace: { workspaceId: string } }
  const session = await api('session/create', { request: { workspaceId: created.workspace.workspaceId } }) as { sessionId: string }
  await api('credentials/set', { ref: 'DSH_PRIVACY_FIXTURE_KEY', value: 'fixture-only-private-key' })
  await api('settings/update', { ns: 'llm-deepseek', patch: { apiKeyEnv: 'DSH_PRIVACY_FIXTURE_KEY', baseURL: provider.baseURL,
    models: [{ id: 'privacy-fixture-model', name: 'Privacy fixture model', contextWindow: 64000, maxTokens: 4096 }],
  } })
  await api('session/selectModel', { request: { sessionId: session.sessionId,
    provider: 'deepseek-official', model: 'privacy-fixture-model', reasoningEffort: 'off' } })
  const ordinaryText = 'SHARED_PRIVACY_ORDINARY_TURN'
  const feedbackText = 'SHARED_PRIVACY_EXPLICIT_FEEDBACK'
  await api('session/prompt', { request: { sessionId: session.sessionId, requestId: randomUUID(),
    mode: 'queue', content: [{ type: 'text', text: ordinaryText }] } })
  await vi.waitFor(async () => {
    const projection = await api('session/projections', { request: { sessionId: session.sessionId } }) as { asOfSeq: number }
    const page = await api('session/page', { request: { address: { kind: 'session', sessionId: session.sessionId },
      throughSeq: projection.asOfSeq, maxMessages: 20 } })
    expect(JSON.stringify(page)).toContain('Shared privacy fixture reply')
  }, { timeout: 20_000 })
  expect(captures.filter(capture => capture.path === '/feedback')).toHaveLength(0)
  if (feedback) expect(await api('sessionFeedback/record', { request: { sessionId: session.sessionId, text: feedbackText } }))
    .toMatchObject({ ok: true, value: { recorded: true } })
  const patch = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
  expect(patch).toContain(`enabled: ${existing}`)
  expect(await api('productAnalytics/enabled', {})).toBe(existing)
  await stopBackend()
  expect(failures).toEqual([])
  const productCaptures = captures.filter(capture => capture.path === '/product')
  const feedbackCaptures = captures.filter(capture => capture.path === '/feedback')
  if (existing) {
    expect(productCaptures).not.toHaveLength(0)
    expect(JSON.stringify(productCaptures)).toContain('desktop_app_launch')
  } else expect(productCaptures).toHaveLength(0)
  if (feedback && !disabled) {
    expect(feedbackCaptures).not.toHaveLength(0)
    expect(JSON.stringify(feedbackCaptures)).toContain(ordinaryText)
    expect(JSON.stringify(feedbackCaptures)).toContain(feedbackText)
  } else expect(feedbackCaptures).toHaveLength(0)
  expect(JSON.stringify(productCaptures)).not.toContain(ordinaryText)
  expect(JSON.stringify(captures)).not.toContain('fixture-only-private-key')
})
