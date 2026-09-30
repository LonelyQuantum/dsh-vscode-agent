/** Native Desktop lease cleanup preserves a refused exclusive attachment. */
import { expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { SharedDesktopHost } from '../src/shared-host.ts'

const fixture = vi.hoisted(() => ({
  ready: { url: 'http://127.0.0.1:49152/', injections: [], pid: 123 },
  close: vi.fn(async (_exclusive?: boolean) => {}),
  onExit: vi.fn(() => () => {}),
}))
vi.mock('@deepseek-ai/dsh-shared-host/client', () => ({ acquireSharedHost: async () => fixture }))

it('keeps the attachment usable when exclusive release is refused', async () => {
  const platformSession = vi.fn()
  const host = new SharedDesktopHost({ home: tmpdir(), version: 'fixture',
    launch: { protocol: 1, version: 'fixture', node: tmpdir(), runtime: tmpdir(), primaryRuntime: tmpdir() },
    prepare: async () => {}, failure: vi.fn(), platformSession })
  expect(await host.start()).toBe(fixture.ready)
  fixture.close.mockRejectedValueOnce(new Error('Another client remains'))
  await expect(host.stop(true)).rejects.toThrow('Another client remains')
  expect(platformSession).not.toHaveBeenCalled()
  expect(await host.start()).toBe(fixture.ready)
  await host.stop(true)
  expect(platformSession).toHaveBeenCalledWith(null)
  await expect(host.start()).rejects.toThrow('closed')
})
