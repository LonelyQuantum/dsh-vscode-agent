/** A misspelled scenario must not fall back to a successful smoke run. */
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

it('rejects character-split scenario flags before creating an editor or home', () => {
  const script = fileURLToPath(new URL('./test-extension.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, 'unused-editor', '--fresh-shared', '-', '-', 'u', 'x'], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Pass only one VS Code executable/)
})
