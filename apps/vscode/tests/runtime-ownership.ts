/** Built-runtime ownership qualification inside the isolated Extension Host. */
import * as vscode from 'vscode'
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentRuntime, RuntimeOwnershipError } from '../src/runtime.ts'
import { resolveInstallation } from '../src/installation.ts'
import { acquireSharedHost } from '@deepseek-ai/dsh-shared-host/client'
import { resolveSharedLaunch } from '../src/shared-launch.ts'
import type { PreviewDiagnostics } from '../src/extension.ts'

/**
 * Keep a second lease while the editor reconnects, and refuse a mismatched client without replacing the writer.
 * @param extensionPath Exact installed runtime.
 * @param api Editor-owned diagnostics.
 * @returns Completion after the temporary peer releases its lease; the editor remains attached.
 */
export async function verifySharedRuntimeOwnership(extensionPath: string, api: { diagnostics(): PreviewDiagnostics }): Promise<void> {
  const installation = await resolveInstallation(extensionPath)
  const home = process.env.DSH_HOME!
  const pid = api.diagnostics().pid
  assert.ok(pid)
  const peer = await acquireSharedHost({ home, version: installation.version, role: 'desktop',
    launch: () => resolveSharedLaunch('node', installation.sharedRuntime, installation.version) })
  try {
    assert.equal(peer.ready.pid, pid)
    assert.equal(await peer.control('inspect-update'), true)
    await assert.rejects(peer.control('lock-update'))
    await assert.rejects(acquireSharedHost({ home, version: 'incompatible-fixture', role: 'vscode' }))
    process.kill(pid, 0)
    await vscode.commands.executeCommand('dsh.stop')
    process.kill(pid, 0)
    assert.equal(await peer.control('inspect-update'), false)
    await vscode.commands.executeCommand('dsh.open')
    const deadline = Date.now() + 60_000
    while (!api.diagnostics().boot && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(api.diagnostics().pid, pid)
    assert.equal(api.diagnostics().boot, true)
    assert.equal(await peer.control('inspect-update'), true)
    console.log('VSCODE_SHARED_LEASE_OWNERSHIP_OK')
  } finally { await peer.close() }
}

/**
 * Verify simultaneous runtime homes, competing ownership and acquisition after stop.
 * @param root Test-owned VS Code data root.
 * @param extensionPath Installed or development extension.
 * @returns Completion after all additional children stop.
 */
export async function verifyRuntimeOwnership(root: string, extensionPath: string): Promise<void> {
  const workspace = vscode.Uri.file(await realpath(vscode.workspace.workspaceFolders![0].uri.fsPath)).fsPath
  const installation = await resolveInstallation(extensionPath)
  const home = join(root, 'user-data/User/globalStorage/dsh-local.dsh-vscode-agent/homes',
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
