/** Capture admission and serialization preserve immutable text across asynchronous editor reads. */
import { expect, it, vi } from 'vitest'
import type { SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { EditorBridge } from '../src/client/contract.ts'
import { captureSource, insertCapture } from '../src/client/capture.ts'

function fixture() {
  let complete!: (value: { label: string; text: string }) => void
  const pending = new Promise<{ label: string; text: string }>((resolve) => { complete = resolve })
  const preview = vi.fn()
  const editor: EditorBridge = { capture: () => pending, preview, workspace: () => '/workspace',
    openFile: vi.fn(), openChanges: vi.fn(),
    lastSession: () => undefined, configure: vi.fn(), selected: vi.fn(), ready: vi.fn() }
  const insertReference = vi.fn(() => true)
  // This function only reads the revision and invokes the guarded insertion.
  const input = { state: { getSnapshot: () => ({ draftRev: 9 }) }, insertReference } as unknown as SessionInput
  return { complete, editor, input, insertReference, preview }
}

it('keeps the initiating draft revision and exact snapshot in the visible reference', async () => {
  const f = fixture()
  const pending = insertCapture(f.editor, 'selection', f.input, new AbortController().signal, () => true)
  f.complete({ label: 'file.ts · v9*', text: 'exact unsaved text' })
  expect(await pending).toBe(true)
  expect(f.insertReference).toHaveBeenCalledWith({ source: 'editor-context', ref: 'exact unsaved text', label: 'file.ts · v9*',
    appearance: 'file', clipboardText: 'exact unsaved text' }, { start: 0, end: 0, draftRev: 9 })
})

it.each(['cancel', 'switch'] as const)('does not attach after %s', async (reason) => {
  const f = fixture()
  const controller = new AbortController()
  let current = true
  const pending = insertCapture(f.editor, 'file', f.input, controller.signal, () => current)
  if (reason === 'cancel') controller.abort()
  else current = false
  f.complete({ label: 'file', text: 'private snapshot' })
  expect(await pending).toBe(false)
  expect(f.insertReference).not.toHaveBeenCalled()
})

it('reports a draft revision conflict without replacing the draft', async () => {
  const f = fixture()
  f.insertReference.mockReturnValue(false)
  const pending = insertCapture(f.editor, 'file', f.input, new AbortController().signal, () => true)
  f.complete({ label: 'file', text: 'snapshot' })
  expect(await pending).toBe(false)
})

it('serializes the captured text and preserves it for copied or restored drafts', async () => {
  const f = fixture()
  const source = captureSource(f.editor)
  const codec = source.codec!
  const text = 'snapshot\n{"version":7,"dirty":true,"text":"unsaved"}\n'
  expect(await codec.serialize(text, new AbortController().signal)).toBe(text)
  expect(codec.clipboardText(text)).toBe(text)
  source.openReference!({ sessionId: 'session' as never }, { ref: text })
  expect(f.preview).toHaveBeenCalledWith(text)
  const aborted = AbortSignal.abort()
  expect(() => codec.serialize(text, aborted)).toThrow()
})
