/** Fresh community policy is durable without changing an existing profile. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initProfile } from '@deepseek-ai/dsh-app-boot'
import { expect, it, onTestFinished } from 'vitest'
import { initializeCommunityProfile } from '../src/profile.ts'

async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-community-profile-'))
  onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  return root
}

it('seeds disabled analytics before normal initialization and preserves it across restarts', async () => {
  const root = await directory()
  const initialize = (): void => { initProfile(root, ['@deepseek-ai/dsh-base']) }
  initializeCommunityProfile(root, initialize)
  const before = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  expect(before).toContain('enabled: false')
  expect(before).toContain('appVersion: !!js process.env.DSH_CLIENT_VERSION')
  const manifest: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  expect(manifest).toMatchObject({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } })
  initializeCommunityProfile(root, initialize)
  expect(await readFile(join(root, 'cordis.patch.yml'), 'utf8')).toBe(before)
})

it.each(['manifest', 'patch'])('keeps an existing %s authoritative', async (existing) => {
  const root = await directory()
  const patch = '# Existing policy\n- id: product-analytics\n  config:\n    enabled: true\n'
  if (existing === 'manifest') {
    initProfile(root, ['@deepseek-ai/dsh-base'])
  } else {
    await writeFile(join(root, 'cordis.patch.yml'), patch)
  }
  const before = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  initializeCommunityProfile(root, () => { initProfile(root, ['@deepseek-ai/dsh-base']) })
  expect(await readFile(join(root, 'cordis.patch.yml'), 'utf8')).toBe(before)
})

it('retains the disabled policy if initialization fails and a later startup retries', async () => {
  const root = await directory()
  expect(() => { initializeCommunityProfile(root, () => { throw new Error('fixture initialization failure') }) })
    .toThrow('fixture initialization failure')
  initializeCommunityProfile(root, () => { initProfile(root, ['@deepseek-ai/dsh-base']) })
  expect(await readFile(join(root, 'cordis.patch.yml'), 'utf8')).toContain('enabled: false')
})
