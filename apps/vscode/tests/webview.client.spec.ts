// @vitest-environment jsdom
/** The Gateway carrier exposes typed WebSocket events without opening native sockets. */
import { afterEach, expect, it, vi } from 'vitest'

const registrations = vi.spyOn(window, 'addEventListener')
afterEach(() => {
  for (const [type, listener, options] of registrations.mock.calls) window.removeEventListener(type, listener, options)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
})

it('delivers property handlers and listeners while rejecting non-Gateway frames', async () => {
  const postMessage = vi.fn<(message: Record<string, unknown>) => void>()
  vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage, getState: () => undefined, setState: vi.fn() }))
  for (const name of ['fetch', 'WebSocket', 'EventSource', '__DSH_TRANSPORT__', '__DSH_FILE_UPLOAD__', '__DSH_VSCODE__', '__DSH_BOOT_READY__']) {
    vi.stubGlobal(name, Reflect.get(globalThis, name))
  }
  await import('../src/webview.ts')
  const messages = (): Record<string, unknown>[] => postMessage.mock.calls.map(([message]) => message)
  const deliver = (id: unknown, kind: string, data?: string): void => {
    window.dispatchEvent(new MessageEvent('message', { data: { channel: 'dsh-vscode', id, kind, data } }))
  }
  const socket = new WebSocket('ws://dsh.internal/api/remote.mux')
  const id = messages().find(message => message.kind === 'socket-open')!.id
  const opened = vi.fn()
  const received = vi.fn<(event: MessageEvent<string>) => void>()
  const closed = vi.fn()
  const eventListener = vi.fn()
  socket.onopen = opened
  socket.onmessage = received
  socket.onclose = closed
  socket.addEventListener('message', eventListener)
  expect(socket.readyState).toBe(socket.CONNECTING)
  expect(() => { socket.send('early') }).toThrow('not open')
  deliver(id, 'socket-open')
  expect(opened.mock.contexts).toEqual([socket])
  expect(socket.readyState).toBe(socket.OPEN)
  socket.send('frame')
  expect(messages()).toContainEqual({ channel: 'dsh-vscode', id, kind: 'socket-send', data: 'frame' })
  expect(() => { socket.send(new ArrayBuffer(1)) }).toThrow('text frames')
  deliver(id, 'socket-message', 'reply')
  expect(received.mock.calls[0]?.[0].data).toBe('reply')
  expect(eventListener).toHaveBeenCalledOnce()
  socket.onmessage = null
  deliver(id, 'socket-message', 'second')
  expect(received).toHaveBeenCalledOnce()
  expect(eventListener).toHaveBeenCalledTimes(2)
  socket.close()
  socket.close()
  expect(socket.readyState).toBe(socket.CLOSING)
  expect(messages().filter(message => message.kind === 'socket-close')).toHaveLength(1)
  deliver(id, 'socket-close')
  expect(socket.readyState).toBe(socket.CLOSED)
  expect(closed).toHaveBeenCalledOnce()
  expect(() => new WebSocket('ws://outside.test/api/remote.mux')).toThrow('stream URL')
  expect(() => new WebSocket(socket.url, 'unowned')).toThrow('subprotocols')
})
