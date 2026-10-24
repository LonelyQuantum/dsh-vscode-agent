/** Unsent workspace drafts survive visits to an existing conversation in the installed editor. */
import { strict as assert } from 'node:assert'
import { selectRecoveredSession } from './session-restoration.mjs'

/**
 * Reopen one blank draft, including its editor-reference chip, without submitting it.
 * @param harness Test-owned Webview evaluation, native input and bounded readiness waits.
 * @returns Completion after the original conversation is selected again.
 */
export async function runDraftReturnCheck({ evaluate, request, waitFor }) {
  const original = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
  const userMessages = await evaluate('return root.querySelectorAll("[data-user-message]").length')
  const back = async () => {
    await waitFor(() => evaluate('return !!root.querySelector("button[aria-label=\"Back to conversations\"]")'))
    await evaluate('root.querySelector("button[aria-label=\"Back to conversations\"]").click()')
    await waitFor(() => evaluate(`return !!root.querySelector('nav button[data-session-id]')
      && !!doc.defaultView.__DSH_VSCODE__.lastSession()
      && doc.defaultView.__DSH_VSCODE__.lastSession() !== ${JSON.stringify(original)}
      && root.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true'`))
  }
  const reopen = () => waitFor(() => evaluate(`return (${selectRecoveredSession.toString()})(root, ${JSON.stringify(original)})`))
  await back()
  const blank = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
  await evaluate('root.querySelector("[data-composer-input]").focus()')
  await request('Input.insertText', { text: 'RC3_UNSENT_WORKSPACE_DRAFT' })
  await evaluate('[...root.querySelectorAll("button")].find(button => button.textContent === "Attach selection").click()')
  await waitFor(() => evaluate('return root.querySelectorAll("[data-composer-chip=editor-context]").length === 1'))
  const draft = await evaluate('return root.querySelector("[data-composer-input]").textContent')
  assert.ok(draft.includes('RC3_UNSENT_WORKSPACE_DRAFT'))
  await reopen()
  await waitFor(() => evaluate(`return doc.defaultView.__DSH_VSCODE__.lastSession() === ${JSON.stringify(original)}
    && root.querySelectorAll('[data-user-message]').length === ${userMessages}`))
  await back()
  assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), blank)
  await waitFor(() => evaluate('return root.querySelectorAll("[data-composer-chip=editor-context]").length === 1'))
  assert.equal(await evaluate('return root.querySelector("[data-composer-input]").textContent'), draft)
  await reopen()
  await waitFor(() => evaluate(`return root.querySelectorAll('[data-user-message]').length === ${userMessages}`))
  console.log('VSCODE_DRAFT_RETURN_OK')
}
