import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('loads literal configuration without string compilation and rejects expressions under CSP', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../../../vendor/loader/src/config/utils.ts', import.meta.url))],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'loaderUtils' })
  const code = result.outputFiles[0].text
  expect(runInNewContext(code + '; JSON.stringify(loaderUtils.interpolate({}, { nested: [1, "literal"] }))', {},
    { contextCodeGeneration: { strings: false, wasm: false } })).toBe('{"nested":[1,"literal"]}')
  expect(() => {
    runInNewContext(code + '; loaderUtils.interpolate({}, { __jsExpr: "1 + 2" })', {},
      { contextCodeGeneration: { strings: false, wasm: false } })
  }).toThrow('Code generation from strings disallowed')
  expect(runInNewContext(code + '; loaderUtils.evaluate({ value: 2 }, "value + 1") + loaderUtils.evaluate({ value: 4 }, "value + 1")'))
    .toBe(8)
})
