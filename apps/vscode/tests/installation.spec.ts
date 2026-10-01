/** Runtime selection refuses stale or cross-platform installations. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveInstallation } from '../src/installation.ts'

it('matches development assets and rejects stale repository overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-vscode-install-'))
  try {
    await mkdir(join(root, 'apps/cli'), { recursive: true })
    await mkdir(join(root, 'apps/vscode'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.0.1' }))
    await writeFile(join(root, 'development.json'), JSON.stringify({ repository: root, version: 'test' }))
    await writeFile(join(root, 'apps/cli/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: 'test' }))
    expect(await resolveInstallation(root)).toEqual({ directory: join(root, 'apps/cli'), version: 'test', sharedRuntime: join(root, 'apps/vscode'),
      desktopHome: join(root, 'apps/desktop/.desktop-build/development/home') })
    await writeFile(join(root, 'apps/cli/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: 'stale' }))
    await expect(resolveInstallation(root)).rejects.toThrow('differs')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('prefers the packaged CLI and never falls back from invalid package metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-vscode-package-'))
  try {
    const directory = join(root, 'runtime/node_modules/@deepseek-ai/dsh')
    await mkdir(directory, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.0.1' }))
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: 'test' }))
    const metadata = { schemaVersion: 1, extensionVersion: '0.0.1', dshVersion: 'test', platform: process.platform, arch: process.arch }
    await writeFile(join(root, 'runtime.json'), JSON.stringify(metadata))
    expect(await resolveInstallation(root, 'ignored-checkout')).toEqual({ directory, version: 'test', sharedRuntime: join(root, 'runtime') })
    if (process.platform === 'win32') {
      const alias = root.charAt(0).toLowerCase() + root.slice(1)
      expect(await resolveInstallation(alias)).toEqual({ directory, version: 'test', sharedRuntime: join(root, 'runtime') })
    }
    for (const invalid of [{ ...metadata, platform: 'wrong' }, { ...metadata, arch: 'wrong' },
      { ...metadata, extensionVersion: 'stale' }, { ...metadata, schemaVersion: 2 }]) {
      await writeFile(join(root, 'runtime.json'), JSON.stringify(invalid))
      await expect(resolveInstallation(root, 'ignored-checkout')).rejects.toThrow('does not match')
    }
    await writeFile(join(root, 'runtime.json'), 'not json')
    await expect(resolveInstallation(root)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
