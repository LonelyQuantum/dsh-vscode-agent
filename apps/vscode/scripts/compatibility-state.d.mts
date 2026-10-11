/** Minimal Host list fields used by the installed Auto-removal readiness check. */
interface AutoSessionRow {
  agentAvailable: boolean
  running: boolean
  projections?: { values: { permissions?: { currentValue: string } } }
}

/**
 * Require an attached, idle Auto Agent belonging to the viewed Session.
 * @param row Host list entry for the reviewed Session.
 * @param sameSession Whether the Webview selects that Session.
 * @returns Whether live removal can exercise the intended Session.
 */
export function autoRemovalReady(row: AutoSessionRow | undefined, sameSession: boolean): boolean

/**
 * Count lifecycle facts without returning payload text or tool arguments.
 * @param events Decoded events from the test-owned Session.
 * @returns Transcript-free lifecycle counts.
 */
export function compatibilityEvents(events: readonly { type: string; data: Record<string, unknown> }[]): {
  userMessages: number
  assistantMessages: number
  assistantAttempts: number
  toolCalls: number
  toolResults: number
  failedToolResults: number
  approvalsAsked: number
  approvalsDecided: number
  turnsStarted: number
  turnsEnded: number
}
