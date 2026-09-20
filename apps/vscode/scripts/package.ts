/** Build a source-independent, current-platform VSIX with the shared profile runtime and an external Node. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, glob, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { createVSIX } from '@vscode/vsce'
import { pnpmInvocation } from '../../../scripts/pnpm-invocation.ts'
import { runtimeClosure, type RuntimePackage } from './package-closure.ts'

const app = fileURLToPath(new URL('..', import.meta.url))
const repository = resolve(app, '../..')
const output = join(app, 'lib/packaged-extension')
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Only Windows x64 packaging is qualified by this preview')
const workspace = yaml.load(await readFile(join(repository, 'pnpm-workspace.yaml'), 'utf8')) as {
  packages: string[]
  minimumReleaseAgeExclude: string[]
}
const available = new Map<string, RuntimePackage>()
for await (const path of glob(workspace.packages.map(pattern => `${pattern}/package.json`), { cwd: repository })) {
  const manifest = JSON.parse(await readFile(join(repository, path), 'utf8')) as RuntimePackage['manifest']
  available.set(manifest.name, { directory: join(repository, dirname(path)), manifest })
}
const selected = runtimeClosure(available, ['@deepseek-ai/dsh', '@deepseek-ai/dsh-vscode-app'])
const temporary = await mkdtemp(join(tmpdir(), 'dsh-vscode-pack-'))
async function pnpm(args: string[], cwd: string): Promise<void> {
  const invocation = pnpmInvocation(args)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const collect = (bytes: Buffer): void => { tail = (tail + bytes.toString()).slice(-8192) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('error', reject)
    child.once('close', (code) => { if (code === 0) resolve(); else reject(new Error(`VS Code packaging: pnpm failed (${String(code)})\n${tail}`)) })
  })
}
try {
  const tarballs = join(temporary, 'packages')
  await mkdir(tarballs)
  let cursor = 0
  console.log(`Packing ${selected.length} workspace packages, including peer and Client injection dependencies`)
  let failed = false
  const packing = await Promise.allSettled(Array.from({ length: 6 }, async () => {
    while (!failed && cursor < selected.length) {
      const entry = selected[cursor++]!
      try { await pnpm(['pack', '--pack-destination', tarballs], entry.directory) }
      catch (error) { failed = true; throw error }
    }
  }))
  const failure = packing.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  const dependencies = Object.fromEntries(selected.map(({ manifest }) => [manifest.name,
    `file:./packages/${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`]))
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'dsh-vscode-runtime', private: true, dependencies }) + '\n')
  await cp(join(repository, 'patches/node-pty@1.2.0-beta.15.patch'), join(temporary, 'node-pty.patch'))
  await writeFile(join(temporary, 'pnpm-workspace.yaml'), yaml.dump({
    packages: ['.'], nodeLinker: 'hoisted', autoInstallPeers: false,
    overrides: dependencies, minimumReleaseAgeExclude: workspace.minimumReleaseAgeExclude,
    patchedDependencies: { 'node-pty@1.2.0-beta.15': 'node-pty.patch' },
    allowBuilds: { 'node-pty': true, koffi: true, 'fs-ext': true,
      [`@deepseek-ai/dsh-subprocess-local@${dependencies['@deepseek-ai/dsh-subprocess-local']!.replace('file:./', 'file:')}`]: true,
      '@google/genai': false, protobufjs: false, 'node-addon-require-builtin': false },
  }))
  console.log('Installing the isolated production dependency set')
  await pnpm(['install', '--prod'], temporary)
  // Only this script's generated staging directory is replaced, never the checkout or development extension.
  if (resolve(output) !== resolve(app, 'lib/packaged-extension')) throw new Error('Invalid VS Code staging directory')
  await rm(output, { recursive: true, force: true })
  await cp(join(app, 'lib/extension'), output, { recursive: true, filter: path => !path.endsWith('development.json') })
  await mkdir(join(output, 'runtime'))
  await cp(join(temporary, 'node_modules'), join(output, 'runtime/node_modules'), { recursive: true, dereference: true })
  const lock = await readFile(join(temporary, 'pnpm-lock.yaml'))
  await writeFile(join(output, 'runtime/pnpm-lock.yaml'), lock)
  const manifest = JSON.parse(await readFile(join(output, 'package.json'), 'utf8')) as { version: string }
  await writeFile(join(output, 'runtime.json'), JSON.stringify({ schemaVersion: 1, platform: process.platform, arch: process.arch,
    extensionVersion: manifest.version, dshVersion: available.get('@deepseek-ai/dsh')!.manifest.version,
    lockSha256: createHash('sha256').update(lock).digest('hex'),
    packages: selected.map(({ manifest: { name, version } }) => ({ name, version })),
  }, null, 2) + '\n')
  await cp(join(repository, 'LICENSE'), join(output, 'LICENSE'))
  await cp(join(app, 'README.md'), join(output, 'README.md'))
  await cp(join(app, 'README.zh.md'), join(output, 'README.zh.md'))
  await writeFile(join(output, '.vscodeignore'), '**/*.map\n')
  const packagePath = join(app, `lib/dsh-vscode-agent-${manifest.version}-win32-x64.vsix`)
  await createVSIX({ cwd: output, packagePath, target: 'win32-x64', dependencies: false,
    allowMissingRepository: true, rewriteRelativeLinks: false })
  console.log(`VSIX: ${packagePath}`)
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
