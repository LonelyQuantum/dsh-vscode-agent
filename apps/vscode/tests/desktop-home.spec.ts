/** Shared home selection admits first-run initialization without choosing a second data store. */
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveDesktopHome } from '../src/desktop-home.ts'

it('keeps the selected or highest-priority home even before it is initialized', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-home-'))
  try {
    const fresh = join(root, 'new home')
    const existing = join(root, 'existing')
    await mkdir(join(existing, 'profiles/desktop'), { recursive: true })
    await writeFile(join(existing, 'profiles/desktop/package.json'), '{}')
    expect(await resolveDesktopHome(undefined, [fresh, existing])).toBe(fresh)
    expect(await resolveDesktopHome(fresh, [existing])).toBe(fresh)
    await expect(readFile(join(fresh, 'profiles/desktop/package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await resolveDesktopHome(existing, [])).toBe(await realpath(existing))
    expect(await readFile(join(existing, 'profiles/desktop/package.json'), 'utf8')).toBe('{}')
    await expect(resolveDesktopHome('relative', [existing])).rejects.toThrow('absolute')
    await expect(resolveDesktopHome(join(existing, 'profiles/desktop/package.json'), [])).rejects.toThrow('unavailable')
  } finally { await rm(root, { recursive: true, force: true }) }
})
