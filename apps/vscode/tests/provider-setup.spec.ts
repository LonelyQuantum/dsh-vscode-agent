/** Native setup leaves cancellation and stale forms write-free, and never puts keys in UI choices. */
import { expect, it, vi } from 'vitest'
import { setupSharedProvider, validProviderEndpoint, type ProviderSetupUi } from '../src/provider-setup.ts'
import { NativeRequestError } from '../src/proxy.ts'
import { extensionCopy } from '../src/locale.ts'

const copy = extensionCopy('en')
function fixture() {
  const writes: { method: string; args: object }[] = []
  const request = vi.fn(async (method: string, args: object): Promise<unknown> => {
    if (method === 'settings/describe') return { writable: true, namespaces: [
      { ns: 'provider-entry', revision: 7, value: { apiKeyEnv: 'FIXTURE_KEY', baseURL: 'https://example.test/api', models: [{ id: 'fixture' }] } },
      { ns: 'agent-default-model', revision: 2, value: { provider: 'fixture', model: 'fixture' } },
    ] }
    if (method === 'llm/listConfigurableProviders') return [{ provider: 'fixture', displayName: 'Fixture', settingsNs: 'provider-entry', settingsPath: [] }]
    if (method === 'session/modelCatalog') return { groups: [{ id: 'fixture', models: [{ id: 'fixture', name: 'Fixture model' }] }] }
    if (method === 'credentials/describe') return { FIXTURE_KEY: { writable: true, configured: true } }
    writes.push({ method, args })
  })
  const ui: ProviderSetupUi = { pick: vi.fn(async title => title === copy.saveProvider ? 'save' : 'fixture'),
    input: vi.fn(async title => title === copy.endpoint ? 'https://example.test/new' : 'fixture-only-rotated-key') }
  return { writes, request, ui }
}

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
