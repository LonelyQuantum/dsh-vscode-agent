/** The native evaluator embeds action bodies inside a synchronous function. */
import { strict as assert } from 'node:assert'
import { it } from 'node:test'
import { Script } from 'node:vm'
import { runPackageTransportCheck } from './test-package-transport.mjs'

it('parses the asynchronous upload action in the native evaluator before sending bytes', async () => {
  const parsed = new Error('Upload program parsed')
  await assert.rejects(runPackageTransportCheck({ extensionPath: '', evaluate: async (program) => {
    new Script(`(function browserProgram() { ${program}\n })`)
    throw parsed
  } }), error => error === parsed)
})
