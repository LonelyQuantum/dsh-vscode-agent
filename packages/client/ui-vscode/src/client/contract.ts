/** Browser-to-editor operations exclude credentials and arbitrary command execution. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { VscodeKey } from './locales.ts'

/** Editor carrier installed before Client boot. */
export interface EditorBridge {
  /** Return the workspace selected by the Extension Host. @returns Absolute execution directory. */
  workspace(): string
  /** Open the native password input without exposing its result to the Client. */
  configure(): void
  /** Persist a selection, never conversation contents. @param id Selected Session id. */
  selected(id: string): void
  /** Read the carrier's selection. @returns Saved id, subject to workspace membership verification. */
  lastSession(): string | undefined
  /** Report mounted editor presentation to the carrier. */
  ready(): void
}

/** Workspace initialization is view state, not a Session mirror. */
export interface WorkspaceBoot {
  state: 'loading' | 'ready' | 'error'
  workspaceId?: WorkspaceId
}

/** Callbacks and the one private startup observable bound by the renderer. */
export interface EditorInjected {
  hooks: { workspaceBoot: HostObservable<WorkspaceBoot> }
  /** Open a blank Session using the shared navigation policy. */
  startSession(): void
  /** Select one listed Session. @param id Workspace member selected by the user. */
  openSession(id: SessionId): void
  /** Open native credential setup. */
  configure(): void
  /** Persist the current selection in the carrier. @param id Selected Session id. */
  selected(id: SessionId): void
  /** Retry a failed workspace initialization. */
  retry(): void
  /** Report that editor presentation mounted. */
  ready(): void
}

/** Factory and Session inputs remain framework-derived. */
export type EditorProps = PropsRuntime<'vscode.conversation'> & PropsRenderFactories & PropsLocale<'vscode'> & InjectFace<EditorInjected>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Single editor conversation with the existing main Session binding. */
    'vscode.conversation': { kind: 'single'; scope: 'session-maybe' }
  }
  interface LocaleNamespaceMap {
    /** Editor-owned conversation chrome. */
    vscode: VscodeKey
  }
}

declare global {
  var __DSH_VSCODE__: EditorBridge | undefined
}
