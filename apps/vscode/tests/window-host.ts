/** Second real editor window sharing only the test extension's storage. */
import * as vscode from 'vscode'
import { strict as assert } from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { PreviewDiagnostics } from '../src/extension.ts'

/** Observe same-home refusal or independent-workspace startup in a second Extension Host. @returns Owned runtime shutdown. */
export async function run(): Promise<void> {
  const root = process.env.DSH_VSCODE_TEST_UI!
  const same = process.env.DSH_VSCODE_PEER_MODE === 'same'
  const extension = vscode.extensions.getExtension<{ diagnostics(): PreviewDiagnostics }>('dsh-local.dsh-vscode-agent')!
  const api = await extension.activate()
  const deadline = Date.now() + 90_000
  try {
    await vscode.commands.executeCommand('dsh.open')
    while (Date.now() < deadline) {
      const state = api.diagnostics()
      if (state.clientFailure || state.boot && state.editorUI) break
      await delay(100)
    }
    const state = api.diagnostics()
    assert.equal(state.clientFailure, same)
    if (same) assert.equal(state.pid, undefined)
    else { assert.equal(state.boot, true); assert.ok(state.pid) }
    await writeFile(join(root, 'peer-ready'), JSON.stringify({ same, pid: state.pid }))
    let done = false
    while (Date.now() < deadline && !done) {
      try { done = await readFile(join(root, 'peer-done'), 'utf8') === 'passed' }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (!done) await delay(100)
    }
    assert.equal(done, true)
  } finally {
    const pid = api.diagnostics().pid
    await vscode.commands.executeCommand('dsh.stop')
    if (pid) assert.throws(() => process.kill(pid, 0))
  }
}
