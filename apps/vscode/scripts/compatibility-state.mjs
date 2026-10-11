/** Transcript-free observations for installed Session lifecycle checks. */

/**
 * Require the viewed Auto Session to have an attached, idle Host Agent.
 * @param row Host session/list entry for the reviewed Session.
 * @param sameSession Whether the Webview still selects that Session.
 * @returns Whether live reviewer removal can exercise the intended Session.
 */
export function autoRemovalReady(row, sameSession) {
  return sameSession && row?.agentAvailable === true && row.running === false
    && row.projections?.values.permissions?.currentValue === 'auto'
}

/**
 * Count persisted lifecycle facts without copying model text or tool arguments.
 * @param events Decoded events from the test-owned Session.
 * @returns Counts that distinguish a missing tool call from a pending approval.
 */
export function compatibilityEvents(events) {
  const count = type => events.filter(event => event.type === type).length
  return {
    userMessages: count('user/message'), assistantMessages: count('assistant/message'),
    assistantAttempts: count('assistant/attempt'), toolCalls: count('tool/call'),
    toolResults: count('tool/result'), failedToolResults: events.filter(event => event.type === 'tool/result'
      && event.data.error !== undefined).length,
    approvalsAsked: count('approval/asked'), approvalsDecided: count('approval/decided'),
    turnsStarted: count('turn/start'), turnsEnded: count('turn/end'),
  }
}
