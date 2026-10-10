/** Package-manager installation state and POSIX launchers are not Windows runtime inputs. */
import { expect, it } from 'vitest'
import { windowsArtifactIgnores } from '../scripts/package-files.ts'

it('excludes machine-local installer records and POSIX shims, retaining Windows launchers', () => {
  expect(windowsArtifactIgnores([
    'runtime/node_modules/.bin/dsh.ps1', 'runtime/node_modules/.bin/dsh',
    'runtime/node_modules/tool/node_modules/.bin/worker', 'runtime/node_modules/.bin/dsh.cmd',
    'runtime/node_modules/.bin/helper.EXE',
  ])).toBe('**/*.map\n**/.modules.yaml\n**/.pnpm-workspace-state-v1.json\n'
    + 'runtime/node_modules/.bin/dsh\nruntime/node_modules/tool/node_modules/.bin/worker\n')
})
