/** Installed lifecycle checks distinguish a cold history view from a live Agent. */
import { expect, it } from 'vitest'
import { autoRemovalReady, compatibilityEvents } from '../scripts/compatibility-state.mjs'

it('does not remove a reviewer merely because restored history displays Auto', () => {
  const projections = { values: { permissions: { currentValue: 'auto' } } }
  expect(autoRemovalReady({ agentAvailable: false, running: false, projections }, true)).toBe(false)
  expect(autoRemovalReady({ agentAvailable: true, running: true, projections }, true)).toBe(false)
  expect(autoRemovalReady({ agentAvailable: true, running: false, projections }, false)).toBe(false)
  expect(autoRemovalReady({ agentAvailable: true, running: false }, true)).toBe(false)
  expect(autoRemovalReady(undefined, true)).toBe(false)
  expect(autoRemovalReady({ agentAvailable: true, running: false,
    projections: { values: { permissions: { currentValue: 'read-only' } } } }, true)).toBe(false)
  expect(autoRemovalReady({ agentAvailable: true, running: false, projections }, true)).toBe(true)
})

it('distinguishes absent tool dispatch, pending approval and failed execution without exposing payloads', () => {
  const secret = 'PRIVATE_TRANSCRIPT_SENTINEL'
  const events = [
    { type: 'turn/start', data: { text: secret } },
    { type: 'user/message', data: { text: secret } },
    { type: 'assistant/attempt', data: { text: secret } },
    { type: 'assistant/message', data: { text: secret } },
    { type: 'tool/call', data: { arguments: secret } },
    { type: 'approval/asked', data: { reason: secret } },
  ]
  expect(compatibilityEvents(events)).toEqual({ userMessages: 1, assistantMessages: 1,
    assistantAttempts: 1, toolCalls: 1, toolResults: 0, failedToolResults: 0,
    approvalsAsked: 1, approvalsDecided: 0, turnsStarted: 1, turnsEnded: 0 })
  const settled = compatibilityEvents([...events,
    { type: 'approval/decided', data: { text: secret } },
    { type: 'tool/result', data: { error: secret } },
    { type: 'tool/result', data: { text: secret } },
    { type: 'turn/end', data: { text: secret } },
  ])
  expect(settled).toMatchObject({ toolResults: 2, failedToolResults: 1,
    approvalsAsked: 1, approvalsDecided: 1, turnsEnded: 1 })
  expect(JSON.stringify(settled)).not.toContain(secret)
})
