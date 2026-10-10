/** Immutable editor snapshots and canonical local-workspace admission. */
import { realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, sep } from 'node:path'

/** Bounded text transported to the composer only after an explicit capture. */
export interface EditorCapture { label: string; text: string }
/** Exact document state sampled synchronously from VS Code. */
export interface DocumentCapture {
  kind: 'file' | 'selection'
  path: string
  language: string
  version: number
  dirty: boolean
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  text: string
}

/**
 * Reject traversal and symlink escapes before disclosing editor content.
 * @param workspace Owned local workspace.
 * @param path Existing file selected in the editor.
 * @returns Canonical relative path.
 */
export async function workspaceFile(workspace: string, path: string): Promise<string> {
  const [root, file] = await Promise.all([realpath(workspace), realpath(path)])
  const local = relative(root, file)
  if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`) || local === '') throw new Error('outside-workspace')
  return local.split(sep).join('/')
}

/**
 * Apply the wire limit to the complete serialized capture, without truncation.
 * @param label User-visible chip text.
 * @param value Snapshot data including exact text and editor revision.
 * @param maxBytes Configured UTF-8 limit.
 * @returns Frozen-at-capture JSON submitted as ordinary user text.
 */
export function boundedCapture(label: string, value: object, maxBytes: number): EditorCapture {
  const text = `Editor context snapshot (explicitly attached by the user):\n${JSON.stringify(value, null, 2)}\n`
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('context-too-large')
  return { label, text }
}

/**
 * Format captured text without reopening the file or reading its current disk contents.
 * @param workspace Owned local workspace.
 * @param capture Document state sampled before any asynchronous work.
 * @param maxBytes Configured UTF-8 limit.
 * @returns Chip label and exact model-visible snapshot.
 */
export async function documentCapture(workspace: string, capture: DocumentCapture, maxBytes: number): Promise<EditorCapture> {
  const path = await workspaceFile(workspace, capture.path)
  const label = `${basename(capture.path)}:${capture.range.start.line + 1}–${capture.range.end.line + 1} · v${capture.version}${capture.dirty ? '*' : ''}`
  return boundedCapture(label, { ...capture, path, workspace, coordinates: 'zero-based, end-exclusive' }, maxBytes)
}
