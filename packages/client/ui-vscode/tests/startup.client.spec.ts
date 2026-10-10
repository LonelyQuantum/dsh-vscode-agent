// @vitest-environment jsdom
/** Startup waits for remote baselines and ignores results after plugin disposal. */
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { EditorInjected } from '../src/client/contract.ts'

const owners = new Set<Fiber>()
afterEach(async () => {
  try { for (const owner of owners) await owner.dispose() }
  finally { owners.clear(); vi.unstubAllGlobals() }
})

async function fixture(saved?: string, delayed = false) {
  const root = new Context()
  const owner = root.plugin(() => {})
  owners.add(owner)
  const ctx = owner.ctx
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const sessions = createSnapshotStore({ phase: 'pending' })
  const workspaces = createSnapshotStore({ phase: 'pending', archivedSessionIds: ['archived'] })
  const workspace = { workspaceId: 'workspace', sessionIds: ['saved', 'archived'] }
  let complete!: () => void
  const pending = new Promise<typeof workspace>((resolve) => { complete = () => { resolve(workspace) } })
  const create = vi.fn(() => delayed ? pending : Promise.resolve(workspace))
  const openSession = vi.fn()
  const openWorkspace = vi.fn(() => Promise.resolve())
  // Only startup's controller methods are supplied; no remote protocol is mocked.
  ctx.provide('sessions', { list: sessions } as never)
  ctx.provide('workspaces', { list: workspaces, create } as never)
  ctx.provide('uiWorkspace', { openSession, openWorkspace } as never)
  ctx.provide('uiConversation', {} as never)
  ctx.provide('conversation', {} as never)
  ctx.provide('inputTriggers', { registerSource: () => () => {} } as never)
  ctx.provide('theme', { register: () => () => {} } as never)
  vi.stubGlobal('__DSH_VSCODE__', { workspace: () => '/workspace', lastSession: () => saved, configure: vi.fn(), selected: vi.fn(), ready: vi.fn() })
  const slots = ctx.get('slots') as SlotRegistry
  const original = slots.register({ name: 'root' }, () => null)
  const fiber = ctx.plugin({ apply, inject })
  await fiber.await()
  const entry = slots.entries('vscode.conversation')[0]!
  const injected = entry.inject!({} as never) as EditorInjected
  const ready = () => { workspaces.set({ phase: 'ready', archivedSessionIds: ['archived'] }); sessions.set({ phase: 'ready' }) }
  return { slots, fiber, original, create, openSession, openWorkspace, sessions, workspaces, injected, ready, complete }
}

it('opens the workspace draft after both baselines, without restoring the saved conversation', async () => {
  const f = await fixture('saved')
  expect(f.create).not.toHaveBeenCalled()
  f.sessions.set({ phase: 'ready' })
  expect(f.create).not.toHaveBeenCalled()
  f.ready()
  await vi.waitFor(() => { expect(f.openWorkspace).toHaveBeenCalledWith('workspace') })
  expect(f.openSession).not.toHaveBeenCalled()
  expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('ready')
  expect(f.slots.entries('root')).toHaveLength(2)
  await f.fiber.dispose()
  expect(f.slots.entries('root')).toHaveLength(1)
  f.original()
})

it.each(['archived', 'another-workspace', undefined])('opens the workspace draft regardless of saved selection %s', async (saved) => {
  const f = await fixture(saved)
  f.ready()
  await vi.waitFor(() => { expect(f.openWorkspace).toHaveBeenCalledWith('workspace') })
  expect(f.openSession).not.toHaveBeenCalled()
})

it('returns through workspace navigation without a stop operation and suppresses repeated returns', async () => {
  const f = await fixture()
  f.ready()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('ready') })
  let complete!: () => void
  f.openWorkspace.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve }))
  f.injected.showConversations()
  f.injected.showConversations()
  expect(f.openWorkspace).toHaveBeenCalledTimes(2)
  expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('loading')
  complete()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('ready') })
})

it('allows retry after returning to the list fails', async () => {
  const f = await fixture()
  f.ready()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('ready') })
  f.openWorkspace.mockRejectedValueOnce(new Error('unavailable'))
  f.injected.showConversations()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('error') })
  f.injected.retry()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('ready') })
})

it('does not navigate after disposal while creation is pending', async () => {
  const f = await fixture('saved', true)
  f.ready()
  expect(f.create).toHaveBeenCalledOnce()
  await f.fiber.dispose()
  f.complete()
  await Promise.resolve()
  await Promise.resolve()
  expect(f.openSession).not.toHaveBeenCalled()
  expect(f.openWorkspace).not.toHaveBeenCalled()
})

it('keeps failure visible until an explicit retry', async () => {
  const f = await fixture()
  f.create.mockRejectedValueOnce(new Error('unavailable'))
  f.ready()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('error') })
  f.ready()
  expect(f.create).toHaveBeenCalledOnce()
  f.injected.retry()
  await vi.waitFor(() => { expect(f.injected.hooks.workspaceBoot.getSnapshot().state).toBe('ready') })
  expect(f.create).toHaveBeenCalledTimes(2)
})
