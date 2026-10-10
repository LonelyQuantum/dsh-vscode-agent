/** The extension locates its own Node host without Desktop state or shell interpolation. */
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveSharedLaunch } from '../src/shared-launch.ts'

it('resolves Node to an absolute executable and rejects a different host version', async () => {
  const runtime = await mkdtemp(join(tmpdir(), 'dsh-shared-launch '))
  try {
    const host = join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host')
    await mkdir(host, { recursive: true })
    await writeFile(join(host, 'package.json'), JSON.stringify({ version: 'fixture' }))
    expect(await resolveSharedLaunch(process.execPath, runtime, 'fixture')).toEqual({ protocol: 1,
      version: 'fixture', node: await realpath(process.execPath), runtime: await realpath(runtime) })
    await expect(resolveSharedLaunch(process.execPath, runtime, 'other')).rejects.toThrow('differs')
    await expect(resolveSharedLaunch(join(runtime, 'missing-node'), runtime, 'fixture')).rejects.toThrow()
  } finally { await rm(runtime, { recursive: true, force: true }) }
})
