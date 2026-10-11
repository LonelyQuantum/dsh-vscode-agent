/** Publication checks reject missing disclosures and private development state. */
import { expect, it } from 'vitest'
import manifest from '../extension.manifest.json' with { type: 'json' }
import { artifactProblems, manifestProblems, RELEASE_FILES } from '../scripts/release-policy.ts'
import { EXTENSION_ID } from '../scripts/extension-identity.mjs'

it('accepts preview metadata but refuses the local publisher for Marketplace preparation', () => {
  expect(manifestProblems(manifest, false)).toEqual([])
  expect(manifestProblems(manifest, true)).toEqual([])
  expect(manifestProblems({ ...manifest, publisher: 'dsh-local' }, true)).toEqual(['Replace dsh-local with your registered Marketplace publisher ID'])
  expect(manifestProblems(null, false)).toHaveLength(1)
  expect(manifestProblems({}, true).length).toBeGreaterThan(0)
})

it('identifies the community author and derives the canonical editor identity from the manifest', () => {
  expect(manifest.author).toEqual({ name: 'LonelyQuantum', url: 'https://github.com/LonelyQuantum' })
  expect(manifest.publisher).toBe('LonelyQuantum')
  expect(manifest.version).toBe('0.0.1')
  expect(EXTENSION_ID).toBe(`${manifest.publisher}.${manifest.name}`.toLowerCase())
  expect(EXTENSION_ID).toBe('lonelyquantum.dsh-vscode-agent')
})

it('requires disclosure files and rejects environment files, discovery records and source maps', () => {
  expect(artifactProblems(RELEASE_FILES)).toEqual([])
  for (const required of RELEASE_FILES) expect(artifactProblems(RELEASE_FILES.filter(file => file !== required))).toEqual([`Missing release file: ${required}`])
  for (const file of ['.env', 'runtime/.env.production', 'development.json', 'web/client.js.map',
    '.shared-host/endpoint.json', 'runtime/node_modules/.modules.yaml', '.git/config']) {
    expect(artifactProblems([...RELEASE_FILES, file])).toEqual([`Local state or debug artifact must not ship: ${file}`])
  }
  expect(artifactProblems([...RELEASE_FILES, 'runtime/.env.example'])).toEqual([])
})
