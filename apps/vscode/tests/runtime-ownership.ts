/** Built-runtime ownership qualification inside the isolated Extension Host. */
import * as vscode from 'vscode'
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentRuntime, RuntimeOwnershipError } from '../src/runtime.ts'
import { resolveInstallation } from '../src/installation.ts'

/**
 * Verify simultaneous runtime homes, competing ownership and acquisition after stop.
 * @param root Test-owned VS Code data root.
 * @param extensionPath Installed or development extension.
 * @returns Completion after all additional children stop.
 */
export async function verifyRuntimeOwnership(root: string, extensionPath: string): Promise<void> {
  const workspace = vscode.Uri.file(await realpath(vscode.workspace.workspaceFolders![0].uri.fsPath)).fsPath
  const installation = await resolveInstallation(extensionPath)
  const home = join(root, 'user/User/globalStorage/dsh-local.dsh-vscode-agent/homes',
    createHash('sha256').update(workspace).digest('hex').slice(0, 24))
  const lock = join(home, 'vscode-runtime.lock')
  const owner = Number((await readFile(lock, 'utf8')).trim())
  assert.ok(owner > 0)
  process.kill(owner, 0)
  const options = { node: 'node', installation: installation.directory, version: installation.version,
    entry: join(extensionPath, 'host.mjs'), workspace, home }
  const contender = new AgentRuntime()
  const independent = new AgentRuntime()
  const successor = new AgentRuntime()
  try {
    await assert.rejects(contender.start(options), RuntimeOwnershipError)
    assert.equal(Number((await readFile(lock, 'utf8')).trim()), owner)
    process.kill(owner, 0)
    const otherWorkspace = join(root, 'other-workspace')
    await mkdir(otherWorkspace)
    const otherHome = join(root, 'other-home')
    const second = await independent.start({ ...options, workspace: otherWorkspace, home: otherHome })
    assert.notEqual(second.pid, owner)
    assert.equal(Number((await readFile(join(otherHome, 'vscode-runtime.lock'), 'utf8')).trim()), second.pid)
    await vscode.commands.executeCommand('dsh.stop')
    assert.throws(() => process.kill(owner, 0))
    const next = await successor.start(options)
    assert.notEqual(next.pid, owner)
    assert.equal(Number((await readFile(lock, 'utf8')).trim()), next.pid)
    process.kill(second.pid, 0)
    console.log('VSCODE_RUNTIME_HOME_OWNERSHIP_OK')
  } finally { await Promise.all([contender.stop(), independent.stop(), successor.stop()]) }
  await vscode.commands.executeCommand('dsh.open')
}
