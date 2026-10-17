/** Editor-owned release notice; the module system owns version comparison and graph isolation. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientReleaseChange } from '@deepseek-ai/dsh-client-modules/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Root.module.css'

/** Native page refresh and upstream release decisions, with no parallel release state. */
export type RootInjected = {
  /** Refresh the page without releasing its backend lease. */
  reload(): void
  /** Keep loaded plugins and dismiss this Host release announcement. */
  dismiss(): void
  /** Release change published by the page's module system. */
  hooks: { releaseChange: HostObservable<ClientReleaseChange | undefined> }
}

/** Root composition receives only its declared child, localized copy, and injected decisions. */
export type RootProps = PropsRenderSlots<'vscode.conversation'> & PropsLocale<'vscode'> & InjectFace<RootInjected>

/** Render a non-modal notice without stealing input focus. @param props Framework-bound root inputs. @returns Editor layout. */
export function Root({ renderSlot, useReleaseChange, reload, dismiss, t }: RootProps) {
  const change = useReleaseChange(value => value)
  return <div className={css.root}>
    {change !== undefined && <aside className={css.notice} role="status">
      <strong>{t('releaseChanged')}</strong>
      <p>{t('releaseDescription')}</p>
      <code className={css.release}>{change.host?.version} {change.host?.commit}</code>
      <div className={css.actions}>
        <Button size="sm" onClick={dismiss}>{t('releaseLater')}</Button>
        <Button size="sm" onClick={reload}>{t('releaseReload')}</Button>
      </div>
    </aside>}
    <div className={css.conversation}>{renderSlot('vscode.conversation', {})}</div>
  </div>
}
