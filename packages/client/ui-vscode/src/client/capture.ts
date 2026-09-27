/** Capture admission uses the existing draft revision guard and immutable reference serialization. */
import type { SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { CaptureKind, EditorBridge } from './contract.ts'

/** Draft fields and insertion operation used by native captures. */
type CaptureInput = Pick<SessionInput, 'insertReference'> & {
  state: { getSnapshot(): { draftRev: number } }
}

/**
 * Insert only when the original Session generation, view, and draft still own the request.
 * @param editor Native editor carrier.
 * @param kind Explicit capture action.
 * @param input Original scoped input.
 * @param signal View lifetime.
 * @param current Original Session generation remains selected.
 * @returns Whether the snapshot entered the visible draft.
 */
export async function insertCapture(editor: EditorBridge, kind: CaptureKind, input: CaptureInput,
  signal: AbortSignal, current: () => boolean): Promise<boolean> {
  signal.throwIfAborted()
  const draftRev = input.state.getSnapshot().draftRev
  const capture = await editor.capture(kind, signal)
  if (signal.aborted || !current()) return false
  return input.insertReference({ source: 'editor-context', ref: capture.text, label: capture.label,
    appearance: 'file', clipboardText: capture.text }, { start: 0, end: 0, draftRev })
}

/**
 * Stateless codec retains exact captured text on copy, persisted-draft restoration, and submission.
 * @param editor Native preview carrier.
 * @returns Reference source with no automatic discovery or background capture.
 */
export function captureSource(editor: EditorBridge): InputTriggerSource {
  return {
    trigger: '@', name: 'editor-context', candidates: () => Promise.resolve([]), onPick: () => undefined,
    openReference: (_session, reference) => { editor.preview(reference.ref); return true },
    codec: { clipboardText: ref => ref, serialize: (ref, signal) => { signal.throwIfAborted(); return Promise.resolve(ref) } },
  }
}
