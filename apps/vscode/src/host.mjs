/** Private VS Code child: all application behavior starts through the shared dsh profile runner. */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (!(major >= 24 || (major === 22 && minor >= 19))) throw new Error('DSH requires Node 22.19+ or Node 24+. Configure dsh.nodePath.')
  if (!process.connected) throw new Error('VS Code runtime requires its owning IPC channel')
  const repository = process.argv[2]
  const home = process.env.DSH_HOME
  if (!repository || !home) throw new Error('VS Code runtime requires a repository and isolated DSH_HOME')
  const { runProfile, initializeProfileFromDefault } = await import(pathToFileURL(join(repository, 'apps/cli/lib/profile-boot.js')).href)
  const { loadLayeredEnv } = await import(pathToFileURL(join(repository, 'packages/boot/app-boot/lib/index.js')).href)
  if (!existsSync(join(home, 'profiles/vscode'))) initializeProfileFromDefault('vscode', 'web', home)
  const overlay = join(home, 'vscode-launch.patch.yml')
  mkdirSync(home, { recursive: true })
  // The launch credential travels only over IPC; the Web runtime must not print it.
  writeFileSync(overlay, '- id: web-runtime\n  config:\n    openBrowser: false\n    printUrl: false\n    surfaceContext: true\n    trustedHosts: []\n')
  const application = runProfile({ environment: loadLayeredEnv('dsh'), profile: 'vscode',
    patchFiles: [overlay], args: ['--no-open', '--host', '127.0.0.1', '--port', '0'], resolutionMode: 'runtime' })
  let stopping
  const stop = () => stopping ??= (async () => {
    const running = await application.catch(() => undefined)
    await running?.shutdown.shutdown(0)
    if (process.connected) process.disconnect()
  })()
  process.on('message', message => { if (message?.type === 'shutdown') void stop() })
  process.once('disconnect', () => { void stop() })
  if (!process.connected) void stop()
  const { ctx } = await application
  if (!stopping && process.connected) process.send({ type: 'ready',
    url: ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`),
    injections: ctx.webServer.collectIndexInjections() })
}

main().catch(() => {
  // Diagnostics can contain environment credentials; the parent receives only a fixed failure code.
  if (process.connected) process.send({ type: 'fatal' }, () => process.disconnect())
  process.exitCode = 1
})
