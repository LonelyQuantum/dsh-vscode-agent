import { expect, it } from 'vitest'
import { UploadBody, UPLOAD_CHUNK, UPLOAD_LIMIT } from '../src/upload.ts'

it('streams the full attachment quota using a single bounded credit, then closes', async () => {
  const abort = new AbortController()
  let credit = Promise.withResolvers<undefined>()
  const upload = new UploadBody(async () => { credit.resolve(undefined) }, abort.signal)
  const reader = upload.stream.getReader()
  const bytes = Buffer.alloc(UPLOAD_CHUNK, 42)
  const encoded = bytes.toString('base64')
  expect(() => { upload.accept(encoded) }).toThrow('no pending read')
  for (let sent = 0; sent < UPLOAD_LIMIT; sent += bytes.length) {
    const next = reader.read()
    await credit.promise
    credit = Promise.withResolvers<undefined>()
    upload.accept(encoded)
    const value = (await next).value
    if (!value) throw new Error('Upload ended before its quota')
    expect(Buffer.from(value).equals(bytes)).toBe(true)
  }
  const eof = reader.read()
  await credit.promise
  upload.accept(null)
  expect((await eof).done).toBe(true)
})

it.each(['', '!', Buffer.alloc(UPLOAD_CHUNK + 1).toString('base64')])('rejects malformed or oversized chunks and releases an aborted read', async (data) => {
  const abort = new AbortController()
  const credit = Promise.withResolvers<undefined>()
  const upload = new UploadBody(async () => { credit.resolve(undefined) }, abort.signal)
  const reader = upload.stream.getReader()
  const pending = reader.read()
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await credit.promise
  expect(() => { upload.accept(data) }).toThrow()
  abort.abort()
  await rejected
})

it('refuses the byte after the complete quota without buffering a second body', async () => {
  const abort = new AbortController()
  let credit = Promise.withResolvers<undefined>()
  const upload = new UploadBody(async () => { credit.resolve(undefined) }, abort.signal)
  const reader = upload.stream.getReader()
  const encoded = Buffer.alloc(UPLOAD_CHUNK).toString('base64')
  for (let sent = 0; sent < UPLOAD_LIMIT; sent += UPLOAD_CHUNK) {
    const next = reader.read(); await credit.promise; credit = Promise.withResolvers<undefined>()
    upload.accept(encoded); await next
  }
  const next = reader.read()
  const rejected = expect(next).rejects.toMatchObject({ name: 'AbortError' })
  await credit.promise
  expect(() => { upload.accept('YQ==') }).toThrow('too large')
  abort.abort(); await rejected
})
