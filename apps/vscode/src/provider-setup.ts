/** Native provider setup over DSH's configurable directory and revision-checked settings. */
import { NativeRequestError, type NativeMethod } from './proxy.ts'
import type { extensionCopy } from './locale.ts'

type RecordValue = Record<string, unknown>
type Copy = ReturnType<typeof extensionCopy>
interface Namespace { ns: string; revision: number; value: RecordValue }
interface Provider { provider: string; displayName: string; settingsNs: string; settingsPath: string[] }

/** Native UI callbacks; secret input must use a password control and must not be logged. */
export interface ProviderSetupUi {
  pick: (this: void, title: string, choices: readonly { label: string; id: string }[]) => Promise<string | undefined>
  input: (this: void, title: string, value: string, password: boolean,
    validate: (value: string) => string | undefined) => Promise<string | undefined>
}
/** Authenticated configuration calls retained only in the Extension Host. */
export type NativeRequest = (method: NativeMethod, args: object) => Promise<unknown>

function record(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NativeRequestError('response')
  return value as RecordValue
}
function records(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) throw new NativeRequestError('response')
  return value.map(record)
}
function namespace(value: RecordValue): Namespace {
  if (typeof value.ns !== 'string' || !Number.isSafeInteger(value.revision)) throw new NativeRequestError('response')
  return { ns: value.ns, revision: Number(value.revision), value: record(value.value) }
}
function provider(value: RecordValue): Provider {
  if (typeof value.provider !== 'string' || typeof value.displayName !== 'string' || typeof value.settingsNs !== 'string'
    || !Array.isArray(value.settingsPath) || !value.settingsPath.every(key => typeof key === 'string' && key.length > 0)) {
    throw new NativeRequestError('response')
  }
  const path: unknown[] = value.settingsPath
  const settingsPath = path.map((key) => {
    if (typeof key !== 'string') throw new NativeRequestError('response')
    return key
  })
  return { provider: value.provider, displayName: value.displayName, settingsNs: value.settingsNs, settingsPath }
}

/**
 * Reject credentials embedded in an endpoint; blank retains the provider-owned default.
 * @param value Native input.
 * @returns Whether the endpoint can be saved as non-secret configuration.
 */
export function validProviderEndpoint(value: string): boolean {
  if (value.trim() === '') return true
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname
      && !url.username && !url.password && !url.search && !url.hash
  } catch (_error) { return false }
}

/**
 * Gather and confirm all native inputs before writing; cancellation performs no writes.
 * Provider validation and stale-write refusal happen before credential rotation. Saves do not run a model test.
 * @param request Native-only authenticated Remote caller.
 * @param ui Native selectors, password input and explicit save confirmation.
 * @param copy Extension locale.
 * @param active Rechecked after every user interaction and before each write; revoked trust cancels remaining work.
 * @returns Cancelled or saved; a failure after one write reports partial configuration instead of retrying.
 */
export async function setupSharedProvider(request: NativeRequest, ui: ProviderSetupUi, copy: Copy, active: () => boolean): Promise<'cancelled' | 'saved'> {
  const [rawSettings, rawDirectory, rawCatalog] = await Promise.all([
    request('settings/describe', {}), request('llm/listConfigurableProviders', {}), request('session/modelCatalog', {}),
  ])
  if (!active()) return 'cancelled'
  const settings = record(rawSettings)
  if (settings.writable !== true) throw new NativeRequestError('readonly')
  const namespaces = records(settings.namespaces).map(namespace)
  const directory = records(rawDirectory).map(provider).filter(row => namespaces.some(ns => ns.ns === row.settingsNs))
    .filter(row => row.provider !== 'deepseek-account')
    .toSorted((left, right) => Number(right.provider === 'deepseek-official') - Number(left.provider === 'deepseek-official'))
  const selected = await ui.pick(copy.provider, directory.map(row => ({ label: row.displayName, id: row.provider })))
  if (!selected || !active()) return 'cancelled'
  const entry = directory.find(row => row.provider === selected)
  const owner = namespaces.find(row => row.ns === entry?.settingsNs)
  const defaults = namespaces.find(row => row.ns === 'agent-default-model')
  if (!entry || !owner || !defaults) throw new NativeRequestError('response')
  let profile: unknown = owner.value
  for (const key of entry.settingsPath) profile = record(profile)[key] ?? {}
  const fields = record(profile)
  const ref = typeof fields.apiKeyEnv === 'string' ? fields.apiKeyEnv : await ui.input(copy.keyReference, '', false,
    value => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim()) ? undefined : copy.invalidReference)
  if (!ref || !active()) return 'cancelled'
  const reference = ref.trim()
  const info = record(record(await request('credentials/describe', { refs: [reference] }))[reference])
  if (!active()) return 'cancelled'
  if (info.writable !== true) throw new NativeRequestError('readonly')
  const endpoint = await ui.input(copy.endpoint, typeof fields.baseURL === 'string' ? fields.baseURL : '', false,
    value => validProviderEndpoint(value) ? undefined : copy.invalidEndpoint)
  if (endpoint === undefined || !active()) return 'cancelled'
  if (!validProviderEndpoint(endpoint)) throw new NativeRequestError('input')
  const key = await ui.input(info.configured === true ? copy.rotateKey : copy.sharedKey, '', true,
    value => info.configured === true || value.trim() ? undefined : copy.keyRequired)
  if (key === undefined || !active()) return 'cancelled'
  if (!key.trim() && info.configured !== true) throw new NativeRequestError('input')
  const groups = records(record(rawCatalog).groups)
  const group = groups.find(row => row.id === selected)
  const models = group ? records(group.models) : []
  const modelId = await ui.pick(copy.model, [...models.map((row) => {
    if (typeof row.id !== 'string' || typeof row.name !== 'string') throw new NativeRequestError('response')
    return { label: row.name, id: row.id }
  }), { label: copy.customModel, id: '\u0000custom' }])
  if (modelId === undefined || !active()) return 'cancelled'
  const custom = modelId === '\u0000custom' ? await ui.input(copy.modelId, '', false,
    value => value.trim() && !/\s/.test(value.trim()) && !/[\u0000-\u001f]/.test(value.trim()) ? undefined : copy.invalidModel) : undefined
  if (modelId === '\u0000custom' && (custom === undefined || !active())) return 'cancelled'
  const model = custom?.trim() ?? modelId
  if (!model || /\s/.test(model) || /[\u0000-\u001f]/.test(model)) throw new NativeRequestError('input')
  const confirm = await ui.pick(copy.saveProvider, [{ label: copy.save, id: 'save' }, { label: copy.cancel, id: 'cancel' }])
  if (confirm !== 'save' || !active()) return 'cancelled'
  const ops: { op: 'set'; path: string[]; value: unknown }[] = [
    { op: 'set', path: [...entry.settingsPath, 'apiKeyEnv'], value: reference },
  ]
  if (endpoint.trim()) ops.push({ op: 'set', path: [...entry.settingsPath, 'baseURL'], value: endpoint.trim() })
  if (custom !== undefined) {
    const previous = fields.models === undefined ? [] : records(fields.models)
    ops.push({ op: 'set', path: [...entry.settingsPath, 'models'], value:
      [...previous.filter(row => row.id !== model), { id: model, name: model }] })
  }
  await request('settings/mutate', { ns: owner.ns, ops, expectedRevision: owner.revision })
  if (!active()) throw new NativeRequestError('partial')
  try {
    if (key.trim()) await request('credentials/set', { ref: reference, value: key.trim() })
    if (!active()) throw new NativeRequestError('partial')
    const chosen = models.find(row => row.id === model)
    const effort = chosen?.reasoning === undefined ? undefined : record(chosen.reasoning).defaultEffort
    await request('settings/mutate', { ns: defaults.ns, expectedRevision: defaults.revision, ops: [
      { op: 'set', path: ['provider'], value: selected }, { op: 'set', path: ['model'], value: model },
      ...(typeof effort === 'string' ? [{ op: 'set', path: ['reasoningEffort'], value: effort }]
        : [{ op: 'unset', path: ['reasoningEffort'] }]),
    ] })
  } catch (_error) { throw new NativeRequestError('partial') }
  return 'saved'
}
