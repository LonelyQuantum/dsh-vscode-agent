/** Native setup leaves cancellation and stale forms write-free, and never puts keys in UI choices. */
import { expect, it, vi } from 'vitest'
import { setupSharedProvider, validProviderEndpoint, type ProviderSetupUi } from '../src/provider-setup.ts'
import { NativeRequestError } from '../src/proxy.ts'
import { extensionCopy } from '../src/locale.ts'

const copy = extensionCopy('en')
const declaredModel = { id: 'fixture', name: 'Declared fixture', contextWindow: 64000,
  inputModalities: ['text', 'image'], systemPromptUpdate: 'in-history', toolUpdate: 'addition-only',
  reasoningEfforts: ['off', 'low', 'high'], defaultReasoningEffort: 'high' }
function fixture(options: { configured?: boolean; catalog?: 'ready' | 'hidden' | 'empty'; models?: Record<string, unknown>[] } = {}) {
  const writes: { method: string; args: object }[] = []
  const request = vi.fn(async (method: string, args: object): Promise<unknown> => {
    if (method === 'settings/describe') return { writable: true, namespaces: [
      { ns: 'provider-entry', revision: 7, value: { apiKeyEnv: 'FIXTURE_KEY', baseURL: 'https://example.test/api', models: options.models ?? [declaredModel] } },
      { ns: 'agent-default-model', revision: 2, value: { provider: 'fixture', model: 'fixture' } },
    ] }
    if (method === 'llm/listConfigurableProviders') return [{ provider: 'fixture', displayName: 'Fixture', settingsNs: 'provider-entry', settingsPath: [] }]
    if (method === 'session/modelCatalog') return { groups: options.catalog === 'hidden' ? [] :
      [{ id: 'fixture', models: options.catalog === 'empty' ? [] : [{ id: 'fixture', name: 'Fixture model' }] }] }
    if (method === 'credentials/describe') return { FIXTURE_KEY: { writable: true, configured: options.configured ?? true } }
    writes.push({ method, args })
  })
  const ui: ProviderSetupUi = { pick: vi.fn(async title => title === copy.saveProvider ? 'save' : 'fixture'),
    input: vi.fn(async title => title === copy.endpoint ? 'https://example.test/new' : 'fixture-only-rotated-key') }
  return { writes, request, ui }
}

it.each(['hidden', 'empty'] as const)('offers declared models before saving a first key when the live catalog is %s', async (catalog) => {
  const f = fixture({ configured: false, catalog })
  const pick = f.ui.pick
  f.ui.pick = async (title, choices) => {
    if (title === copy.model) {
      expect(f.writes).toEqual([])
      expect(choices).toEqual([{ label: declaredModel.name, id: declaredModel.id }, { label: copy.customModel, id: '\u0000custom' }])
    }
    return pick(title, choices)
  }
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('saved')
  expect(vi.mocked(f.ui.input).mock.calls.some(call => call[0] === copy.modelId)).toBe(false)
  expect(vi.mocked(f.ui.input).mock.calls.find(call => call[0] === copy.sharedKey)?.[2]).toBe(true)
  expect(f.writes[0]?.args).toMatchObject({ ops: [
    { op: 'set', path: ['apiKeyEnv'], value: 'FIXTURE_KEY' },
    { op: 'set', path: ['baseURL'], value: 'https://example.test/new' },
  ] })
})

it('cancels first-key confirmation without saving a provider or credential', async () => {
  const f = fixture({ configured: false, catalog: 'hidden' })
  const pick = f.ui.pick
  f.ui.pick = async (title, choices) => title === copy.saveProvider ? 'cancel' : pick(title, choices)
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('cancelled')
  expect(f.writes).toEqual([])
})

it('labels a declared model by its ID when no display name is configured', async () => {
  const f = fixture({ configured: false, catalog: 'hidden', models: [{ id: 'fixture' }] })
  const pick = f.ui.pick
  f.ui.pick = async (title, choices) => {
    if (title === copy.model) expect(choices[0]).toEqual({ id: 'fixture', label: 'fixture' })
    return pick(title, choices)
  }
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('saved')
})

it.each([{ id: 1 }, { id: 'fixture', name: 1 }])('refuses malformed declared model fields without saving the key: %j', async (model) => {
  const f = fixture({ configured: false, catalog: 'hidden', models: [model] })
  await expect(setupSharedProvider(f.request, f.ui, copy, () => true)).rejects.toMatchObject({ code: 'response' })
  expect(f.writes).toEqual([])
})

it('retains declared capabilities when a custom model ID names an existing entry', async () => {
  const f = fixture()
  const pick = f.ui.pick
  const input = f.ui.input
  f.ui.pick = async (title, choices) => title === copy.model ? '\u0000custom' : pick(title, choices)
  f.ui.input = async (title, value, password, validate) =>
    title === copy.modelId ? declaredModel.id : input(title, value, password, validate)
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('saved')
  expect(f.writes[0]?.args).toMatchObject({ ops: [
    { op: 'set', path: ['apiKeyEnv'], value: 'FIXTURE_KEY' },
    { op: 'set', path: ['baseURL'], value: 'https://example.test/new' },
  ] })
})

it('uses directory-owned settings addresses, CAS revisions and native-only credential writes', async () => {
  const f = fixture()
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('saved')
  expect(f.writes.map(row => row.method)).toEqual(['settings/mutate', 'credentials/set', 'settings/mutate'])
  expect(f.writes[0]?.args).toMatchObject({ ns: 'provider-entry', expectedRevision: 7 })
  expect(f.writes[2]?.args).toMatchObject({ ns: 'agent-default-model', expectedRevision: 2 })
  expect(JSON.stringify(f.writes.filter(row => row.method !== 'credentials/set'))).not.toContain('fixture-only-rotated-key')
  expect(JSON.stringify(vi.mocked(f.ui.pick).mock.calls)).not.toContain('fixture-only-rotated-key')
  expect(vi.mocked(f.ui.input).mock.calls.find(call => call[0] === copy.rotateKey)?.[2]).toBe(true)
})

it.each(['provider', 'endpoint', 'key', 'model', 'confirmation'])('cancels at %s without changing a provider or credential', async (stage) => {
  const f = fixture()
  const title = { provider: copy.provider, endpoint: copy.endpoint, key: copy.rotateKey,
    model: copy.model, confirmation: copy.saveProvider }[stage]!
  const originalPick = f.ui.pick
  const originalInput = f.ui.input
  f.ui.pick = async (current, choices) => current === title ? undefined : originalPick(current, choices)
  f.ui.input = async (current, value, password, validate) => current === title ? undefined
    : originalInput(current, value, password, validate)
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('cancelled')
  expect(f.writes).toEqual([])
})

it('does not rotate a key when provider validation or CAS rejects the form', async () => {
  const f = fixture()
  const original = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, args) => {
    if (method === 'settings/mutate') throw new NativeRequestError('settings/conflict')
    return original(method, args)
  })
  await expect(setupSharedProvider(f.request, f.ui, copy, () => true)).rejects.toMatchObject({ code: 'settings/conflict' })
  expect(f.writes).toEqual([])
})

it('rechecks trust after native input and before admitting writes', async () => {
  const f = fixture()
  let active = true
  f.ui.input = async () => { active = false; return 'fixture-only-key' }
  expect(await setupSharedProvider(f.request, f.ui, copy, () => active)).toBe('cancelled')
  expect(f.writes).toEqual([])
})

it('retains an existing credential when native key input is blank', async () => {
  const f = fixture()
  f.ui.input = async () => ''
  expect(await setupSharedProvider(f.request, f.ui, copy, () => true)).toBe('saved')
  expect(f.writes.map(row => row.method)).toEqual(['settings/mutate', 'settings/mutate'])
  expect(JSON.stringify(f.writes)).not.toContain('baseURL')
})

it('reports an incomplete save without automatic retries or exposing a backend diagnostic', async () => {
  const f = fixture()
  const original = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, args) => {
    if (method === 'credentials/set') throw new Error('fixture-only-key must not be shown')
    return original(method, args)
  })
  await expect(setupSharedProvider(f.request, f.ui, copy, () => true)).rejects.toMatchObject({ code: 'partial', message: 'Native DSH configuration request failed' })
  expect(f.writes).toHaveLength(1)
})

it.each(['https://user:password@example.test', 'https://example.test?api_key=fixture', 'https://example.test#key', 'file:///tmp', 'not a URL'])('refuses credential-bearing or non-HTTP endpoints before saving: %s', async (endpoint) => {
  expect(validProviderEndpoint(endpoint)).toBe(false)
  const f = fixture()
  f.ui.input = async () => endpoint
  await expect(setupSharedProvider(f.request, f.ui, copy, () => true)).rejects.toMatchObject({ code: 'input' })
  expect(f.writes).toEqual([])
})
