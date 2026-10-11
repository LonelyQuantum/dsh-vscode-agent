/** Locate Desktop API configuration without reading or copying credential values. */
import { stat, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

/** A selected Desktop home is missing or cannot be used. */
export class DesktopHomeError extends Error {}

/**
 * Resolve the selected or highest-priority shared home without creating directories.
 * @param selected Machine-scoped user choice; a new directory is initialized only during trusted startup.
 * @param candidates Ordered application-owned defaults, never paths inferred from workspace content.
 * @returns Canonical existing home or an absolute location for first-run initialization.
 */
export async function resolveDesktopHome(selected: string | undefined, candidates: readonly string[]): Promise<string> {
  const home = selected || candidates[0]
  if (!home || !isAbsolute(home)) throw new DesktopHomeError('Shared home must be an absolute directory')
  try {
    const directory = await stat(home)
    if (!directory.isDirectory()) throw new DesktopHomeError('Shared home must be a directory')
    try {
      const profile = await stat(join(home, 'profiles/desktop/package.json'))
      if (!profile.isFile()) throw new DesktopHomeError('Desktop profile is unavailable')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return await realpath(home)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return home
    throw new DesktopHomeError('Shared home is unavailable')
  }
}
