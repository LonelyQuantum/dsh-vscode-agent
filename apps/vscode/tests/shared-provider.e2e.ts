/** Native provider setup writes the real shared settings and credential owners, not editor storage. */
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { acquireSharedHost, type SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { HostProxy } from '../src/proxy.ts'
import type { ModelCatalog, SessionProjectionsValue } from '@deepseek-ai/dsh-api-session-controller'
import { setupSharedProvider, type ProviderSetupUi } from '../src/provider-setup.ts'
import { extensionCopy } from '../src/locale.ts'
import { sharedBackendApi } from '../../desktop/tests/shared-backend-harness.ts'

it('configures a fresh editor home, attaches Desktop, cancels unchanged and rotates the shared key', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-provider-'))
  context.onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const version = (JSON.parse(await readFile(resolve('apps/cli/package.json'), 'utf8')) as { version: string }).version
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
  const attach = async (role: 'desktop' | 'vscode') => {
    const client = await acquireSharedHost({ home, version, role,
      environment: { ...process.env, DEEPSEEK_API_KEY: undefined, DSH_TELEMETRY_DISABLED: '1' },
      launch: { protocol: 1, version, node: process.execPath,
        runtime: process.env.DSH_TEST_SHARED_RUNTIME ?? resolve('apps/vscode') } })
    clients.push(client)
    return client
  }
  const editor = await attach('vscode')
  const connection = await HostProxy.connect(editor.ready.url, async () => { throw new Error('Native setup must not post to a page') })
  context.onTestFinished(() => connection.dispose())
  const provider = await startMockLlmServer({ sequence: ['success'], repeatLast: true, successText: 'NATIVE_PROVIDER_DONE' })
  context.onTestFinished(() => provider.close())
  const copy = extensionCopy('en')
  const key = { value: 'fixture-only-first-key' }
  const ui: ProviderSetupUi = {
    pick: async title => title === copy.provider ? 'deepseek-official' : title === copy.model ? '\u0000custom' : 'save',
    input: async (title, _value, password) => {
      if (title === copy.endpoint) return provider.baseURL
      if (title === copy.modelId) return 'native-fixture'
      expect(password).toBe(true)
      return key.value
    },
  }
  const request = connection.nativeRequest.bind(connection)
  const initialCatalog = await request('session/modelCatalog', {}) as ModelCatalog
  expect(initialCatalog.groups.some(group => group.id === 'deepseek-official')).toBe(false)
  const freshPatch = await readFile(join(home, 'profiles/desktop/cordis.patch.yml'))
  const declaredUi: ProviderSetupUi = { ...ui,
    pick: async (title, choices) => {
      if (title === copy.model) {
        expect(choices).toEqual([
          { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash' },
          { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro' },
          { id: '\u0000custom', label: copy.customModel },
        ])
        return 'deepseek-flash'
      }
      return ui.pick(title, choices)
    },
    input: async (title, value, password, validate) => {
      expect(title).not.toBe(copy.modelId)
      return ui.input(title, value, password, validate)
    },
  }
  expect(await setupSharedProvider(request, { ...declaredUi,
    pick: async (title, choices) => title === copy.saveProvider ? 'cancel' : declaredUi.pick(title, choices),
  }, copy, () => true)).toBe('cancelled')
  expect(await readFile(join(home, 'profiles/desktop/cordis.patch.yml'))).toEqual(freshPatch)
  expect(await request('credentials/describe', { refs: ['DEEPSEEK_API_KEY'] }))
    .toMatchObject({ DEEPSEEK_API_KEY: { configured: false } })
  expect(await setupSharedProvider(request, declaredUi, copy, () => true)).toBe('saved')
  const declaredCatalog = await request('session/modelCatalog', {}) as ModelCatalog
  expect(declaredCatalog.default).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-flash' })
  const catalogModels = declaredCatalog.groups.find(group => group.id === 'deepseek-official')?.models
  expect(catalogModels?.find(model => model.id === 'deepseek-flash')).toMatchObject({
    id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash',
  })
  const directory = await request('llm/listConfigurableProviders', {}) as { provider: string; settingsNs: string }[]
  const providerNs = directory.find(entry => entry.provider === 'deepseek-official')!.settingsNs
  const declaredSettings = await request('settings/describe', {}) as {
    namespaces: { ns: string; value: { models?: { id: string }[] } }[]
  }
  const configuredModels = declaredSettings.namespaces.find(section => section.ns === providerNs)?.value.models
  expect(configuredModels?.find(model => model.id === 'deepseek-flash')).toMatchObject({
    id: 'deepseek-flash', inputModalities: ['text', 'image'],
    systemPromptUpdate: 'in-history', toolUpdate: 'addition-only',
  })
  const defaultPatch = await readFile(join(home, 'profiles/desktop/cordis.patch.yml'), 'utf8')
  expect(defaultPatch).not.toMatch(/^\s+models:/m)
  expect(provider.requests).toHaveLength(0)
  expect(await setupSharedProvider(request, ui, copy, () => true)).toBe('saved')
  expect(provider.requests).toHaveLength(0)
  const desktop = await attach('desktop')
  expect(desktop.ready.pid).toBe(editor.ready.pid)
  const api = await sharedBackendApi(desktop)
  const settings = JSON.stringify(await api('settings/describe', {}))
  expect(settings).toContain(provider.baseURL)
  expect(settings).toContain('native-fixture')
  expect(settings).not.toContain(key.value)
  const patch = await readFile(join(home, 'profiles/desktop/cordis.patch.yml'))
  const credentials = await readFile(join(home, '.credentials.yaml'))
  expect(await setupSharedProvider(request, { ...ui, pick: async title => title === copy.saveProvider ? 'cancel' : ui.pick(title, []) }, copy, () => true)).toBe('cancelled')
  expect(await readFile(join(home, 'profiles/desktop/cordis.patch.yml'))).toEqual(patch)
  expect(await readFile(join(home, '.credentials.yaml'))).toEqual(credentials)
  const catalog = await api('session/modelCatalog', {}) as { default: { provider: string; model: string } }
  expect(catalog.default).toMatchObject({ provider: 'deepseek-official', model: 'native-fixture' })
  const created = await api('workspace/create', { request: { path: workspace } }) as { workspace: { workspaceId: string } }
  const session = await api('session/create', { request: { workspaceId: created.workspace.workspaceId } }) as { sessionId: string }
  const prompt = async (marker: string) => {
    const count = provider.requests.length
    await api('session/prompt', { request: { sessionId: session.sessionId, requestId: randomUUID(), mode: 'queue',
      content: [{ type: 'text', text: marker }] } })
    await vi.waitFor(() => { expect(provider.requests.length).toBeGreaterThan(count) }, { timeout: 30_000 })
    await vi.waitFor(async () => {
      const projection = await api('session/projections', { request: { sessionId: session.sessionId } }) as SessionProjectionsValue
      if (projection?.kind !== 'sequenced') throw new Error('Live Session has no sequenced projection')
      const page = await api('session/page', { request: { address: { kind: 'session', sessionId: session.sessionId }, throughSeq: projection.asOfSeq, maxMessages: 20 } })
      expect(JSON.stringify(page)).toContain('NATIVE_PROVIDER_DONE')
    }, { timeout: 30_000 })
  }
  await prompt('Fresh native setup fixture')
  expect(provider.requests[0]?.headers['x-api-key']).toBe(key.value)
  key.value = 'fixture-only-rotated-key'
  expect(await setupSharedProvider(request, ui, copy, () => true)).toBe('saved')
  await prompt('Rotated native setup fixture')
  expect(provider.requests.at(-1)?.headers['x-api-key']).toBe(key.value)
  await editor.close()
  expect(JSON.stringify(await api('session/list', { _request: {} }))).toContain(session.sessionId)
}, 120_000)
