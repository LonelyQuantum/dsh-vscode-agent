/** Build a source-checkout extension without embedding another DSH runtime. */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const app = fileURLToPath(new URL('..', import.meta.url))
const repository = resolve(app, '../..')
const output = resolve(app, 'lib/extension')
await mkdir(output, { recursive: true })
await Promise.all([
  build({ entryPoints: [resolve(app, 'src/extension.ts')], outfile: resolve(output, 'extension.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode', 'bufferutil', 'utf-8-validate'] }),
  build({ entryPoints: [resolve(app, 'src/webview.ts')], outfile: resolve(output, 'bridge.js'),
    bundle: true, platform: 'browser', format: 'iife', target: 'chrome120' }),
  build({ entryPoints: [resolve(app, 'tests/extension-host.ts')], outfile: resolve(app, 'lib/extension-host.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] }),
  cp(resolve(app, 'src/host.mjs'), resolve(output, 'host.mjs')),
  cp(resolve(repository, 'apps/web/dist'), resolve(output, 'web'), { recursive: true }),
  cp(resolve(app, 'extension.manifest.json'), resolve(output, 'package.json')),
  cp(resolve(app, 'package.nls.json'), resolve(output, 'package.nls.json')),
  cp(resolve(app, 'package.nls.zh-cn.json'), resolve(output, 'package.nls.zh-cn.json')),
])
const version = JSON.parse(await readFile(resolve(repository, 'apps/cli/package.json'), 'utf8')).version
await writeFile(resolve(output, 'development.json'), JSON.stringify({ repository, version }) + '\n')
console.log(`VS Code development extension: ${output}`)
