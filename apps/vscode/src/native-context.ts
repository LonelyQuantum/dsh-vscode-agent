/** Explicit VS Code document and Problems capture; never scans source files in the background. */
import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CapturedPair } from './review.ts'
import { extensionCopy } from './locale.ts'
import { boundedCapture, documentCapture, workspaceFile, type EditorCapture } from './editor-context.ts'

/**
 * Capture one explicit editor-context action.
 * @param kind Fixed action, not an arbitrary path from page content.
 * @param workspace Trusted execution directory.
 * @returns Exact snapshot sampled at invocation.
 */
export async function captureEditor(kind: 'file' | 'selection' | 'problems', workspace: string): Promise<EditorCapture> {
  const config = vscode.workspace.getConfiguration('dsh')
  const maxBytes = config.get<number>('contextMaxBytes', 65536)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1048576) throw new Error('invalid-context-limit')
  if (kind === 'problems') {
    const rows = vscode.languages.getDiagnostics().flatMap(([uri, diagnostics]) => uri.scheme === 'file'
      ? diagnostics.map(diagnostic => ({ path: uri.fsPath, message: diagnostic.message, severity: diagnostic.severity,
        source: diagnostic.source, code: diagnostic.code, range: diagnostic.range })) : [])
    const admitted: object[] = []
    const maxProblems = config.get<number>('contextMaxProblems', 100)
    if (!Number.isSafeInteger(maxProblems) || maxProblems < 1 || maxProblems > 1000) throw new Error('invalid-problems-limit')
    for (const row of rows) {
      let path: string
      try { path = await workspaceFile(workspace, row.path) }
      catch { continue /* Problems outside the owned workspace or deleted files are not attached. */ }
      admitted.push({ ...row, path })
      if (admitted.length > maxProblems) throw new Error('context-too-large')
    }
    return boundedCapture(`Problems (${admitted.length})`, { kind, workspace, diagnostics: admitted,
      coordinates: 'zero-based, end-exclusive', severity: '0=error, 1=warning, 2=information, 3=hint' }, maxBytes)
  }
  const editor = vscode.window.activeTextEditor
  if (editor === undefined || editor.document.uri.scheme !== 'file') throw new Error('no-file-editor')
  const document = editor.document
  const range = kind === 'selection' ? editor.selection : new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
  if (kind === 'selection' && range.isEmpty) throw new Error('empty-selection')
  const position = (value: vscode.Position): { line: number; character: number } => ({ line: value.line, character: value.character })
  return documentCapture(workspace, { kind, path: document.uri.fsPath, language: document.languageId,
    version: document.version, dirty: document.isDirty, range: { start: position(range.start), end: position(range.end) },
    text: document.getText(range) }, maxBytes)
}

/** Read-only captured documents retained only while their editor tabs remain open. */
export class SnapshotDocuments implements vscode.Disposable {
  private readonly text = extensionCopy(vscode.env.language)
  private readonly values = new Map<string, string>()
  private readonly registrations: vscode.Disposable[]

  constructor() {
    this.registrations = [vscode.workspace.registerTextDocumentContentProvider('dsh-snapshot', {
      provideTextDocumentContent: uri => this.values.get(uri.toString()) ?? this.text.expired,
    }), vscode.workspace.onDidCloseTextDocument((document) => { this.values.delete(document.uri.toString()) })]
  }

  /**
   * Open captured text, with no filesystem write or executable URI from the page.
   * @param text Bounded captured text.
   * @returns Completion after opening the read-only editor.
   */
  async preview(text: string): Promise<void> {
    if (Buffer.byteLength(text, 'utf8') > 1024 * 1024 || this.values.size >= 32) throw new Error('snapshot-limit')
    const uri = vscode.Uri.from({ scheme: 'dsh-snapshot', path: `/${randomUUID()}/Editor-context.txt` })
    this.values.set(uri.toString(), text)
    try { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: true }) }
    catch (error) { this.values.delete(uri.toString()); throw error }
  }

  /**
   * Open complete captured sides in VS Code's read-only diff editor.
   * @param pair Validated immutable contents; absent sides render empty with an explicit title.
   * @returns Completion after the diff opens.
   */
  async diff(pair: CapturedPair): Promise<void> {
    if (this.values.size > 30) throw new Error('snapshot-limit')
    const id = randomUUID()
    const before = vscode.Uri.from({ scheme: 'dsh-snapshot', path: `/${id}/Before.txt` })
    const after = vscode.Uri.from({ scheme: 'dsh-snapshot', path: `/${id}/After.txt` })
    this.values.set(before.toString(), pair.before ?? '')
    this.values.set(after.toString(), pair.after ?? '')
    const status = this.text[pair.before === null ? 'created' : pair.after === null ? 'deleted' : 'captured']
    try { await vscode.commands.executeCommand('vscode.diff', before, after, `${pair.display} (${status})`, { preview: true }) }
    catch (error) { this.values.delete(before.toString()); this.values.delete(after.toString()); throw error }
  }

  /** Drop provider registrations and owned text. */
  dispose(): void { for (const registration of this.registrations) registration.dispose(); this.values.clear() }
}

/**
 * Open a real file inside the owned workspace, never a command or external URI.
 * @param workspace Trusted local execution directory.
 * @param path Session-relative or absolute file path.
 * @param line Optional one-based line; positions beyond the document are clamped by VS Code.
 * @param cwd Viewed Session directory, required to identify the same canonical workspace.
 * @returns Completion after native navigation.
 */
export async function openWorkspaceFile(workspace: string, path: string, line?: number, cwd = workspace): Promise<void> {
  if (await realpath(cwd) !== await realpath(workspace)) throw new Error('workspace-mismatch')
  const canonical = await realpath(resolve(workspace, path))
  await workspaceFile(workspace, canonical)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(canonical))
  const selection = line === undefined ? undefined : document.validateRange(new vscode.Range(line - 1, 0, line - 1, 0))
  await vscode.window.showTextDocument(document, { preview: true, ...(selection === undefined ? {} : { selection }) })
}
