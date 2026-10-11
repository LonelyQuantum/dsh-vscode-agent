/** Manifest-owned identity used by native editor acceptance launchers and observers. */
import manifest from '../extension.manifest.json' with { type: 'json' }

/** Canonical lowercase extension ID for editor lookup and private storage paths. */
export const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`.toLowerCase()
