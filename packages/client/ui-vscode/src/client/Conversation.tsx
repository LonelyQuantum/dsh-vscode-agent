/** Editor chrome around the shared Conversation Factory, with no parallel Session state. */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EditorProps } from './contract.ts'
import css from './Conversation.module.css'

/**
 * Render editor navigation and the shared conversation.
 * @param props Framework-owned input.
 * @returns Single-column conversation.
 */
export function Conversation(props: Pick<EditorProps, 'sessionId' | 'useSession' | 'useSessions' | 'useWorkspaces' | 'useWorkspaceBoot' | 't' | 'renderFactorySlot' | 'selected' | 'ready' | 'startSession' | 'openSession' | 'configure' | 'retry' | 'capture'>) {
  const { sessionId, useSession, useSessions, useWorkspaces, useWorkspaceBoot, t, renderFactorySlot } = props
  const session = useSession(snapshot => snapshot)
  const sessions = useSessions(snapshot => snapshot)
  const workspaces = useWorkspaces(snapshot => snapshot)
  const boot = useWorkspaceBoot(snapshot => snapshot)
  const [history, setHistory] = useState(false)
  const captureLifetime = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    captureLifetime.current = controller
    return () => { controller.abort() }
  }, [sessionId])
  const workspace = workspaces.items.find(item => item.workspaceId === boot.workspaceId)
  const rows = (workspace?.sessionIds ?? []).filter(id => !workspaces.archivedSessionIds.includes(id))
    .map(id => sessions.byId[id]).filter(row => row !== undefined)
  useEffect(() => { if (sessionId !== undefined) props.selected(sessionId) }, [sessionId, props.selected])
  useEffect(() => { props.ready() }, [props.ready])
  return <section className={css.root} data-vscode-conversation="">
    <header className={css.toolbar}>
      <strong className={css.title}>{sessionId === undefined ? t('title') : sessions.byId[sessionId]?.displayTitle ?? t('title')}</strong>
      <Button size="sm" onClick={() => { props.startSession(); setHistory(false) }} disabled={boot.state !== 'ready'}>{t('newSession')}</Button>
      <Button size="sm" aria-expanded={history} onClick={() => { setHistory(!history) }}>{t('history')}</Button>
      <Button size="sm" onClick={props.configure}>{t('settings')}</Button>
      {(['file', 'selection', 'problems'] as const).map(kind => <Button key={kind} size="sm" disabled={sessionId === undefined}
        onClick={() => { if (captureLifetime.current !== undefined) props.capture(kind, captureLifetime.current.signal) }}>
        {t(kind)}
      </Button>)}
    </header>
    {boot.state !== 'ready' && <div role="status" className={css.notice}>
      {t(boot.state === 'loading' ? 'loading' : 'failed')}
      {boot.state === 'error' && <Button size="sm" onClick={props.retry}>{t('retry')}</Button>}
    </div>}
    {history && <nav className={css.history} aria-label={t('historyLabel')}>
      <Button size="sm" onClick={() => { setHistory(false) }}>{t('closeHistory')}</Button>
      {rows.length === 0 && <p>{t('empty')}</p>}
      {rows.map(row => <button type="button" key={row.id} className={css.session} aria-current={row.id === sessionId ? 'true' : undefined}
        onClick={() => { props.openSession(row.id); setHistory(false) }}>{row.displayTitle || t('newSession')}</button>)}
    </nav>}
    <div className={css.content} hidden={history}>
      {renderFactorySlot('conversation.content', {
        variant: 'embedded', phase: session?.openState === 'loading' ? 'settling' : 'active', hero: false,
      })}
    </div>
  </section>
}
