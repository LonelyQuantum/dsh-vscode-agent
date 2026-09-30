// @vitest-environment jsdom
/** Navigation exercises the shared factory with deterministic controller snapshots. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { Conversation } from '../src/client/Conversation.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const sessionId = 'session-a' as SessionId
const archived = 'session-archived' as SessionId
const other = 'session-other' as SessionId
const child = 'session-child' as SessionId
const workspaceId = 'workspace-a' as WorkspaceId
const dictionary: Readonly<Record<string, string>> = en

function fixture(state: 'ready' | 'loading' | 'error' = 'ready', blank = false) {
  const factory = vi.fn<ComponentProps<typeof Conversation>['renderFactorySlot']>(() => <div>Shared conversation</div>)
  const props: ComponentProps<typeof Conversation> = {
    sessionId,
    useSession: () => undefined,
    useSessions: selector => selector({
      ids: [sessionId, archived], phase: 'ready', projectionsBySession: {},
      byId: {
        [sessionId]: { id: sessionId, displayTitle: 'Current task', running: false, retainedBy: {}, blank, updatedAt: 1 },
        [archived]: { id: archived, displayTitle: 'Archived task', running: false, retainedBy: {}, blank: false, updatedAt: 1 },
      },
    }),
    useWorkspaces: selector => selector({ items: [{ workspaceId, path: '/workspace', title: 'Workspace', sessionIds: [sessionId, archived], createdAt: '0', updatedAt: '0' }], archivedSessionIds: [archived], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
    useWorkspaceBoot: selector => selector({ state, workspaceId }),
    t: key => dictionary[key] ?? key, renderFactorySlot: factory,
    selected: vi.fn(), ready: vi.fn(), showConversations: vi.fn(), openSession: vi.fn(), configure: vi.fn(), retry: vi.fn(),
    capture: vi.fn(),
  }
  const view = render(<Conversation {...props} />)
  return { props, factory, view }
}

it('renders shared conversation content and persists the selected session', () => {
  const { props, factory } = fixture()
  expect(screen.getByText('Shared conversation')).toBeTruthy()
  expect(factory).toHaveBeenCalledWith('conversation.content', { variant: 'embedded', phase: 'active', hero: false })
  expect(props.selected).toHaveBeenCalledWith(sessionId)
  expect(props.ready).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: en.backToList }))
  expect(props.showConversations).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'History' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'New conversation' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Attach file' })).toBeNull()
  fireEvent.click(screen.getByText('API settings'))
  expect(props.configure).toHaveBeenCalledOnce()
})

it('lists only this workspace’s active sessions and resumes one', () => {
  const { props, view } = fixture('ready', true)
  props.useSessions = selector => selector({ ids: [sessionId, archived, other], phase: 'ready', projectionsBySession: {}, byId: {
    [sessionId]: { id: sessionId, displayTitle: 'Current task', running: true, retainedBy: {}, blank: false, updatedAt: 1 },
    [archived]: { id: archived, displayTitle: 'Archived task', running: false, retainedBy: {}, blank: false, updatedAt: 1 },
    [other]: { id: other, displayTitle: 'Another workspace task', running: false, retainedBy: {}, blank: false, updatedAt: 1 },
  } })
  view.rerender(<Conversation {...props} sessionId={undefined} />)
  expect(screen.queryByText('Archived task')).toBeNull()
  expect(screen.queryByText('Another workspace task')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Current task' }))
  expect(props.openSession).toHaveBeenCalledWith(sessionId)
  expect(screen.getByRole('navigation', { name: en.historyLabel })).toBeTruthy()
})

it('falls back to all conversations when the workspace contains only blank or archived sessions', () => {
  const { props, view } = fixture('ready', true)
  const original = props.useSessions
  props.useSessions = selector => original(state => selector({ ...state, ids: [...state.ids, other, child], byId: {
    ...state.byId,
    [other]: { id: other, displayTitle: 'Another workspace task', running: true, retainedBy: {}, blank: false, updatedAt: 2 },
    [child]: { id: child, displayTitle: 'Delegated task', origin: 'subagent', running: true, retainedBy: {}, blank: false, updatedAt: 2 },
  } }))
  view.rerender(<Conversation {...props} />)
  expect(screen.getByRole('navigation', { name: en.allConversations })).toBeTruthy()
  expect(screen.queryByText('Current task')).toBeNull()
  expect(screen.queryByText('Archived task')).toBeNull()
  expect(screen.queryByText('Delegated task')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Another workspace task' }))
  expect(props.openSession).toHaveBeenCalledWith(other)
})

it('withholds the previous composer during navigation failure and exposes retry', () => {
  const { props } = fixture('error')
  expect(screen.queryByText('Shared conversation')).toBeNull()
  expect(screen.getByRole('button', { name: en.selection }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(props.retry).toHaveBeenCalledOnce()
})

it('shows the upper-left return control only for an existing conversation', () => {
  const { view, props } = fixture()
  const back = screen.getByRole('button', { name: en.backToList })
  expect(back.closest('header')).toBeTruthy()
  view.rerender(<Conversation {...props} sessionId={undefined} />)
  expect(screen.queryByRole('button', { name: en.backToList })).toBeNull()
})

it('shows the empty all-conversations list above the new-message composer without saved conversations', () => {
  const { factory } = fixture('ready', true)
  const history = screen.getByRole('navigation', { name: en.allConversations })
  expect(history.textContent).toContain(en.empty)
  expect(screen.queryByRole('button', { name: 'Current task' })).toBeNull()
  expect(screen.getByText('Shared conversation')).toBeTruthy()
  const call = factory.mock.calls.at(-1)!
  expect(call[0]).toBe('conversation.content')
  expect(call[1]).toHaveProperty('hero', false)
  expect(call[1]).toHaveProperty('slots.views', expect.any(Function))
})

it('aborts pending capture when returning to the list begins', () => {
  const { props, view } = fixture()
  fireEvent.click(screen.getByRole('button', { name: en.selection }))
  const signal = vi.mocked(props.capture).mock.calls[0]![1]
  view.rerender(<Conversation {...props} useWorkspaceBoot={selector => selector({ state: 'loading', workspaceId })} />)
  expect(signal.aborted).toBe(true)
  expect(screen.queryByText('Shared conversation')).toBeNull()
})

it('keeps context actions below the composer and cancels capture on unmount', () => {
  const { props } = fixture()
  const composer = screen.getByText('Shared conversation')
  const action = screen.getByRole('button', { name: en.selection })
  expect(composer.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(action)
  expect(props.capture).toHaveBeenCalledWith('selection', expect.any(AbortSignal))
  fireEvent.click(screen.getByRole('button', { name: en.problems }))
  expect(props.capture).toHaveBeenLastCalledWith('problems', expect.any(AbortSignal))
  const signal = vi.mocked(props.capture).mock.calls[0]![1]
  cleanup()
  expect(signal.aborted).toBe(true)
})
