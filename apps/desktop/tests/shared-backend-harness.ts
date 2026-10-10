/** Authenticated RPC access to a test-owned shared Desktop profile. */
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { SharedHostClient } from '@deepseek-ai/dsh-shared-host/client'

/**
 * Authenticate with a temporary backend without exposing its launch token to test output.
 * @param client Lease on the test-owned backend.
 * @returns RPC caller that rejects unsuccessful HTTP and remote responses.
 */
export async function sharedBackendApi(client: SharedHostClient): Promise<(method: string, args: object) => Promise<unknown>> {
  const authenticated = await fetch(client.ready.url, { redirect: 'manual' })
  await authenticated.body?.cancel()
  const cookie = authenticated.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  expect(cookie).not.toBe('')
  return async (method, args) => {
    const response = await fetch(new URL(`/api/${method}`, client.ready.url), { method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
    })
    expect(response.status).toBe(200)
    const envelope = await response.json() as { result: { ok: boolean; value: unknown } }
    expect(envelope.result.ok, `${method}: ${JSON.stringify(envelope.result)}`).toBe(true)
    return envelope.result.value
  }
}
