/** Run the built preview in an isolated, trusted VS Code test window. */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const executable = process.argv[2]
if (!executable) throw new Error('Pass the absolute VS Code executable path, not its shell wrapper')
const app = fileURLToPath(new URL('..', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'dsh-vscode-editor-test-'))
try {
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(executable, [workspace, '--new-window', '--disable-extensions', '--disable-workspace-trust',
    '--skip-welcome', '--skip-release-notes', '--user-data-dir', join(root, 'user'), '--extensions-dir', join(root, 'extensions'),
    '--extensionDevelopmentPath=' + resolve(app, 'lib/extension'), '--extensionTestsPath=' + resolve(app, 'lib/extension-host.cjs')],
  { cwd: workspace, stdio: 'inherit', windowsHide: true, env: environment })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    if (process.platform === 'win32' && child.pid) {
      const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      kill.on('error', () => child.kill())
    } else child.kill('SIGKILL')
  }, 180_000)
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
    if (timedOut || code !== 0) throw new Error(`VS Code smoke failed: timeout=${timedOut}, exit=${code}`)
  } finally { clearTimeout(timer) }
} finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
