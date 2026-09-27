import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cordisConfigFiles, cordisConfigReader } from './cordis-config-files.ts'
import { loadCordisYaml } from './cordis-yaml.ts'
import { removeFixtureSafely } from './test-fixture-cleanup.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) removeFixtureSafely(root)
})

describe('cordisConfigFiles', () => {
  it('finds Loader YAML without treating translation records as configs', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-cordis-config-files-'))
    roots.push(root)
    for (const directory of ['.claude', 'apps/cli/config/examples', 'docs', 'node_modules/pkg', 'vendor/pkg']) {
      mkdirSync(join(root, directory), { recursive: true })
    }
    for (const file of [
      '.claude/hidden.cordis.yml',
      'docs/cordis-primer.i18n.yaml',
      'apps/cli/config/examples/agent.cordis.yaml',
      'apps/cli/config/examples/headless.cordis.yml',
      'node_modules/pkg/hidden.cordis.yml',
      'vendor/pkg/hidden.cordis.yml',
    ]) {
      writeFileSync(join(root, file), '[]\n')
    }

    expect(cordisConfigFiles(root)).toEqual([
      'apps/cli/config/examples/agent.cordis.yaml',
      'apps/cli/config/examples/headless.cordis.yml',
    ])
  })
})

function gitFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cordis-links-'))
  roots.push(root)
  execFileSync('git', ['init', '--quiet', root])
  return root
}

function stub(root: string, file: string, target: string): void {
  writeFileSync(join(root, file), target)
  const oid = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: target, encoding: 'utf8' }).trim()
  execFileSync('git', ['update-index', '--add', '--cacheinfo', `120000,${oid},${file}`], { cwd: root })
}

describe('Cordis configs in Git symlink-disabled checkouts', () => {
  it('reads working-tree targets through indexed stub chains, retaining YAML validation', () => {
    const root = gitFixture()
    writeFileSync(join(root, 'target.yml'), '- name: fixture\n')
    stub(root, 'cordis.yml', 'second.yml')
    stub(root, 'second.yml', 'target.yml')
    const read = cordisConfigReader(root)
    expect(loadCordisYaml(read('cordis.yml'))).toEqual([{ name: 'fixture' }])
    writeFileSync(join(root, 'target.yml'), 'invalid-scalar\n')
    expect(Array.isArray(loadCordisYaml(read('cordis.yml')))).toBe(false)
    writeFileSync(join(root, 'target.yml'), '[invalid\n')
    expect(() => loadCordisYaml(read('cordis.yml'))).toThrow()
  })

  it('does not treat ordinary path-valued YAML as a link', () => {
    const root = gitFixture()
    writeFileSync(join(root, 'target.yml'), '[]\n')
    writeFileSync(join(root, 'cordis.yml'), 'target.yml')
    execFileSync('git', ['add', 'cordis.yml'], { cwd: root })
    expect(cordisConfigReader(root)('cordis.yml')).toBe('target.yml')
  })

  it('rejects cyclic, missing, multiline and outside-repository targets', () => {
    const root = gitFixture()
    stub(root, 'cycle.yml', 'cycle.yml')
    stub(root, 'missing.yml', 'absent.yml')
    stub(root, 'multiline.yml', 'target.yml\n')
    stub(root, 'escape.yml', '../outside.yml')
    const read = cordisConfigReader(root)
    expect(() => read('cycle.yml')).toThrow('link cycle')
    expect(() => read('missing.yml')).toThrow('ENOENT')
    expect(() => read('multiline.yml')).toThrow('Invalid Cordis config link target')
    expect(() => read('escape.yml')).toThrow('escapes repository')
  })

  it('rejects a stub target traversing a directory junction outside the repository', () => {
    const root = gitFixture()
    const outside = mkdtempSync(join(tmpdir(), 'dsh-cordis-outside-'))
    roots.push(outside)
    writeFileSync(join(outside, 'target.yml'), '[]\n')
    symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    stub(root, 'cordis.yml', 'linked/target.yml')
    expect(() => cordisConfigReader(root)('cordis.yml')).toThrow('escapes repository')
  })

  it.skipIf(process.platform === 'win32')('follows native file symlinks without changing their contents', () => {
    const root = gitFixture()
    writeFileSync(join(root, 'target.yml'), '[]\n')
    // Native file symlinks require a Windows privilege; stubs and junctions cover Windows.
    symlinkSync('target.yml', join(root, 'cordis.yml'))
    expect(cordisConfigReader(root)('cordis.yml')).toBe('[]\n')
  })
})
