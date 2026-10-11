/** Browser navigation for installed-editor recovery checks. */

/**
 * Select history through enabled controls, returning to the list when a conversation is already open.
 * This function is serialized into the English-language test Webview and has no module dependencies.
 * @param root Conversation root, or absence while the Webview mounts.
 * @param sessionId Session to reopen from history.
 * @returns Whether the Session row was clicked; transcript restoration must be checked separately.
 */
export function selectRecoveredSession(root, sessionId) {
  if (!root) return false
  const row = [...root.querySelectorAll('nav button[data-session-id]')]
    .find(button => button.dataset.sessionId === sessionId)
  if (row && !row.disabled) { row.click(); return true }
  const back = root.querySelector('button[aria-label="Back to conversations"]')
  if (back && !back.disabled) back.click()
  return false
}
