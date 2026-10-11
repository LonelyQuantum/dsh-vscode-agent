/** Native review admits only complete bounded captures, including empty and missing sides. */
import { expect, it } from 'vitest'
import { capturedPair } from '../src/review.ts'

it.each([[null, 'created'], ['deleted', null], ['', ''], ['before\r\n你好', 'after\n🙂']])('preserves exact captured sides', (before, after) => {
  expect(capturedPair({ kind: 'text', display: 'file.ts', before, after })).toEqual({ display: 'file.ts', before, after })
})

it.each([undefined, {}, { kind: 'text', display: 'file', before: true, after: true, hunks: [] },
  { kind: 'binary' }, { kind: 'oversized' }, { kind: 'text', display: 'file', before: null, after: '🙂'.repeat(1048577) },
])('rejects missing, partial-hunk, binary, and oversized responses', (value) => {
  expect(() => capturedPair(value)).toThrow()
})
