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
const workspaceId = 'workspace-a' as WorkspaceId
const dictionary: Readonly<Record<string, string>> = en

function fixture(state: 'ready' | 'loading' | 'error' = 'ready') {
  const factory = vi.fn(() => <div>Shared conversation</div>)
  const props: ComponentProps<typeof Conversation> = {
    sessionId,
    useSession: () => undefined,
    useSessions: selector => selector({
      ids: [sessionId, archived], phase: 'ready', subagentsByParent: {}, jobsBySession: {},
      byId: {
        [sessionId]: { id: sessionId, displayTitle: 'Current task', running: false, retainedBy: {}, blank: false, updatedAt: 1 },
        [archived]: { id: archived, displayTitle: 'Archived task', running: false, retainedBy: {}, blank: false, updatedAt: 1 },
      },
    }),
    useWorkspaces: selector => selector({ items: [{ workspaceId, path: '/workspace', title: 'Workspace', sessionIds: [sessionId, archived], createdAt: '0', updatedAt: '0' }], archivedSessionIds: [archived], state: 'idle', phase: 'ready', error: null }),
    useWorkspaceBoot: selector => selector({ state, workspaceId }),
    t: key => dictionary[key] ?? key, renderFactorySlot: factory,
    selected: vi.fn(), ready: vi.fn(), startSession: vi.fn(), openSession: vi.fn(), configure: vi.fn(), retry: vi.fn(),
    capture: vi.fn(),
  }
  render(<Conversation {...props} />)
  return { props, factory }
}

it('renders shared conversation content and persists the selected session', () => {
  const { props, factory } = fixture()
  expect(screen.getByText('Shared conversation')).toBeTruthy()
  expect(factory).toHaveBeenCalledWith('conversation.content', { variant: 'embedded', phase: 'active', hero: false })
  expect(props.selected).toHaveBeenCalledWith(sessionId)
  expect(props.ready).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('New conversation'))
  expect(props.startSession).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('API key'))
  expect(props.configure).toHaveBeenCalledOnce()
})

it('lists only this workspace’s active sessions and resumes one', () => {
  const { props } = fixture()
  fireEvent.click(screen.getByText('History'))
  expect(screen.queryByText('Archived task')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Current task' }))
  expect(props.openSession).toHaveBeenCalledWith(sessionId)
  expect(screen.queryByRole('navigation')).toBeNull()
})

it('disables new sessions before startup and exposes an explicit retry after failure', () => {
  const { props } = fixture('error')
  expect(screen.getByRole('button', { name: 'New conversation' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(props.retry).toHaveBeenCalledOnce()
})
