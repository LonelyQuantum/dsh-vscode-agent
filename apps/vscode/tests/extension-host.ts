/** Actual VS Code smoke: requires a built extension and an isolated trusted test workspace. */
import * as vscode from 'vscode'
import { strict as assert } from 'node:assert'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { PreviewDiagnostics } from '../src/extension.ts'
import { captureEditor, openWorkspaceFile, SnapshotDocuments } from '../src/native-context.ts'

async function verifyEditorContext(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders![0].uri
  const file = vscode.Uri.joinPath(workspace, 'context.ts')
  await vscode.workspace.fs.writeFile(file, Buffer.from('const original = 1;\n'))
  const document = await vscode.workspace.openTextDocument(file)
  const editor = await vscode.window.showTextDocument(document)
  const snapshots = new SnapshotDocuments()
  const diagnostics = vscode.languages.createDiagnosticCollection('dsh-test')
  try {
    assert.ok(await editor.edit((edit) => { edit.insert(new vscode.Position(1, 0), 'const unsaved = "你好";\n') }))
    editor.selection = new vscode.Selection(1, 0, 1, 21)
    const expected = document.getText(editor.selection)
    const selected = await captureEditor('selection', workspace.fsPath)
    const parsed = JSON.parse(selected.text.slice(selected.text.indexOf('{'))) as { text: string; version: number; dirty: boolean }
    assert.equal(parsed.text, expected)
    assert.equal(parsed.version, document.version)
    assert.equal(parsed.dirty, true)
    const all = await captureEditor('file', workspace.fsPath)
    assert.ok(all.text.includes('unsaved'))
    diagnostics.set(file, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Captured diagnostic', vscode.DiagnosticSeverity.Warning)])
    const problems = await captureEditor('problems', workspace.fsPath)
    assert.ok(problems.text.includes('Captured diagnostic'))
    await snapshots.preview(selected.text)
    const preview = vscode.window.activeTextEditor!.document
    assert.equal(preview.uri.scheme, 'dsh-snapshot')
    assert.equal(preview.getText(), selected.text)
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    for (const [before, after] of [['before\n', 'after\n'], [null, 'created'], ['deleted', null]] as const) {
      await snapshots.diff({ display: 'context.ts', before, after })
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
      assert.ok(input instanceof vscode.TabInputTextDiff)
      assert.equal((await vscode.workspace.openTextDocument(input.original)).getText(), before ?? '')
      assert.equal((await vscode.workspace.openTextDocument(input.modified)).getText(), after ?? '')
      assert.equal(input.original.scheme, 'dsh-snapshot')
      assert.equal(input.modified.scheme, 'dsh-snapshot')
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }
    await openWorkspaceFile(workspace.fsPath, 'context.ts', 2)
    assert.equal(vscode.window.activeTextEditor!.selection.start.line, 1)
    await assert.rejects(openWorkspaceFile(workspace.fsPath, '../outside.txt'))
    await vscode.window.showTextDocument(document)
    await vscode.commands.executeCommand('workbench.action.files.revert')
  } finally { diagnostics.dispose(); snapshots.dispose() }
}

/** Exercise Webview boot, native stream forwarding and shutdown in a real Extension Host. @returns Completion after the runtime stops. */
export async function run(): Promise<void> {
  await verifyEditorContext()
  const extension = vscode.extensions.getExtension<{ diagnostics(): PreviewDiagnostics }>('dsh-local.dsh-vscode-agent')
  assert.ok(extension)
  const api = await extension.activate()
  const commands = await vscode.commands.getCommands(true)
  assert.ok(commands.includes('dsh.configure'))
  assert.ok(commands.includes('dsh.clearApiKey'))
  const connected = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(poll)
        reject(new Error(`Webview did not connect: ${JSON.stringify(api.diagnostics())}`))
      }, 60_000)
      const poll = setInterval(() => {
        const state = api.diagnostics()
        if (state.clientFailure || (state.boot && state.editorUI && state.assets > 0 && state.rpc > 0 && state.socket)) {
          clearInterval(poll)
          clearTimeout(timeout)
          if (state.clientFailure) reject(new Error(`Webview failed: ${JSON.stringify(state)}`))
          else resolve()
        }
      }, 100)
    })
  }
  try {
    await vscode.commands.executeCommand('dsh.open')
    await connected()
    const previous = api.diagnostics().pid
    assert.ok(previous)
    await vscode.commands.executeCommand('dsh.restart')
    assert.throws(() => process.kill(previous, 0))
    await connected()
    console.log('VSCODE_WEBVIEW_SMOKE_OK ' + JSON.stringify(api.diagnostics()))
    const crashed = api.diagnostics().pid
    assert.ok(crashed)
    process.kill(crashed)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { clearInterval(poll); reject(new Error('Runtime exit was not observed')) }, 10_000)
      const poll = setInterval(() => {
        if (api.diagnostics().clientFailure) { clearTimeout(timeout); clearInterval(poll); resolve() }
      }, 50)
    })
    await vscode.commands.executeCommand('dsh.restart')
    await connected()
    assert.notEqual(api.diagnostics().pid, crashed)
    const coordination = process.env.DSH_VSCODE_TEST_UI
    if (coordination) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'context.ts'))
      const editor = await vscode.window.showTextDocument(document)
      assert.ok(await editor.edit((edit) => { edit.insert(new vscode.Position(1, 0), 'const editorOnly = "VSCODE_UNSAVED_42";\n') }))
      editor.selection = new vscode.Selection(1, 0, 1, 100)
      await writeFile(join(coordination, 'ready'), 'ready')
      const deadline = Date.now() + (process.env.DSH_VSCODE_TEST_FAULTS ? 270_000 : 180_000)
      let result: string | undefined
      let reviewed = false
      while (Date.now() < deadline) {
        const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
        if (!reviewed && input instanceof vscode.TabInputTextDiff) {
          assert.equal((await vscode.workspace.openTextDocument(input.original)).getText(), '')
          assert.equal((await vscode.workspace.openTextDocument(input.modified)).getText(), 'REVIEWED_FROM_VSCODE\n')
          assert.equal(input.original.scheme, 'dsh-snapshot')
          assert.equal(input.modified.scheme, 'dsh-snapshot')
          reviewed = true
          await writeFile(join(coordination, 'review-ok'), 'passed')
        }
        let reload: string | undefined
        if (process.env.DSH_VSCODE_TEST_FAULTS) {
          let crash: string | undefined
          try { crash = await readFile(join(coordination, 'crash'), 'utf8') }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
          if (crash === 'requested') {
            await unlink(join(coordination, 'crash'))
            const pid = api.diagnostics().pid
            assert.ok(pid)
            process.kill(pid)
            const crashDeadline = Date.now() + 10_000
            while (!api.diagnostics().clientFailure && Date.now() < crashDeadline) await delay(50)
            assert.ok(api.diagnostics().clientFailure, 'Active runtime exit was not observed')
            assert.throws(() => process.kill(pid, 0))
            await writeFile(join(coordination, 'crashed'), 'passed')
          }
        }
        try { reload = await readFile(join(coordination, 'reload'), 'utf8') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        if (reload === 'requested') {
          await unlink(join(coordination, 'reload'))
          await vscode.commands.executeCommand('dsh.restart')
          await connected()
          await writeFile(join(coordination, 'reloaded'), 'passed')
        }
        try { result = await readFile(join(coordination, 'done'), 'utf8') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        if (result !== undefined) break
        await delay(100)
      }
      assert.equal(result, 'passed', 'Live Webview interaction did not pass')
      await vscode.window.showTextDocument(document)
      await vscode.commands.executeCommand('workbench.action.files.revert')
    }
  } finally {
    const pid = api.diagnostics().pid
    await vscode.commands.executeCommand('dsh.stop')
    if (pid !== undefined) assert.throws(() => process.kill(pid, 0))
  }
}
