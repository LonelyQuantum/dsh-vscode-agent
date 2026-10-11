/** Peer-only and browser-only dependencies belong to the distributable runtime. */
import { expect, it } from 'vitest'
import { runtimeClosure, type RuntimePackage } from '../scripts/package-closure.ts'

it('collects required peers and client injections once across cycles', () => {
  const entry = (name: string, fields: Partial<RuntimePackage['manifest']> = {}): RuntimePackage =>
    ({ directory: name, manifest: { name, version: '1', ...fields } })
  const entries = [entry('app', { dependencies: { host: '1', external: '1' } }),
    entry('host', { peerDependencies: { peer: '1' }, dsh: { client: { inject: ['client'] } } }),
    entry('peer', { dependencies: { app: '1' } }), entry('client'), entry('unused')]
  const available = new Map(entries.map(value => [value.manifest.name, value]))
  expect(runtimeClosure(available, ['app']).map(value => value.manifest.name)).toEqual(['app', 'client', 'host', 'peer'])
  expect(() => runtimeClosure(available, ['missing'])).toThrow('missing')
})

it('excludes optional workspace binaries for other operating systems', () => {
  const available = new Map<string, RuntimePackage>([
    ['app', { directory: 'app', manifest: { name: 'app', version: '1', optionalDependencies: { foreign: '1', current: '1' } } }],
    ['foreign', { directory: 'foreign', manifest: { name: 'foreign', version: '1', os: ['other-os'] } }],
    ['current', { directory: 'current', manifest: { name: 'current', version: '1', os: [process.platform], cpu: [process.arch] } }],
  ])
  expect(runtimeClosure(available, ['app']).map(value => value.manifest.name)).toEqual(['app', 'current'])
})
