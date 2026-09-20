/** Optional native editor navigation supplied by an editor carrier, absent in ordinary browser compositions. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** User gestures routed to the carrier instead of an embedded file or change-review tab. */
export interface ConversationEditor {
  /**
   * Open a file location.
   * @param sessionId Viewed Session.
   * @param path Session-relative or absolute path.
   * @param line One-based line.
   * @returns Completion after dispatch.
   */
  openFile(sessionId: SessionId, path: string, line?: number): Promise<void>
  /**
   * Open recorded changes.
   * @param sessionId Capture owner.
   * @param seq Announcing event.
   * @param index Original summary index.
   */
  openChanges(sessionId: SessionId, seq: number, index: number): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional carrier-owned file and change-review navigation; consumers fall back to Web tabs when absent. */
    conversationEditor: ConversationEditor
  }
}
