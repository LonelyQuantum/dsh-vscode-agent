/** Fake credentials enter only native password controls; model requests use a loopback fixture. */
import { strict as assert } from 'node:assert'
import { glob, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Configure an empty shared home through the product command and complete a Webview turn.
 * @param tools Isolated editor, local mock provider and test-owned home.
 * @returns Completion after native setup, durable transcript and key rotation agree.
 */
export async function runOnboardingCheck({ browser, root, evaluate, request, waitFor, readIfPresent, endpoint, provider, home }) {
  const page = await waitFor(() => browser.contexts()[0].pages().find(page => page.url().includes('workbench')))
  const widget = page.locator('.quick-input-widget:visible')
  const pick = async (title, label) => {
    await waitFor(async () => await widget.count() === 1 && (await widget.innerText()).includes(title))
    await widget.locator('.monaco-list-row').filter({ hasText: label }).first().click()
  }
  const input = async (title, value, password = false) => {
    await waitFor(async () => await widget.count() === 1 && (await widget.innerText()).includes(title))
    const field = widget.locator('input').first()
    assert.equal(await field.getAttribute('type'), password ? 'password' : 'text')
    await field.fill(value)
    await field.press('Enter')
  }
  const key = 'fixture-only-editor-key'
  const configure = async (value, rotating) => {
    await unlink(join(root, 'configured')).catch(error => { if (error.code !== 'ENOENT') throw error })
    await writeFile(join(root, 'configure'), 'requested')
    await pick('API configuration source', 'Configure a shared provider')
    await pick('Shared provider', 'DeepSeek')
    await input('API endpoint', endpoint)
    await input(rotating ? 'New API key' : 'API key', value, true)
    await pick('Model for new conversations', 'Enter a custom model ID')
    await input('Custom model ID', 'native-editor-fixture')
    await pick('Save shared provider settings?', 'Save')
    await page.getByRole('button', { name: 'Reconnect DSH', exact: true }).click()
    await waitFor(() => readIfPresent(join(root, 'configured')))
    await waitFor(() => evaluate('return !!root?.querySelector("[data-composer-input]") && !!doc.defaultView.__DSH_VSCODE__?.lastSession()'))
  }
  await configure(key, false)
  assert.equal(provider.requests.length, 0, 'Saving settings must not test a model endpoint')
  const credentials = await readFile(join(home, '.credentials.yaml'), 'utf8')
  assert.ok(credentials.includes(key))
  const patch = await readFile(join(home, 'profiles/desktop/cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('native-editor-fixture'))
  assert.ok(patch.includes(endpoint))
  assert.equal(patch.includes(key), false)
  const body = await evaluate('return { html: doc.documentElement.outerHTML, state: doc.defaultView.__DSH_VSCODE__?.lastSession() }')
  assert.equal(JSON.stringify(body).includes(key), false)
  await writeFile(join(root, 'reload'), 'requested')
  await waitFor(() => readIfPresent(join(root, 'reloaded')))
  await waitFor(() => evaluate('return !!root?.querySelector("[data-composer-input]")'))
  const send = async marker => {
    await evaluate('root.querySelector("[data-composer-input]").focus()')
    await request('Input.insertText', { text: marker })
    await request('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await request('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await waitFor(() => evaluate('return root.innerText.includes("NATIVE_ONBOARDING_DONE") && !root.querySelector("[data-streaming=true]")'))
  }
  await send('Native onboarding first turn')
  assert.equal(provider.requests.at(-1)?.headers['x-api-key'], key)
  await configure('fixture-only-editor-rotated-key', true)
  const count = provider.requests.length
  await send('Native onboarding rotated turn')
  await waitFor(() => provider.requests.length > count)
  assert.equal(provider.requests.at(-1)?.headers['x-api-key'], 'fixture-only-editor-rotated-key')
  const { readSessionLog } = await import('../lib/session-log.mjs')
  let submitted = 0
  for await (const file of glob('sessions/**/*.jsonl.zstd', { cwd: home })) {
    const events = await readSessionLog(join(home, file))
    assert.equal(JSON.stringify(events).includes(key), false)
    assert.equal(JSON.stringify(events).includes('fixture-only-editor-rotated-key'), false)
    submitted += events.filter(row => row.type === 'user/message' && JSON.stringify(row.data).includes('Native onboarding')).length
  }
  assert.equal(submitted, 2)
  console.log('VSCODE_NATIVE_SHARED_ONBOARDING_OK')
}
