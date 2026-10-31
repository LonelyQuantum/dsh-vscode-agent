import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { collectPackageAssets } from '../src/package-assets.ts'

it('admits only public Client images, preserves resolver priority and refuses linked private content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-public-assets-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const modules = join(root, 'profile/node_modules')
  const fallback = join(root, 'runtime/node_modules')
  const packageRoot = join(modules, '@fixture/client')
  const assets = join(packageRoot, 'lib/assets')
  await mkdir(assets, { recursive: true })
  const manifest = { name: '@fixture/client', dsh: { client: {} }, exports: { './assets/*': './lib/assets/*' } }
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest))
  await writeFile(join(assets, 'image (a).svg'), '<svg/>')
  await writeFile(join(assets, 'private.json'), '{"secret":"synthetic"}')
  const outside = join(root, 'private')
  await mkdir(outside)
  await writeFile(join(outside, 'secret.svg'), '<svg/>')
  await symlink(outside, join(assets, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  const lower = join(fallback, '@fixture/client/lib/assets')
  await mkdir(lower, { recursive: true })
  await writeFile(join(lower, '../../package.json'), JSON.stringify(manifest))
  await writeFile(join(lower, 'fallback.svg'), '<svg/>')
  const hidden = join(modules, '@fixture/hidden/lib/assets')
  await mkdir(hidden, { recursive: true })
  await writeFile(join(hidden, '../../package.json'), JSON.stringify({ name: '@fixture/hidden', dsh: { client: {} } }))
  await writeFile(join(hidden, 'hidden.svg'), '<svg/>')
  const files = await collectPackageAssets([modules, fallback, join(root, 'absent')], new AbortController().signal)
  expect([...files.keys()]).toEqual(['plugins/@fixture/client/assets/image%20%28a%29.svg'])
  expect(files.values().next().value?.replaceAll('\\', '/')).toBe(join(assets, 'image (a).svg').replaceAll('\\', '/'))
  const abort = new AbortController(); abort.abort()
  await expect(collectPackageAssets([modules], abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
})
