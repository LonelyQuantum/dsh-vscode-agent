/** Publication checks reject missing disclosures and private development state. */
import { expect, it } from 'vitest'
import manifest from '../extension.manifest.json' with { type: 'json' }
import { artifactProblems, manifestProblems, RELEASE_FILES } from '../scripts/release-policy.ts'
import { EXTENSION_ID } from '../scripts/extension-identity.mjs'

it('accepts GitHub preview metadata and refuses SemVer prereleases for Marketplace preparation', () => {
  expect(manifestProblems(manifest, false)).toEqual([])
  const prereleaseError = 'Marketplace requires a major.minor.patch version without SemVer prerelease identifiers'
  expect(manifestProblems(manifest, true)).toEqual([prereleaseError])
  expect(manifestProblems({ ...manifest, version: '0.0.2-rc.1' }, false)).toEqual([])
  expect(manifestProblems({ ...manifest, version: '0.0.2-rc.1' }, true)).toEqual([prereleaseError])
  expect(manifestProblems({ ...manifest, version: '0.0.2' }, true)).toEqual([])
  expect(manifestProblems({ ...manifest, version: '0.0.2', publisher: 'dsh-local' }, true))
    .toEqual(['Replace dsh-local with your registered Marketplace publisher ID'])
  expect(manifestProblems(null, false)).toHaveLength(1)
  expect(manifestProblems({}, true).length).toBeGreaterThan(0)
})

it('identifies the community author and derives the canonical editor identity from the manifest', () => {
  expect(manifest.author).toEqual({ name: 'LonelyQuantum', url: 'https://github.com/LonelyQuantum' })
  expect(manifest.publisher).toBe('LonelyQuantum')
  expect(manifest.version).toBe('0.0.2-alpha.1')
  expect(EXTENSION_ID).toBe(`${manifest.publisher}.${manifest.name}`.toLowerCase())
  expect(EXTENSION_ID).toBe('lonelyquantum.dsh-vscode-agent')
})

it('keeps native API setup on the Agent view title key action', () => {
  expect(manifest.contributes.commands.find(command => command.command === 'dsh.configure')?.icon).toBe('$(key)')
  expect(manifest.contributes.menus['view/title'].filter(item => item.command === 'dsh.configure'))
    .toEqual([{ command: 'dsh.configure', when: 'view == dsh.agent', group: 'navigation@3' }])
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
