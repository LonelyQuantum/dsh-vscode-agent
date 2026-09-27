/** Native editor key dispatch and Webview focus qualification without a model request. */
import { strict as assert } from 'node:assert'

/**
 * Check keyboard routing against the shared composer mounted in a real VS Code Webview.
 * @param harness CDP operations and bounded readiness polling for the test-owned window.
 * @returns Completion after the draft and focus checks pass.
 */
export async function runEditorUxCheck({ evaluate, request, waitFor }) {
  const key = async (key, modifiers = 0, text) => {
    const code = key === 'Enter' ? 13 : 27
    await request('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code,
      modifiers, ...(text === undefined ? {} : { text, unmodifiedText: text }) })
    await request('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, modifiers })
  }
  await waitFor(() => evaluate(`return !!doc.defaultView.__DSH_VSCODE__.lastSession()
    && [...root.querySelectorAll('button')].some(button => button.textContent === 'New conversation' && !button.disabled)
    && root.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true'`))
  await evaluate('root.querySelector("[data-composer-input]").focus()')
  await request('Input.insertText', { text: 'editor draft' })
  const markup = await evaluate('return root.querySelector("[data-composer-input]").innerHTML')
  for (const modifiers of [1, 3, 5, 6, 10, 12]) {
    await key('Enter', modifiers)
    assert.equal(await evaluate('return root.querySelector("[data-composer-input]").innerHTML'), markup)
  }
  await key('Enter', 8, '\r')
  await request('Input.insertText', { text: 'second line' })
  const draft = await evaluate('return root.querySelector("[data-composer-input]").innerText')
  assert.equal(draft, 'editor draft\nsecond line')
  await evaluate(`root.querySelector('[data-composer-input]').dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',
    { key: 'Enter', code: 'Enter', bubbles: true, isComposing: true }))`)
  assert.equal(await evaluate('return root.querySelector("[data-composer-input]").innerText'), draft)
  await evaluate('[...root.querySelectorAll("button")].find(button => button.textContent === "History").click()')
  await waitFor(() => evaluate('return doc.activeElement?.textContent === "Back to conversation"'))
  await key('Escape')
  await waitFor(() => evaluate('return doc.activeElement?.textContent === "History"'))
  assert.equal(await evaluate('return root.querySelector("[data-composer-input]").innerText'), draft)
  assert.equal(await evaluate('return root.querySelectorAll("[data-user-message]").length'), 0)
  await evaluate('[...root.querySelectorAll("button")].find(button => button.textContent === "Attach selection").click()')
  await waitFor(() => evaluate('return root.querySelector("[data-composer-input]") === doc.activeElement'))
  assert.equal(await evaluate('return root.querySelectorAll("[data-composer-chip=editor-context]").length'), 1)
  console.log('VSCODE_EDITOR_UX_OK ' + JSON.stringify({ keyboard: true, historyFocus: true, captureFocus: true, submitted: 0 }))
}
