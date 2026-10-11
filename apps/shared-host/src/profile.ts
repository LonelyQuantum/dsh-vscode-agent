/** Community defaults for a newly created shared Desktop profile. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const COMMUNITY_PATCH = '# Community shared-profile defaults; existing profiles are never overwritten.\n'
  + '- id: product-analytics\n  config:\n    enabled: false\n    appVersion: !!js process.env.DSH_CLIENT_VERSION\n'

/**
 * Seed opt-out collection only before the first profile initialization.
 * The caller owns the shared startup or writer lock. Existing manifests and patches retain their policy.
 * @param directory Reserved Desktop profile directory.
 * @param initialize Standard DSH profile initializer; existing files remain authoritative.
 */
export function initializeCommunityProfile(directory: string, initialize: () => void): void {
  const patch = join(directory, 'cordis.patch.yml')
  if (!existsSync(join(directory, 'package.json')) && !existsSync(patch)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    writeFileSync(patch, COMMUNITY_PATCH, { flag: 'wx', mode: 0o600 })
  }
  initialize()
}
