/** Browser navigation for installed-editor recovery checks. */

/**
 * Select history through enabled controls, returning to the list when a conversation is already open.
 * @param root Conversation root in an English-language test window.
 * @param sessionId Session to reopen from history.
 * @returns Whether the Session row was clicked; transcript restoration must be checked separately.
 */
export function selectRecoveredSession(root: HTMLElement | null | undefined, sessionId: string): boolean
