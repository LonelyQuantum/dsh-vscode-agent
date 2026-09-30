/** Locate Desktop API configuration without reading or copying credential values. */
import { stat, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

/** A selected Desktop home is missing or cannot be used. */
export class DesktopHomeError extends Error {}

/**
 * Resolve an explicit Desktop home or the first initialized automatic candidate.
 * @param selected Machine-scoped user choice; a missing explicit choice fails instead of falling back.
 * @param candidates Trusted application-owned locations, never paths inferred from workspace content.
 * @returns Canonical Desktop home, or undefined when no automatic candidate is initialized.
 */
export async function resolveDesktopHome(selected: string | undefined, candidates: readonly string[]): Promise<string | undefined> {
  for (const home of selected ? [selected] : candidates) {
    if (!isAbsolute(home)) throw new DesktopHomeError('Desktop home must be an absolute directory')
    try {
      const profile = await stat(join(home, 'profiles/desktop/package.json'))
      if (!profile.isFile()) throw new DesktopHomeError('Desktop profile is unavailable')
      return await realpath(home)
    } catch (error) {
      if (!selected && (error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw new DesktopHomeError('Desktop profile is unavailable')
    }
  }
  return undefined
}
