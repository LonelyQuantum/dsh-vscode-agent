/** Exercise a development extension or an installed VSIX in an isolated VS Code window. */
import { spawn } from 'node:child_process'
import { glob, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import * as yaml from 'js-yaml'

const { positionals: [executable], values } = parseArgs({ allowPositionals: true,
  options: { vsix: { type: 'string' }, 'live-home': { type: 'string' }, interactions: { type: 'boolean' } } })
if (!executable) throw new Error('Pass the absolute VS Code executable path, not its shell wrapper')
if (values.interactions && !values['live-home']) throw new Error('--interactions requires --live-home')
const app = fileURLToPath(new URL('..', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'dsh-vscode-editor-test-'))
const userData = join(root, 'user')
const extensions = join(root, 'extensions')
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
let child
let browser
let completion
const stop = async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolve, reject) => {
      const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      kill.once('error', reject)
      kill.once('close', resolve)
    })
  } else child.kill('SIGKILL')
  await completion
}
async function waitFor(operation, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await operation()
    if (result) return result
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('VS Code exited during UI qualification')
    await delay(100)
  }
  throw new Error('VS Code UI qualification timed out')
}
async function readIfPresent(path) {
  try { return await readFile(path, 'utf8') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
try {
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  let extensionPath = resolve(app, 'lib/extension')
  if (values.vsix) {
    const cliCandidates = [join(dirname(executable), 'resources/app/out/cli.js'),
      ...(await readdir(dirname(executable), { withFileTypes: true })).filter(entry => entry.isDirectory() && /^[a-f0-9]+$/i.test(entry.name))
        .map(entry => join(dirname(executable), entry.name, 'resources/app/out/cli.js'))]
    const cli = await waitFor(async () => {
      for (const candidate of cliCandidates) if (await readIfPresent(candidate)) return candidate
      throw new Error('VS Code CLI entry was not found beside the executable')
    })
    const install = spawn(executable, [cli,
      '--user-data-dir', userData, '--extensions-dir', extensions, '--install-extension', resolve(values.vsix)],
    { env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit' })
    const code = await new Promise((resolve, reject) => { install.once('error', reject); install.once('close', resolve) })
    if (code !== 0) throw new Error('Isolated VSIX installation failed')
    const entry = (await readdir(extensions)).find(name => name.startsWith('dsh-local.dsh-vscode-agent-'))
    if (!entry) throw new Error('Installed extension was not found')
    extensionPath = join(extensions, entry)
  }
  if (values['live-home']) {
    // No credentials or Desktop state are copied into the test workspace, artifact, or results.
    let credential
    try { credential = yaml.load(await readFile(join(resolve(values['live-home']), '.credentials.yaml'), 'utf8'))?.refs?.DEEPSEEK_API_KEY }
    catch { throw new Error('Cannot read the selected Desktop DeepSeek credential') }
    if (typeof credential !== 'string' || !credential) throw new Error('Selected Desktop home has no DeepSeek API key reference')
    environment.DEEPSEEK_API_KEY = credential
    environment.DSH_VSCODE_TEST_UI = root
  }
  child = spawn(executable, [workspace, '--new-window', '--disable-extensions', '--disable-workspace-trust',
    '--skip-welcome', '--skip-release-notes', '--locale=en', '--user-data-dir', userData, '--extensions-dir', extensions,
    ...values['live-home'] ? ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'] : [],
    '--extensionDevelopmentPath=' + extensionPath, '--extensionTestsPath=' + resolve(app, 'lib/extension-host.cjs')],
  { cwd: workspace, stdio: 'inherit', windowsHide: true, env: environment })
  completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; void stop() }, 300_000)
  try {
    if (values['live-home']) {
      await waitFor(() => readIfPresent(join(root, 'ready')), 120_000)
      const devtools = await waitFor(() => readIfPresent(join(userData, 'DevToolsActivePort')))
      const [port, socketPath] = devtools.trim().split('\n')
      browser = await chromium.connectOverCDP(`ws://127.0.0.1:${Number(port)}${socketPath}`)
      const cdp = await browser.newBrowserCDPSession()
      const target = await waitFor(async () => (await cdp.send('Target.getTargets')).targetInfos
        .find(target => target.type === 'iframe' && target.url.startsWith('vscode-webview://')))
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false })
      let sequence = 0
      const request = (method, params) => new Promise((resolve, reject) => {
        const id = ++sequence
        const done = (event) => {
          if (event.sessionId !== sessionId) return
          const message = JSON.parse(event.message)
          if (message.id !== id) return
          clearTimeout(timer)
          cdp.off('Target.receivedMessageFromTarget', done)
          if (message.error) reject(new Error('VS Code test target refused a CDP command'))
          else resolve(message.result)
        }
        const timer = setTimeout(() => { cdp.off('Target.receivedMessageFromTarget', done); reject(new Error('Webview test command timed out')) }, 15_000)
        cdp.on('Target.receivedMessageFromTarget', done)
        void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject)
      })
      const evaluate = async (body) => {
        const result = await request('Runtime.evaluate', { expression: `(() => {
          const doc = document.querySelector('iframe')?.contentDocument ?? document;
          const root = doc.querySelector('[data-vscode-conversation]');
          ${body}
        })()`, returnByValue: true, awaitPromise: true })
        if (result.exceptionDetails) throw new Error('Webview test DOM action failed')
        return result.result.value
      }
      await waitFor(() => evaluate('return !!root'))
      await waitFor(() => evaluate("const button = [...root.querySelectorAll('button')].find(button => /Attach selection|附加选区/.test(button.textContent)); return button && !button.disabled && !!root.querySelector('[data-composer-input]')"))
      await evaluate("[...root.querySelectorAll('button')].find(button => /Attach selection|附加选区/.test(button.textContent)).click()")
      await waitFor(() => evaluate("return !!root.querySelector('[data-composer-chip=\"editor-context\"]')"))
      await evaluate("root.querySelector('[data-composer-input]').focus()")
      const key = async (key, code, windowsVirtualKeyCode) => {
        await request('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode })
        await request('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
      }
      await key('End', 'End', 35)
      await request('Input.insertText', { text: ' Read the attached editor snapshot. Reply with the value of editorOnly, replacing its VSCODE_ prefix with VERIFIED_. Do not call tools.' })
      await key('Enter', 'Enter', 13)
      await waitFor(() => evaluate(`return root.innerText.includes('VERIFIED_UNSAVED_42')
        && ![...root.querySelectorAll('button')].some(button => /Stop generat|停止生成/.test(button.getAttribute('aria-label') ?? ''))`), 120_000)
      let logged = false
      let logsRead = 0
      const { readSessionLog } = await import('../lib/session-log.mjs')
      for await (const path of glob(['**/*.jsonl', '**/*.jsonl.zstd'], { cwd: root })) {
        logsRead++
        const events = await readSessionLog(join(root, path))
        logged ||= events.some(event => event.type === 'user/message' && event.data.content.some(block =>
          block.type === 'text' && block.text.includes('VSCODE_UNSAVED_42') && /"dirty"\s*:\s*true/.test(block.text)))
      }
      if (!logged) throw new Error(`Submitted editor snapshot was not found in the durable Session log (${logsRead} logs read)`)
      console.log('VSCODE_LIVE_CONTEXT_OK: model completed through the real Webview bridge')
      if (values.interactions) {
        const uploaded = await evaluate(`return (async () => {
          const win = doc.defaultView;
          const sessionId = win.__DSH_VSCODE__.lastSession();
          const response = await win.fetch('/api/session/uploadFileBinary?' + new URLSearchParams({ sessionId, name: 'bridge-bytes.bin' }),
            { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array([0, 1, 127, 128, 255]) });
          const receipt = await response.json();
          return response.status === 200 && receipt.ok && receipt.value.file.bytes === 5;
        })()`)
        if (!uploaded) throw new Error('Webview binary upload did not return the expected receipt')
        console.log('VSCODE_BINARY_UPLOAD_OK')
      }
      await evaluate("root.querySelector('[data-composer-input]').focus()")
      await request('Input.insertText', { text: 'Write a very long, detailed explanation of TypeScript generics. Do not call tools.' })
      await key('Enter', 'Enter', 13)
      await waitFor(() => evaluate("return [...root.querySelectorAll('button')].some(button => /Stop generat|停止生成/.test(button.getAttribute('aria-label') ?? ''))"))
      if (values.interactions) {
        await evaluate("root.querySelector('[data-composer-input]').focus()")
        await request('Input.insertText', { text: 'Instead, finish with QUEUE_STEER_ACCEPTED.' })
        await key('Enter', 'Enter', 13)
        await waitFor(() => evaluate("return !!root.querySelector('[data-queue-dock] [aria-label=\"Steer queued message\"]:not(:disabled)')"))
        await evaluate("root.querySelector('[data-queue-dock] [aria-label=\"Steer queued message\"]').click()")
        await waitFor(() => evaluate("return !root.querySelector('[data-queue-dock] [aria-label=\"Steer queued message\"]') && root.innerText.includes('QUEUE_STEER_ACCEPTED')"))
        console.log('VSCODE_LIVE_QUEUE_STEER_OK')
      }
      await evaluate("[...root.querySelectorAll('button')].find(button => /Stop generat|停止生成/.test(button.getAttribute('aria-label') ?? '')).click()")
      await waitFor(() => evaluate("return ![...root.querySelectorAll('button')].some(button => /Stop generat|停止生成/.test(button.getAttribute('aria-label') ?? ''))"))
      console.log('VSCODE_LIVE_CANCEL_OK')
      if (values.interactions) {
        await evaluate("root.querySelector('[aria-label^=\"Access mode\"]').click()")
        await waitFor(() => evaluate("return [...doc.querySelectorAll('[role=menuitem]')].some(item => item.textContent.includes('Read Only'))"))
        await evaluate("[...doc.querySelectorAll('[role=menuitem]')].find(item => item.textContent.includes('Read Only')).click()")
        await evaluate("root.querySelector('[data-composer-input]').focus()")
        await request('Input.insertText', { text: 'Use a file-writing tool to create reviewed.txt with exactly REVIEWED_FROM_VSCODE and a final newline. Request the necessary approval. Do not run shell commands. After writing, reply EDIT_DONE.' })
        await key('Enter', 'Enter', 13)
        await waitFor(() => evaluate("return !!root.querySelector('[data-approval-key]')"), 90_000)
        await evaluate("[...root.querySelector('[data-approval-key]').querySelectorAll('button')].find(button => /Allow once|允许一次/.test(button.textContent)).click()")
        await waitFor(async () => (await readIfPresent(join(workspace, 'reviewed.txt'))) === 'REVIEWED_FROM_VSCODE\n', 90_000)
        await waitFor(() => evaluate("return !!root.querySelector('[data-changed-files]') && ![...root.querySelectorAll('button')].some(button => /Stop generat|停止生成/.test(button.getAttribute('aria-label') ?? ''))"))
        await evaluate("[...root.querySelector('[data-changed-files]').querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? '').includes('reviewed.txt')).click()")
        await waitFor(() => readIfPresent(join(root, 'review-ok')))
        console.log('VSCODE_LIVE_APPROVAL_DIFF_OK')
        const downloaded = await evaluate(`return (async () => {
          const response = await doc.defaultView.fetch('/api/file?' + new URLSearchParams({ path: ${JSON.stringify(join(workspace, 'reviewed.txt'))} }));
          return response.ok && await response.text() === 'REVIEWED_FROM_VSCODE\\n';
        })()`)
        if (!downloaded) throw new Error('Webview file download changed the captured test bytes')
        console.log('VSCODE_FILE_DOWNLOAD_OK')
        await evaluate("root.querySelector('[data-composer-input]').focus()")
        await request('Input.insertText', { text: 'Use ask_user_question to ask which label to use, with exactly two options: Alpha and Beta. Wait for my answer, then reply exactly QUESTION_DONE. Do not call other tools.' })
        await key('Enter', 'Enter', 13)
        await waitFor(() => evaluate("return !!root.querySelector('[data-question-key] [role=radio][aria-label=Alpha]')"), 90_000)
        await evaluate("const option = root.querySelector('[data-question-key] [role=radio][aria-label=Alpha]'); option.focus(); option.click()")
        await key('Enter', 'Enter', 13)
        await waitFor(() => evaluate("return !root.querySelector('[data-question-key]') && root.innerText.split('QUESTION_DONE').length >= 3 && ![...root.querySelectorAll('button')].some(button => /Stop generat|停止生成/.test(button.getAttribute('aria-label') ?? ''))"), 90_000)
        console.log('VSCODE_LIVE_QUESTION_OK')
        await browser.contexts()[0].pages()[0].screenshot({ path: join(app, 'lib/live-interactions.png') })
        const previousMessages = await evaluate("return [...root.querySelectorAll('[data-user-message]')].map(element => element.textContent)")
        await writeFile(join(root, 'reload'), 'requested')
        await waitFor(() => readIfPresent(join(root, 'reloaded')))
        await waitFor(() => evaluate(`return root?.innerText.includes('QUESTION_DONE') && JSON.stringify([...root.querySelectorAll('[data-user-message]')].map(element => element.textContent)) === ${JSON.stringify(JSON.stringify(previousMessages))}`))
        console.log('VSCODE_LIVE_RESUME_OK: prior messages restored once after runtime restart')
      }
      await writeFile(join(root, 'done'), 'passed')
      await browser.close()
      browser = undefined
    }
    const code = await completion
    if (timedOut || code !== 0) throw new Error(`VS Code smoke failed: timeout=${timedOut}, exit=${code}`)
  } finally { clearTimeout(timer) }
} finally {
  await browser?.close()
  await stop()
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
