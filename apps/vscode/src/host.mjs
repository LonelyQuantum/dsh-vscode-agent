/** Private VS Code child: all application behavior starts through the shared dsh profile runner. */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (!(major >= 24 || (major === 22 && minor >= 19))) throw new Error('DSH requires Node 22.19+ or Node 24+. Configure dsh.nodePath.')
  if (!process.connected) throw new Error('VS Code runtime requires its owning IPC channel')
  const installation = process.argv[2]
  const version = process.argv[3]
  const home = process.env.DSH_HOME
  if (!installation || !home) throw new Error('VS Code runtime requires an installation and isolated DSH_HOME')
  const manifest = JSON.parse(readFileSync(join(installation, 'package.json'), 'utf8'))
  if (manifest.name !== '@deepseek-ai/dsh' || manifest.version !== version) throw new Error('DSH runtime version mismatch')
  const require = createRequire(join(installation, 'package.json'))
  const { runProfile, initializeProfileFromDefault } = await import(pathToFileURL(join(installation, 'lib/profile-boot.js')).href)
  const { loadLayeredEnv } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  if (!existsSync(join(home, 'profiles/vscode'))) initializeProfileFromDefault('vscode', 'web', home)
  const profilePath = join(home, 'profiles/vscode/package.json')
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
  if (!profile.dsh.profile.bundles.includes('@deepseek-ai/dsh-vscode-app')) {
    profile.dsh.profile.bundles.push('@deepseek-ai/dsh-vscode-app')
    writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n')
  }
  const application = runProfile({ environment: loadLayeredEnv('dsh'), profile: 'vscode',
    patchFiles: [], args: ['--no-open', '--host', '127.0.0.1', '--port', '0'] })
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
