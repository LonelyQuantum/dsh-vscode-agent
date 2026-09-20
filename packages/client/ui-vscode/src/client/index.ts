/** VS Code-only root composition; upstream plugins retain all Session and Conversation behavior. */
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { EditorInjected, WorkspaceBoot } from './contract.ts'
import { Conversation } from './Conversation.tsx'
import { en, zh } from './locales.ts'
import { captureSource, insertCapture } from './capture.ts'
import { installEditorTheme } from './theme.ts'

/** Shared Client services required by this presentation. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'uiConversation', 'conversation', 'inputTriggers', 'theme']

function Root({ renderSlot }: PropsRenderSlots<'vscode.conversation'>) {
  return renderSlot('vscode.conversation', {})
}

/**
 * Register editor presentation over the shared Web graph.
 * @param ctx Client services.
 */
export function apply(ctx: Context): void {
  const editor = globalThis.__DSH_VSCODE__
  if (editor === undefined) throw new Error('ui-vscode requires the VS Code editor carrier')
  installEditorTheme(ctx)
  const boot = createSnapshotStore<WorkspaceBoot>({ state: 'loading' })
  const lifetime = { closed: false }
  const closed = (): boolean => lifetime.closed
  ctx.provide('conversationEditor', {
    openFile: (sessionId, path, line) => {
      const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
      if (cwd === undefined) return Promise.reject(new Error('Viewed Session has no working directory'))
      editor.openFile(cwd, path, line)
      return Promise.resolve()
    },
    openChanges: (sessionId, seq, index) => { editor.openChanges(sessionId, seq, index) },
  })
  let started = false
  const initialize = (): void => {
    if (lifetime.closed || started || ctx.workspaces.list.getSnapshot().phase !== 'ready' || ctx.sessions.list.getSnapshot().phase !== 'ready') return
    started = true
    boot.set({ state: 'loading' })
    void ctx.workspaces.create({ path: editor.workspace() }).then(async (workspace) => {
      if (closed()) return
      const saved = editor.lastSession()
      const existing = workspace.sessionIds.find(id => id === saved && !ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id))
      if (existing !== undefined) ctx.uiWorkspace.openSession(existing)
      else await ctx.uiWorkspace.openWorkspace(workspace.workspaceId)
      if (!closed()) boot.set({ state: 'ready', workspaceId: workspace.workspaceId })
    }).catch(() => { if (!lifetime.closed) boot.set({ state: 'error' }) })
  }
  ctx.effect(() => ctx.locale.register('vscode', { en, zh }))
  ctx.effect(() => ctx.inputTriggers.registerSource(captureSource(editor)))
  const t = ctx.locale.bind('vscode')
  ctx.effect(() => {
    const offWorkspaces = ctx.workspaces.list.subscribe(initialize)
    const offSessions = ctx.sessions.list.subscribe(initialize)
    initialize()
    return () => { lifetime.closed = true; offSessions(); offWorkspaces() }
  })
  const injected = (sessionId: SessionId | undefined): EditorInjected => ({
    capture: (kind, signal) => {
      if (sessionId === undefined) return
      const scope = ctx.sessions.scope(sessionId)
      if (scope === undefined) return
      const input = ctx.conversation.input.for(scope)
      const current = (): boolean => !closed() && ctx.sessions.scope(sessionId) === scope
        && (ctx.sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) > 0
      void insertCapture(editor, kind, input, signal, current).then((inserted) => {
        if (!signal.aborted && current()) {
          if (inserted) input.focus()
          else input.notify('info', t('contextChanged'))
        }
      }).catch(() => { if (!signal.aborted && current()) input.notify('error', t('contextFailed')) })
    },
    hooks: { workspaceBoot: boot },
    startSession: () => {
      const workspaceId = boot.getSnapshot().workspaceId
      if (workspaceId !== undefined) ctx.uiWorkspace.startSession(workspaceId)
    },
    openSession: (id) => { ctx.uiWorkspace.openSession(id) },
    configure: () => { editor.configure() },
    selected: (id) => { editor.selected(id) },
    retry: () => { if (boot.getSnapshot().state === 'error') { started = false; initialize() } },
    ready: () => { editor.ready() },
  })
  ctx.effect(() => ctx.slots.register({ name: 'root', priority: -100,
    children: { 'vscode.conversation': { kind: 'single', scope: 'session-maybe' } },
  }, Root))
  ctx.slots.inject('vscode.conversation', () => ctx.slots.register({
    name: 'vscode.conversation', locale: 'vscode', inject: injected,
  }, props => createElement(Conversation, props)))
}
