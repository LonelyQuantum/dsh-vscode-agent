/** Three native leases share one approval; held HTTP replies make editor decision races deterministic. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Page, type Route } from 'playwright'
import { expect, it, vi } from 'vitest'
import { acquireSharedHost, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { generationLogPath, readSessionLog } from './read-session-log.ts'
import { sharedBackendApi } from '../../desktop/tests/shared-backend-harness.ts'

it('shares Desktop decisions and commits only the first competing editor answer', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-approval-'))
  context.onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const clients: SharedHostClient[] = []
  context.onTestFinished(async () => {
    await Promise.all(clients.map(client => client.close()))
    for (const pid of new Set(clients.map(client => client.ready.pid))) await vi.waitFor(() => {
      let stopped = false
      try { process.kill(pid, 0) } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error
        stopped = true
      }
      expect(stopped).toBe(true)
    }, { timeout: 30_000 })
  })
  const version = (JSON.parse(await readFile(resolve('apps/cli/package.json'), 'utf8')) as { version: string }).version
  for (const role of ['vscode', 'vscode', 'desktop'] as const) clients.push(await acquireSharedHost({ home, version, role,
    environment: { ...process.env, DEEPSEEK_API_KEY: undefined, DSH_TELEMETRY_DISABLED: '1' },
    launch: { protocol: 1, version, node: process.execPath,
      runtime: process.env.DSH_TEST_SHARED_RUNTIME ?? resolve('apps/vscode') } }))
  expect(new Set(clients.map(client => client.ready.pid)).size).toBe(1)
  const provider = await startMockLlmServer({
    sequence: ['success', 'tool_call_success', 'success', 'tool_call_success', 'success', 'tool_call_success', 'success'],
    toolName: 'write', toolArguments: JSON.stringify({ file_path: 'approval-result.txt', content: 'APPROVED',
      sandbox_permissions: 'workspace-write', justification: 'Shared approval fixture' }),
    successText: 'SHARED_APPROVAL_DONE',
  })
  context.onTestFinished(() => provider.close())
  const api = await sharedBackendApi(clients[0]!)
  await api('settings/update', { ns: 'ui-settings-general', patch: { welcomeNoticeVersion: '2026-09-28.1' } })
  await api('credentials/set', { ref: 'DSH_APPROVAL_FIXTURE_KEY', value: 'fixture-only-key' })
  await api('settings/update', { ns: 'llm-deepseek', patch: { baseURL: provider.baseURL,
    apiKeyEnv: 'DSH_APPROVAL_FIXTURE_KEY', models: [{ id: 'fixture', name: 'Fixture', contextWindow: 64000, maxTokens: 4096 }] } })
  const created = await api('workspace/create', { request: { path: workspace } }) as { workspace: { workspaceId: string } }
  const session = await api('session/create', { request: { workspaceId: created.workspace.workspaceId } }) as { sessionId: string }
  const id = SessionId(session.sessionId)
  await api('session/selectModel', { request: { sessionId: id, provider: 'deepseek-official', model: 'fixture', reasoningEffort: 'off' } })
  await api('session/rename', { request: { sessionId: id, title: 'Shared approval fixture' } })
  const events = () => readSessionLog(generationLogPath(join(home, 'sessions'), workspace, id, SESSION_FORMAT_VERSION, 'zstd'))
  const prompt = async (text: string) => api('session/prompt', { request: { sessionId: id, requestId: randomUUID(), mode: 'queue',
    content: [{ type: 'text', text }] } })
  const settled = async (turns: number) => vi.waitFor(async () => {
    expect((await events()).filter(event => event.type === 'turn/end')).toHaveLength(turns)
  }, { timeout: 30_000 })
  await prompt('Prepare the shared conversation without tools.')
  await settled(1)
  const browser = await chromium.launch(process.env.DSH_VSCODE_TEST_BROWSER === 'msedge' ? { channel: 'msedge' } : {})
  context.onTestFinished(() => browser.close())
  const pages: Page[] = []
  for (let index = 0; index < clients.length; index += 1) {
    const page = await browser.newPage({ viewport: { width: index === 2 ? 1280 : 420, height: 900 }, locale: 'en-US' })
    if (index < 2) await page.addInitScript((path) => {
      Reflect.set(globalThis, '__DSH_VSCODE__', { workspace: () => path, capture: async () => null,
        preview: () => {}, configure: () => {}, selected: () => {}, lastSession: () => undefined,
        ready: () => {}, openFile: () => {}, openChanges: () => {} })
    }, workspace)
    else await page.addInitScript((sessionId) => {
      localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }))
    }, id)
    await page.goto(clients[index]!.ready.url)
    if (index < 2) await page.locator(`nav button[data-session-id="${id}"]`).click()
    else await page.getByText('SHARED_APPROVAL_DONE', { exact: true }).waitFor()
    pages.push(page)
  }
  await pages[0]!.getByRole('button', { name: /^Access mode/ }).click()
  await pages[0]!.getByRole('menuitem', { name: 'Read Only', exact: true }).click()
  const pending = () => Promise.all(pages.map(page => page.locator('[data-approval-key]').waitFor()))
  const output = join(workspace, 'approval-result.txt')
  await prompt('Ask Desktop to approve this temporary write.')
  await pending()
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
  await pages[2]!.getByRole('button', { name: 'Allow once', exact: true }).click()
  await settled(2)
  expect(await readFile(output, 'utf8')).toBe('APPROVED')
  for (const winner of [0, 1] as const) {
    const before = await stat(output)
    const held = [Promise.withResolvers<Route>(), Promise.withResolvers<Route>()]
    const captured = new Set<Route>()
    const handlers = held.map(gate => (route: Route) => {
      const payload = route.request().postDataJSON() as { payload?: { args?: { outcome?: { kind?: string; value?: string } } } }
      const outcome = payload.payload?.args?.outcome
      if (outcome?.kind === 'result' && ['allowed-once', 'rejected'].includes(outcome.value ?? '')) {
        captured.add(route)
        gate.resolve(route)
      }
      else return route.continue()
    })
    const endpoint = '**/api/$events/result'
    for (let index = 0; index < 2; index += 1) await pages[index]!.route(endpoint, handlers[index]!)
    const routes: Route[] = []
    const continued = new Set<Route>()
    try {
      await prompt(`Race editor answers, winner ${winner}.`)
      await pending()
      await Promise.all([
        pages[0]!.getByRole('button', { name: 'Allow once', exact: true }).click(),
        pages[1]!.getByRole('button', { name: 'Reject', exact: true }).click(),
      ])
      await vi.waitFor(() => { expect(captured.size).toBe(2) }, { timeout: 30_000 })
      routes.push(...await Promise.all(held.map(gate => gate.promise)))
      const lateBody = routes[1 - winner]!.request().postData()!
      continued.add(routes[winner]!)
      await routes[winner]!.continue()
      await settled(winner + 3)
      const decided = (await events()).filter(event => event.type === 'approval/decided')
      expect(decided).toHaveLength(winner + 2)
      const expectedOutcome: ApprovalOutcome = winner === 0 ? 'allowed-once' : 'rejected'
      expect(decided.at(-1)).toMatchObject({ type: 'approval/decided',
        data: { outcome: expectedOutcome } })
      const result = (await events()).filter(event => event.type === 'tool/result').at(-1)
      expect(result?.type === 'tool/result' && result.data.message.isError).toBe(winner === 1)
      expect(await readFile(output, 'utf8')).toBe('APPROVED')
      if (winner === 1) expect((await stat(output)).mtimeMs).toBe(before.mtimeMs)
      const authenticated = await fetch(clients[1 - winner]!.ready.url, { redirect: 'manual' })
      await authenticated.body?.cancel()
      const cookie = authenticated.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const late = await fetch(new URL('/api/$events/result', clients[1 - winner]!.ready.url), {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: lateBody,
      })
      // Completed-event replies are acknowledged idempotently without a second decision.
      expect(await late.json()).toMatchObject({ result: { ok: true } })
      expect((await events()).filter(event => event.type === 'approval/decided')).toHaveLength(winner + 2)
    } finally {
      for (const route of captured) if (!continued.has(route)) {
        try { await route.abort() } catch (error) {
          // The winning answer can cancel this intercepted request before cleanup reaches it.
          if (route.request().failure() === null) throw error
        }
      }
      for (let index = 0; index < 2; index += 1) await pages[index]!.unroute(endpoint, handlers[index])
    }
  }
  for (const page of pages) await expect.poll(() => page.locator('[data-approval-key]').count()).toBe(0)
  expect((await events()).filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(4)
})
