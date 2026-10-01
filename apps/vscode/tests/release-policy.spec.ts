/** Publication checks reject missing disclosures and private development state. */
import { expect, it } from 'vitest'
import manifest from '../extension.manifest.json' with { type: 'json' }
import { artifactProblems, manifestProblems, RELEASE_FILES } from '../scripts/release-policy.ts'

it('accepts preview metadata but refuses the local publisher for Marketplace preparation', () => {
  expect(manifestProblems(manifest, false)).toEqual([])
  expect(manifestProblems({ ...manifest, publisher: 'dsh-local' }, true)).toEqual(['Replace dsh-local with your registered Marketplace publisher ID'])
  expect(manifestProblems(null, false)).toHaveLength(1)
  expect(manifestProblems({}, true).length).toBeGreaterThan(0)
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
