/** Probe installed extension enablement while the real VS Code UI changes Workspace Trust. */
import * as vscode from 'vscode'
import { strict as assert } from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { PreviewDiagnostics } from '../src/extension.ts'
import { EXTENSION_ID } from '../scripts/extension-identity.mjs'

/** Start the independent observer without VS Code's extension-test lifecycle. */
export function activate(): void {
  void run().then(() => vscode.commands.executeCommand('workbench.action.quit')).catch(async (error: unknown) => {
    await writeFile(join(process.env.DSH_VSCODE_TEST_UI!, 'failed'), error instanceof Error ? error.message : 'Trust observer failed')
  })
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) { if (await check()) return; await delay(100) }
  throw new Error('Workspace Trust transition did not settle')
}

/** Observe disabled, enabled and revoked states without overriding the product manifest. @returns Completed trust cycle. */
export async function run(): Promise<void> {
  const root = process.env.DSH_VSCODE_TEST_UI!
  const read = async (name: string): Promise<string | undefined> => {
    try { return await readFile(join(root, name), 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const extension = (): vscode.Extension<{ diagnostics(): PreviewDiagnostics }> | undefined =>
    vscode.extensions.getExtension(EXTENSION_ID)
  const mark = (stage: string): Promise<void> => writeFile(join(root, 'trust-stage'), JSON.stringify({
    stage, trusted: vscode.workspace.isTrusted, active: extension()?.isActive === true,
    expectedId: EXTENSION_ID, availableIds: vscode.extensions.all.map(item => item.id),
  }))
  if (await read('phase') !== 'revoking') {
    if (!await read('phase')) {
      assert.equal(vscode.workspace.isTrusted, false)
      assert.notEqual(extension()?.isActive, true)
      // Observer activation does not establish installed-extension discovery.
      await vscode.commands.executeCommand('workbench.extensions.search', '@installed')
      await vscode.commands.executeCommand('workbench.trust.manage')
      await writeFile(join(root, 'ready'), 'restricted')
    }
    await mark('waiting-for-trust')
    await waitFor(() => vscode.workspace.isTrusted)
    await mark('waiting-for-extension')
    await waitFor(() => extension() !== undefined)
    const installed = extension()
    assert.ok(installed, 'Trusted workspace cannot see the installed extension')
    await mark('activating-extension')
    const api = await installed.activate()
    await mark('opening-view')
    await vscode.commands.executeCommand('dsh.open')
    await mark('waiting-for-view')
    await waitFor(() => api.diagnostics().boot && !!api.diagnostics().editorUI)
    assert.equal(api.diagnostics().clientFailure, false)
    await writeFile(join(root, 'granted'), String(api.diagnostics().pid))
    await vscode.commands.executeCommand('workbench.trust.manage')
    await waitFor(async () => await read('phase') === 'revoking')
    await waitFor(() => !vscode.workspace.isTrusted)
  }
  assert.equal(vscode.workspace.isTrusted, false)
  const pid = Number(await read('granted'))
  assert.ok(pid > 0)
  const kept = Number(process.env.DSH_VSCODE_TRUST_KEEP_PID)
  if (kept) {
    assert.equal(pid, kept)
    assert.doesNotThrow(() => process.kill(pid, 0))
  } else await waitFor(() => {
    try { process.kill(pid, 0); return false }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; return true }
  })
  assert.notEqual(extension()?.isActive, true)
  await writeFile(join(root, 'revoked'), 'passed')
  await waitFor(async () => await read('done') === 'passed')
  console.log('VSCODE_WORKSPACE_TRUST_CYCLE_OK')
}
