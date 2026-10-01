/** Resolve the extension's own cold-start executable without consulting Desktop installation state. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { SharedLaunch } from '@deepseek-ai/dsh-shared-host/client'

/**
 * Validate the shipped Node host and resolve a configured executable on PATH.
 * @param node Node executable, without shell arguments.
 * @param runtime Extension-owned dependency directory.
 * @param version Version required by the client assets.
 * @returns Absolute, credential-free native launch locations.
 */
export async function resolveSharedLaunch(node: string, runtime: string, version: string): Promise<SharedLaunch> {
  const manifest: unknown = JSON.parse(await readFile(join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/package.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest) || manifest.version !== version) {
    throw new Error('Shared host differs from the extension runtime; rebuild or reinstall the extension')
  }
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  const { stdout } = await promisify(execFile)(node, ['--eval',
    'const [major,minor]=process.versions.node.split(".").map(Number);if(!(major>=24||(major===22&&minor>=19)))process.exit(1);process.stdout.write(JSON.stringify(process.execPath))'],
  { env, windowsHide: true, timeout: 15_000, maxBuffer: 8192 })
  const executable: unknown = JSON.parse(stdout)
  if (typeof executable !== 'string' || !isAbsolute(executable)) throw new Error('Node did not report an absolute executable path')
  return { protocol: 1, version, node: await realpath(executable), runtime: await realpath(runtime) }
}
