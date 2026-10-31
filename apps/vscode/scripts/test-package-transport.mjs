/** Exercise the installed carrier with public images and a large, keyless raw upload. */
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** @param tools Isolated Webview evaluator and readiness barrier. */
export async function runPackageTransportCheck({ evaluate, extensionPath }) {
  const run = body => evaluate(`return (async () => { ${body} })()`)
  const bytes = 9 * 1024 * 1024 + 17
  const uploaded = await run(`
    const sessionId = doc.defaultView.__DSH_VSCODE__.lastSession()
    const data = new Uint8Array(${bytes}).fill(37)
    const query = new URLSearchParams({ sessionId, name: 'large-synthetic-upload.bin' })
    const response = await doc.defaultView.__DSH_FILE_UPLOAD__.fetch('/api/session/uploadFileBinary?' + query, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Blob([data])
    })
    return await response.json()
  `)
  assert.equal(uploaded.ok, true, 'The installed raw upload route must accept more than 8 MiB')
  assert.equal(uploaded.value.file.bytes, bytes)
  assert.equal(uploaded.value.file.attachmentId, 'sha256:' + createHash('sha256').update(Buffer.alloc(bytes, 37)).digest('hex'))
  const cancelled = await run(`
    const abort = new AbortController()
    const pending = doc.defaultView.__DSH_FILE_UPLOAD__.fetch('/api/session/uploadFileBinary?sessionId=' +
      encodeURIComponent(doc.defaultView.__DSH_VSCODE__.lastSession()) + '&name=cancelled.bin', {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' },
      body: new Blob([new Uint8Array(12 * 1024 * 1024)]), signal: abort.signal
    }).then(() => 'completed', error => error.name)
    abort.abort()
    return await pending
  `)
  assert.equal(cancelled, 'AbortError')
  const owner = '@deepseek-ai/dsh-client-ui-settings-account'
  const file = (await readdir(join(extensionPath, 'runtime/node_modules', owner, 'lib/assets'))).find(file => file.endsWith('.svg'))
  assert.ok(file, 'The installed package must contain its public artwork')
  const publicImage = await run(`
    const url = doc.defaultView.__DSH_TRANSPORT__.resolveAsset(${JSON.stringify(`plugins/${owner}/assets/${file}`)})
    const image = new doc.defaultView.Image()
    return await new Promise(resolve => { image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = url })
  `)
  assert.equal(publicImage, true, 'An exported image must load under the installed CSP')
  const image = await evaluate(`
    const url = doc.defaultView.__DSH_TRANSPORT__.resolveAsset('plugins/@deepseek-ai/dsh-client-ui-theme/assets/not-exported.svg')
    return url
  `).then(() => false, () => true)
  assert.equal(image, true, 'A missing public export must not become a filesystem URI')
  console.log('VSCODE_PACKAGE_ASSETS_AND_LARGE_UPLOAD_OK')
}
