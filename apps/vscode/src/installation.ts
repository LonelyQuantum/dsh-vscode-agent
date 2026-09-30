/** Select one version-matched runtime without falling back from a broken packaged payload. */
import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

/** Runtime package directory and the version shared by the client assets. */
export interface Installation { directory: string; version: string; desktopHome?: string }

/**
 * Resolve packaged metadata first, or explicit source-development metadata when no package exists.
 * @param extension Built extension directory.
 * @param repositoryOverride Machine-scoped checkout override, admitted only in development.
 * @returns A validated CLI installation with the same canonical path used by DSH's module resolver.
 */
export async function resolveInstallation(extension: string, repositoryOverride?: string): Promise<Installation> {
  let packaged: string | undefined
  try { packaged = await readFile(join(extension, 'runtime.json'), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const manifest = JSON.parse(await readFile(join(extension, 'package.json'), 'utf8')) as { version: string }
  let directory: string
  let version: unknown
  let desktopHome: string | undefined
  if (packaged !== undefined) {
    const metadata = JSON.parse(packaged) as Record<string, unknown>
    if (metadata.schemaVersion !== 1 || metadata.extensionVersion !== manifest.version
      || metadata.platform !== process.platform || metadata.arch !== process.arch) {
      throw new Error('DSH packaged runtime does not match this extension or platform')
    }
    version = metadata.dshVersion
    directory = join(extension, 'runtime/node_modules/@deepseek-ai/dsh')
  } else {
    const metadata = JSON.parse(await readFile(join(extension, 'development.json'), 'utf8')) as Record<string, unknown>
    if (typeof metadata.repository !== 'string') throw new Error('DSH development repository is missing')
    version = metadata.version
    directory = join(repositoryOverride || metadata.repository, 'apps/cli')
    desktopHome = join(repositoryOverride || metadata.repository, 'apps/desktop/.desktop-build/development/home')
  }
  if (typeof version !== 'string' || version.length === 0) throw new Error('DSH runtime version is missing')
  const installed = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as Record<string, unknown>
  if (installed.name !== '@deepseek-ai/dsh' || installed.version !== version) {
    throw new Error('DSH runtime version differs from the built client assets; rebuild the extension')
  }
  return { directory: await realpath(directory), version, ...(desktopHome === undefined ? {} : { desktopHome }) }
}
