/** Build a source-checkout extension without embedding another DSH runtime. */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'
import { build } from 'esbuild'
import sharp from 'sharp'

const app = fileURLToPath(new URL('..', import.meta.url))
const repository = resolve(app, '../..')
const output = resolve(app, 'lib/extension')
if (relative(app, output).replaceAll('\\', '/') !== 'lib/extension') throw new Error('Invalid extension output directory')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await Promise.all([
  build({ entryPoints: [resolve(app, 'src/extension.ts')], outfile: resolve(output, 'extension.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode', 'bufferutil', 'utf-8-validate'] }),
  build({ entryPoints: [resolve(app, 'src/webview.ts')], outfile: resolve(output, 'carrier/bridge.js'),
    bundle: true, platform: 'browser', format: 'iife', target: 'chrome120' }),
  build({ entryPoints: [resolve(app, 'tests/extension-host.ts')], outfile: resolve(app, 'lib/extension-host.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] }),
  build({ entryPoints: [resolve(app, 'tests/trust-host.ts')], outfile: resolve(app, 'lib/trust-host.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] }),
  build({ entryPoints: [resolve(app, 'tests/window-host.ts')], outfile: resolve(app, 'lib/window-host.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] }),
  build({ entryPoints: [resolve(app, 'tests/read-session-log.ts')], outfile: resolve(app, 'lib/session-log.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22' }),
  cp(resolve(app, 'src/host.mjs'), resolve(output, 'host.mjs')),
  cp(resolve(repository, 'apps/web/dist'), resolve(output, 'web'), { recursive: true,
    filter: path => !/(?:^|[/\\])preview(?:\.html|[/\\]|$)/.test(path) && !path.endsWith('.map') }),
  cp(resolve(app, 'extension.manifest.json'), resolve(output, 'package.json')),
  cp(resolve(app, 'package.nls.json'), resolve(output, 'package.nls.json')),
  cp(resolve(app, 'package.nls.zh-cn.json'), resolve(output, 'package.nls.zh-cn.json')),
  cp(resolve(app, 'resources'), resolve(output, 'resources'), { recursive: true }),
])
const icon = (await readFile(resolve(app, 'resources/agent.svg'), 'utf8')).replaceAll('currentColor', '#dbeafe')
await sharp(Buffer.from(icon), { density: 768 }).resize(256, 256).flatten({ background: '#172554' })
  .png().toFile(resolve(output, 'resources/marketplace.png'))
const version = JSON.parse(await readFile(resolve(repository, 'apps/cli/package.json'), 'utf8')).version
await writeFile(resolve(output, 'development.json'), JSON.stringify({ repository, version }) + '\n')
console.log(`VS Code development extension: ${output}`)
