/** Editor chrome around the shared Conversation Factory, with no parallel Session state. */
import { useEffect, useRef } from 'react'
import { Button, IconChevronLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EditorProps } from './contract.ts'
import css from './Conversation.module.css'

function NoTranscript() { return null }

/**
 * Render editor navigation and the shared conversation.
 * @param props Framework-owned input.
 * @returns Single-column conversation.
 */
export function Conversation(props: Pick<EditorProps, 'sessionId' | 'useSession' | 'useSessions' | 'useWorkspaces' | 'useWorkspaceBoot' | 't' | 'renderFactorySlot' | 'selected' | 'ready' | 'showConversations' | 'openSession' | 'configure' | 'retry' | 'capture'>) {
  const { sessionId, useSession, useSessions, useWorkspaces, useWorkspaceBoot, t, renderFactorySlot } = props
  const session = useSession(snapshot => snapshot)
  const sessions = useSessions(snapshot => snapshot)
  const workspaces = useWorkspaces(snapshot => snapshot)
  const boot = useWorkspaceBoot(snapshot => snapshot)
  const captureLifetime = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    captureLifetime.current = controller
    return () => { controller.abort() }
  }, [sessionId, boot.state])
  const workspace = workspaces.items.find(item => item.workspaceId === boot.workspaceId)
  const archived = new Set(workspaces.archivedSessionIds)
  const visible = sessions.ids.map(id => sessions.byId[id]).filter(row => row !== undefined)
    .filter(row => !row.blank && row.origin !== 'subagent' && !archived.has(row.id))
  const local = visible.filter(row => workspace?.sessionIds.includes(row.id))
  const rows = local.length > 0 ? local : visible
  const listLabel = t(local.length > 0 ? 'historyLabel' : 'allConversations')
  const showList = boot.state !== 'ready' || sessionId === undefined || sessions.byId[sessionId]?.blank === true
  useEffect(() => { if (sessionId !== undefined) props.selected(sessionId) }, [sessionId, props.selected])
  useEffect(() => { props.ready() }, [props.ready])
  return <section className={css.root} data-vscode-conversation="">
    <header className={css.heading}>
      {!showList && <Tooltip label={t('backToList')} side="bottom" portal>
        <Button size="sm" aria-label={t('backToList')} onClick={props.showConversations}>
          <IconChevronLeftOutlineRegular />
        </Button>
      </Tooltip>}
      <strong className={css.title}>{showList ? listLabel : sessions.byId[sessionId]?.displayTitle || t('newSession')}</strong>
    </header>
    {boot.state !== 'ready' && <div role="status" className={css.notice}>
      {t(boot.state === 'loading' ? 'loading' : 'failed')}
      {boot.state === 'error' && <Button size="sm" onClick={props.retry}>{t('retry')}</Button>}
    </div>}
    {showList && <nav className={css.history} aria-label={listLabel}>
      {rows.length === 0 && <p>{t('empty')}</p>}
      {rows.map(row => <button type="button" key={row.id} className={css.session} data-session-id={row.id} aria-current={row.id === sessionId ? 'true' : undefined}
        disabled={boot.state !== 'ready'} onClick={() => { props.openSession(row.id) }}>{row.displayTitle || t('newSession')}</button>)}
    </nav>}
    {boot.state === 'ready' && <div className={css.content} data-list={showList || undefined}>
      {renderFactorySlot('conversation.content', {
        variant: 'embedded', phase: session?.openState === 'loading' ? 'settling' : 'active', hero: false,
        ...(showList ? { slots: { views: NoTranscript } } : {}),
      })}
    </div>}
    <footer className={css.toolbar} aria-label={t('actions')}>
      {(['selection', 'problems'] as const).map(kind => <Button key={kind} size="sm" disabled={sessionId === undefined || boot.state !== 'ready'}
        onClick={() => { if (captureLifetime.current !== undefined) props.capture(kind, captureLifetime.current.signal) }}>
        {t(kind)}
      </Button>)}
      <Button size="sm" onClick={props.configure}>{t('settings')}</Button>
    </footer>
  </section>
}
