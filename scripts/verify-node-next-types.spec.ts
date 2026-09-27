/** NodeNext consumer checks run against isolated package declarations and real TypeScript. */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { removeFixtureSafely } from './test-fixture-cleanup.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) removeFixtureSafely(root) })

function fixture(declaration?: string): { root: string; packageDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-node-next-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts'))
  copyFileSync(new URL('./verify-node-next-types.ts', import.meta.url), join(root, 'scripts/verify-node-next-types.ts'))
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
  symlinkSync(resolve(import.meta.dirname, '../node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const packageDir = join(root, 'packages/example/consumer')
  mkdirSync(join(packageDir, 'lib/types'), { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: '@fixture/consumer', type: 'module', types: './lib/types/index.d.ts',
    exports: { '.': { types: './lib/types/index.d.ts' } },
  }))
  if (declaration !== undefined) writeFileSync(join(packageDir, 'lib/types/index.d.ts'), declaration)
  return { root, packageDir }
}

function run(root: string): ReturnType<typeof spawnSync> {
  const result = spawnSync(process.execPath, [join(root, 'scripts/verify-node-next-types.ts')], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
  })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  return result
}

it('compiles a linked external consumer and removes links without deleting their targets', () => {
  const declaration = 'export declare const answer: number;\n'
  const { root, packageDir } = fixture(declaration)
  const result = run(root)
  expect(result.status, String(result.stderr)).toBe(0)
  expect(String(result.stdout)).toContain('1 workspace package declaration API(s) compile under NodeNext')
  expect(readFileSync(join(packageDir, 'lib/types/index.d.ts'), 'utf8')).toBe(declaration)
  expect(readFileSync(join(root, 'node_modules/@types/node/package.json'), 'utf8')).toContain('@types/node')
  expect(readdirSync(root).filter(name => name.startsWith('.node-next-types-'))).toEqual([])
})

it('rejects a missing public declaration subpath and still preserves link targets', () => {
  const { root, packageDir } = fixture('export declare const answer: number;\n')
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: '@fixture/consumer', type: 'module', types: './lib/types/index.d.ts',
    exports: { '.': { types: './lib/types/index.d.ts' }, './missing': { types: './lib/types/missing.d.ts' } },
  }))
  const result = run(root)
  expect(result.status).toBe(1)
  expect(String(result.stderr)).toContain('@fixture/consumer/missing')
  expect(readFileSync(join(packageDir, 'lib/types/index.d.ts'), 'utf8')).toContain('answer')
  expect(readdirSync(root).filter(name => name.startsWith('.node-next-types-'))).toEqual([])
})

it('rejects declaration imports without extensions before creating the consumer', () => {
  const { root } = fixture('export { answer } from "./answer";\n')
  const result = run(root)
  expect(result.status).toBe(1)
  expect(String(result.stderr)).toContain('relative specifiers without file extensions')
  expect(readdirSync(root).filter(name => name.startsWith('.node-next-types-'))).toEqual([])
})

it('reports missing build outputs', () => {
  const { root } = fixture()
  const result = run(root)
  expect(result.status).toBe(1)
  expect(String(result.stderr)).toContain('build outputs are missing')
})
