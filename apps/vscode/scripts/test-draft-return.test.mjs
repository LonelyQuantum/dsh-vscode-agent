/** Parse the browser programs emitted before the first native navigation action. */
import { strict as assert } from 'node:assert'
import { it } from 'node:test'
import { Script } from 'node:vm'
import { runDraftReturnCheck } from './test-draft-return.mjs'

it('emits valid browser JavaScript for the Back selector and click', async () => {
  const reachedClick = new Error('Navigation programs parsed')
  await assert.rejects(runDraftReturnCheck({
    evaluate: async (program) => {
      new Script(`(function browserProgram() { ${program}\n })`)
      if (program.includes('.click()')) throw reachedClick
      return true
    },
    waitFor: operation => operation(),
    request: async () => {},
  }), error => error === reachedClick)
})
