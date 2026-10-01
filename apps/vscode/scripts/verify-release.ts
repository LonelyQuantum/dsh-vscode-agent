/** Validate the current staging tree without authenticating or publishing to any registry. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { listFiles, PackageManager } from '@vscode/vsce'
import { artifactProblems, manifestProblems } from './release-policy.ts'

const { values } = parseArgs({ options: { marketplace: { type: 'boolean' } } })
const app = fileURLToPath(new URL('..', import.meta.url))
const output = join(app, 'lib/packaged-extension')
const source: unknown = JSON.parse(await readFile(join(app, 'extension.manifest.json'), 'utf8'))
const packaged: unknown = JSON.parse(await readFile(join(output, 'package.json'), 'utf8'))
const files = await listFiles({ cwd: output, packageManager: PackageManager.None })
const problems = [...manifestProblems(source, values.marketplace === true), ...artifactProblems(files)]
if (JSON.stringify(source) !== JSON.stringify(packaged)) problems.push('Staged manifest differs from source; rebuild the VSIX')
if (problems.length) throw new Error(problems.join('\n'))
console.log('VS Code release files and metadata passed; publisher ownership and editor acceptance are not verified by this check.')
