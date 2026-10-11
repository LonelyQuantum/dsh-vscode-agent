/** Recovery navigation uses the same browser-serialized function as installed acceptance. */
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { selectRecoveredSession } from '../scripts/session-restoration.mjs'

interface NavigationState { active?: boolean; disabled?: boolean; rowId?: string; backDisabled?: boolean }

function navigation({ active = false, disabled = false, rowId, backDisabled = false }: NavigationState = {}) {
  const clickRow = vi.fn()
  const clickBack = vi.fn()
  const root = {
    querySelectorAll: () => rowId === undefined ? [] : [{ dataset: { sessionId: rowId }, disabled, click: clickRow }],
    querySelector: () => active ? { disabled: backDisabled, click: clickBack } : null,
  }
  const select = (value: typeof root | null = root): boolean => {
    const result: unknown = runInNewContext(`(${selectRecoveredSession.toString()})(root, sessionId)`,
      { root: value, sessionId: 'restored-session' })
    return result === true
  }
  return { select, clickRow, clickBack }
}

it('opens the list when recovery has already returned to a conversation', () => {
  const view = navigation({ active: true })
  expect(view.select()).toBe(false)
  expect(view.clickBack).toHaveBeenCalledOnce()
  expect(view.clickRow).not.toHaveBeenCalled()
})

it('selects the enabled row for the requested Session', () => {
  const view = navigation({ active: true, rowId: 'restored-session' })
  expect(view.select()).toBe(true)
  expect(view.clickRow).toHaveBeenCalledOnce()
  expect(view.clickBack).not.toHaveBeenCalled()
})

it('waits for mounting, missing rows and disabled navigation', () => {
  for (const options of [{}, { rowId: 'another-session' }, { rowId: 'restored-session', disabled: true },
    { active: true, backDisabled: true }]) {
    const view = navigation(options)
    expect(view.select()).toBe(false)
    expect(view.select(null)).toBe(false)
    expect(view.clickRow).not.toHaveBeenCalled()
    expect(view.clickBack).not.toHaveBeenCalled()
  }
})
