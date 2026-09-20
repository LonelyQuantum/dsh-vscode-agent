/** VS Code surface orientation over the shared base and Web composition. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable plugin identity. */
export const name = 'vscode-app'
/** The shared prompt service logs this surface orientation with model requests. */
export const inject = ['systemPrompt']

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'app:vscode-surface',
    order: ctx.systemPrompt.getSectionOrder('WEB_SURFACE'),
    text: 'You are interacting with the user through the DeepSeek Harness VS Code extension in a trusted local workspace. '
      + 'The conversation runs inside the editor, not in a standalone browser page. '
      + 'You have no implicit access to the active editor, selections, unsaved buffers, or Problems. '
      + 'Explicitly attached editor snapshots are user-provided context captured at the stated document version; '
      + 'they can differ from the current file on disk. Do not claim to see later editor changes without new evidence. '
      + 'File links and captured change comparisons can open in the native editor. Change comparisons are read-only '
      + 'and their captures expire when the Host session or runtime ends. Native review does not apply or revert edits. '
      + 'Use the existing conversation for approvals and questions. Do not start a replacement web server to update this interface.',
  })
}
