/** Real editor windows with isolated VS Code settings and explicitly shared extension-owned test data. */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'

/**
 * Open a junction alias and a different folder in separate Extension Hosts while the first window remains live.
 * @param tools Test-owned paths, executable, environment and readiness helpers.
 * @returns Completion after both peer windows and their runtime children exit.
 */
export async function runWindowIsolation({ executable, extensionPath, root, workspace, app, environment, waitFor, readIfPresent }) {
  for (const same of [true, false]) {
    const peer = await mkdtemp(join(root, 'peer-'))
    const folder = join(peer, 'workspace')
    if (same) await symlink(workspace, folder, process.platform === 'win32' ? 'junction' : 'dir')
    else await mkdir(folder)
    const shared = 'User/globalStorage/dsh-local.dsh-vscode-agent'
    await mkdir(join(peer, 'user/User/globalStorage'), { recursive: true })
    await symlink(join(root, 'user', shared), join(peer, 'user', shared), process.platform === 'win32' ? 'junction' : 'dir')
    const child = spawn(executable, [folder, '--new-window', '--disable-extensions', '--disable-workspace-trust',
      '--skip-welcome', '--skip-release-notes', '--locale=en', '--user-data-dir', join(peer, 'user'), '--extensions-dir', join(peer, 'extensions'),
      '--shared-data-dir', join(peer, 'shared'),
      '--extensionDevelopmentPath=' + extensionPath, '--extensionTestsPath=' + join(app, 'lib/window-host.cjs')],
    { windowsHide: true, stdio: 'ignore', env: { ...environment, DSH_VSCODE_TEST_UI: peer, DSH_VSCODE_PEER_MODE: same ? 'same' : 'different' } })
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
    try {
      const state = JSON.parse(await waitFor(async () => {
        if (child.exitCode !== null) throw new Error(`Peer editor exited before readiness: ${child.exitCode}`)
        return readIfPresent(join(peer, 'peer-ready'))
      }, 120_000))
      assert.equal(state.same, same)
      if (!same) process.kill(state.pid, 0)
      await writeFile(join(peer, 'peer-done'), 'passed')
      await waitFor(() => child.exitCode !== null, 30_000)
      assert.equal(await exited, 0)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32') {
          const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          await new Promise((resolve, reject) => { kill.once('error', reject); kill.once('close', resolve) })
        } else child.kill('SIGKILL')
      }
      await exited
    }
  }
  console.log('VSCODE_MULTI_WINDOW_ISOLATION_OK')
}
