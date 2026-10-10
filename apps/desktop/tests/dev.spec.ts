import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runPackageScript } from '../scripts/dev.ts'

it.each(['javascript', 'native'] as const)('runs builds through a %s package-manager entry', async (kind) => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-pnpm-'))
  try {
    const cwd = join(root, 'package with spaces')
    await mkdir(cwd)
    await writeFile(join(cwd, 'package.json'), '{"type":"module"}\n')
    const entry = join(cwd, kind === 'javascript' ? 'pnpm.mjs' : 'run')
    await writeFile(entry, 'import { writeFileSync } from "node:fs"; writeFileSync("invocation.json", JSON.stringify(process.argv.slice(2)))\n')
    await runPackageScript('build', cwd, { ...process.env, npm_execpath: kind === 'javascript' ? entry : process.execPath })
    expect(JSON.parse(await readFile(join(cwd, 'invocation.json'), 'utf8')))
      .toEqual(kind === 'javascript' ? ['run', 'build'] : ['build'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('reports a failed package script', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-pnpm-failure-'))
  try {
    const entry = join(root, 'pnpm.mjs')
    await writeFile(entry, 'process.exitCode = 7\n')
    await expect(runPackageScript('build', root, { ...process.env, npm_execpath: entry })).rejects.toThrow('exited with 7')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('keeps the repository package manager aligned with the Desktop dependency', async () => {
  const root = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as { packageManager: string }
  const desktop = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { devDependencies: { pnpm: string } }
  expect(root.packageManager.split('+')[0]).toBe(`pnpm@${desktop.devDependencies.pnpm}`)
})
