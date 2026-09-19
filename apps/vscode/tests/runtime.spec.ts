import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { AgentRuntime } from '../src/runtime.ts'

it('starts a child with spaces in paths and joins repeated shutdowns', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-vscode process '))
  const runtime = new AgentRuntime()
  try {
    await mkdir(join(directory, 'apps/cli/lib'), { recursive: true })
    await writeFile(join(directory, 'apps/cli/lib/profile-boot.js'), '')
    const ready = await runtime.start({ node: process.execPath, repository: directory,
      entry: fileURLToPath(new URL('./fixtures/runtime.mjs', import.meta.url)),
      workspace: directory, home: join(directory, 'home') })
    expect(ready.injections).toEqual([])
    const first = runtime.stop()
    expect(runtime.stop()).toBe(first)
    await first
    expect(() => process.kill(ready.pid, 0)).toThrow()
  } finally { await runtime.stop(); await rm(directory, { recursive: true, force: true }) }
})

it('reports missing executables without leaving startup pending', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-vscode-failed-'))
  const runtime = new AgentRuntime()
  try {
    await mkdir(join(directory, 'apps/cli/lib'), { recursive: true })
    await writeFile(join(directory, 'apps/cli/lib/profile-boot.js'), '')
    await expect(runtime.start({ node: join(directory, 'missing-node.exe'), repository: directory,
      entry: 'unused.mjs', workspace: directory, home: join(directory, 'home') })).rejects.toThrow()
  } finally { await runtime.stop(); await rm(directory, { recursive: true, force: true }) }
})

it('cancels startup before a child is created', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-vscode-cancel-'))
  const runtime = new AgentRuntime()
  try {
    await mkdir(join(directory, 'apps/cli/lib'), { recursive: true })
    await writeFile(join(directory, 'apps/cli/lib/profile-boot.js'), '')
    const starting = runtime.start({ node: process.execPath, repository: directory,
      entry: fileURLToPath(new URL('./fixtures/runtime.mjs', import.meta.url)),
      workspace: directory, home: join(directory, 'home') })
    await runtime.stop()
    await expect(starting).rejects.toThrow('startup was cancelled')
  } finally { await runtime.stop(); await rm(directory, { recursive: true, force: true }) }
})

it('passes an extension-stored key only to the owned child environment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-vscode-secret-'))
  const runtime = new AgentRuntime()
  try {
    await mkdir(join(directory, 'apps/cli/lib'), { recursive: true })
    await writeFile(join(directory, 'apps/cli/lib/profile-boot.js'), '')
    const ready = await runtime.start({ node: process.execPath, repository: directory,
      entry: fileURLToPath(new URL('./fixtures/secret-runtime.mjs', import.meta.url)),
      workspace: directory, home: join(directory, 'home'), apiKey: 'fixture-only-key' })
    expect(JSON.stringify(ready)).not.toContain('fixture-only-key')
  } finally { await runtime.stop(); await rm(directory, { recursive: true, force: true }) }
})
