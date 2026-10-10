/** Active-turn qualification through the real Webview; all plugin artifacts belong to the isolated profile. */
import { strict as assert } from 'node:assert'
import { glob, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as yaml from 'js-yaml'

const packageName = '@deepseek-ai/dsh-vscode-hmr-probe'
const marker = '[data-vscode-hmr-probe]'

function bundle(generation) {
  return `window.__ModuleLoader__.load({ id: '${packageName}', factory: () => ({ name: 'vscode-hmr-probe', apply(ctx) {
    ctx.effect(() => {
      const state = window.__dshHmrProbeState ??= { mounts: [], disposals: [] };
      state.mounts.push(${generation});
      const element = document.createElement('span');
      element.hidden = true;
      element.dataset.vscodeHmrProbe = '${generation}';
      document.body.append(element);
      return () => { state.disposals.push(${generation}); element.remove(); };
    });
  } }) });\n`
}

async function replace(path, text) {
  const pending = `${path}.pending`
  await writeFile(pending, text)
  await rename(pending, path)
}

/**
 * Disconnect a streaming Gateway or replace a temporary plugin's client artifact during a model turn.
 * @param harness Isolated test paths, CDP operations, and bounded readiness checks.
 * @returns One result without credentials or model response contents.
 */
export async function runFaultChecks({ root, evaluate, request, contextId, waitFor, selected }) {
  let phase = 'setup'
  let patch
  let originalPatch
  let pluginPath
  let result
  const name = selected === 'streaming' ? 'gateway-streaming-reconnect' : 'plugin-active-rebuild'
  const active = () => evaluate(`return !!root?.querySelector('[data-streaming="true"]')`)
  const rpc = async (method, args) => {
    const result = await evaluate(`return (async () => {
      const method = 'pluginManager/' + ${JSON.stringify(method)};
      const response = await doc.defaultView.fetch('/api/' + method, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request',
          rpcId: crypto.randomUUID(), method, payload: { args: ${JSON.stringify(args)} } }) });
      return (await response.json()).result;
    })()`)
    assert.equal(result.ok, true, `Plugin manager ${method} failed`)
    return result.value
  }
  const instances = async (body) => {
    const prototype = await request('Runtime.evaluate', { contextId, expression: 'WebSocket.prototype' })
    const objects = await request('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId })
    try {
      const result = await request('Runtime.callFunctionOn', { objectId: objects.objects.objectId,
        functionDeclaration: `function () { ${body} }`, returnByValue: true })
      assert.equal(result.exceptionDetails, undefined, 'Gateway inspection failed')
      return result.result.value
    } finally {
      await request('Runtime.releaseObject', { objectId: objects.objects.objectId })
      await request('Runtime.releaseObject', { objectId: prototype.result.objectId })
    }
  }
  try {
    if (selected === 'rebuild') {
      const patches = await Array.fromAsync(glob('**/profiles/vscode/cordis.patch.yml', { cwd: root }))
      assert.equal(patches.length, 1, 'Expected one isolated VS Code profile')
      patch = join(root, patches[0])
      originalPatch = await readFile(patch, 'utf8')
      pluginPath = join(dirname(patch), 'node_modules', ...packageName.split('/'))
      await mkdir(pluginPath, { recursive: true })
      await writeFile(join(pluginPath, 'package.json'), JSON.stringify({ name: packageName, version: '0.0.0',
        type: 'module', exports: { '.': './index.mjs', './client': './client.js', './package.json': './package.json' },
        dsh: { client: { platform: 'web' } },
      }))
      await writeFile(join(pluginPath, 'index.mjs'), 'export function apply() {}\n')
      await writeFile(join(pluginPath, 'client.js'), bundle(1))
      const rows = yaml.load(originalPatch)
      assert.ok(Array.isArray(rows))
      await replace(patch, yaml.dump([...rows, { insert: [{ id: 'vscode-hmr-probe', name: pathToFileURL(join(pluginPath, 'index.mjs')).href }] }]))
      phase = 'mount isolated plugin'
      const layout = (await rpc('listPlugins', {})).find(row => row.moduleName === '@deepseek-ai/dsh-client-ui-vscode')
      assert.ok(layout?.enabled)
      await rpc('setPluginEnabled', { id: layout.entryId, enabled: true })
      const probe = (await rpc('listPlugins', {})).find(row => row.moduleName.endsWith('/dsh-vscode-hmr-probe/index.mjs'))
      assert.equal(probe?.fiberPhase, 'active', 'Isolated plugin Host entry did not activate')
      await waitFor(() => evaluate(`return doc.querySelector(${JSON.stringify(marker)})?.dataset.vscodeHmrProbe === '1'`))
      await evaluate(`const state = doc.defaultView.__dshActiveFault = { rebuilt: [] };
        state.source = new doc.defaultView.EventSource('/plugins/events');
        state.source.addEventListener('message', event => {
          const frame = JSON.parse(event.data);
          if (frame.type === 'rebuilt' && frame.id === ${JSON.stringify(packageName)}) state.rebuilt.push(frame.rev);
        });`)
      await waitFor(() => evaluate('return doc.defaultView.__dshActiveFault.source.readyState === 1'))
    }
    const origin = await evaluate('return doc.defaultView.performance.timeOrigin')
    const prompt = `Explain TypeScript generics in 80 numbered sentences, with one concrete example per sentence. Do not call tools. End with exactly ACTIVE_${selected.toUpperCase()}_DONE.`
    phase = 'submit one model request'
    await waitFor(() => evaluate('return root?.querySelector("[data-composer-input]")?.getAttribute("contenteditable") === "true"'))
    await evaluate('root.querySelector("[data-composer-input]").focus()')
    await request('Input.insertText', { text: prompt })
    await request('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await request('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await waitFor(() => evaluate(`return [...root.querySelectorAll('[data-user-message]')].some(message => message.textContent.includes(${JSON.stringify(prompt)}))`))
    const session = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
    const messages = await evaluate("return [...root.querySelectorAll('[data-user-message]')].map(message => message.textContent)")
    await evaluate('root.querySelector("[data-composer-input]").focus()')
    await request('Input.insertText', { text: 'UNSENT_ACTIVE_FAULT_DRAFT' })
    phase = 'observe real streamed content'
    await waitFor(async () => await active() && await evaluate("return [...root.querySelectorAll('[data-streaming=true]')].some(node => node.textContent.length > 100)"), 90_000)
    if (selected === 'streaming') {
      phase = 'disconnect streaming Gateway'
      assert.equal(await instances(`const open = this.filter(socket => socket.readyState === 1);
        const running = document.querySelector('[data-streaming="true"]');
        if (!running || running.textContent.length <= 100) throw new Error('Stream settled before fault injection');
        for (const socket of open) socket.close(); return open.length;`), 1)
      phase = 'reconnect streaming Gateway'
      await waitFor(async () => await instances('return this.filter(socket => socket.readyState === 1).length') === 1)
    } else {
      phase = 'publish rebuilt plugin during active turn'
      assert.equal(await active(), true)
      await replace(join(pluginPath, 'client.js'), bundle(2))
      await waitFor(() => evaluate(`return doc.querySelector(${JSON.stringify(marker)})?.dataset.vscodeHmrProbe === '2'`))
      assert.equal(await active(), true, 'Turn settled before rebuilt plugin mounted')
      assert.deepEqual(await evaluate('return doc.defaultView.__dshHmrProbeState'), { mounts: [1, 2], disposals: [1] })
      assert.equal(await evaluate(`return doc.querySelectorAll(${JSON.stringify(marker)}).length`), 1)
      assert.equal(await evaluate('return doc.defaultView.__dshActiveFault.rebuilt.length'), 1)
    }
    phase = 'model completion after fault'
    await waitFor(() => evaluate(`return root.innerText.split(${JSON.stringify(`ACTIVE_${selected.toUpperCase()}_DONE`)}).length === 3
      && !root.querySelector('[data-streaming="true"]')`), 120_000)
    assert.equal(await evaluate('return doc.defaultView.performance.timeOrigin'), origin, 'Fault replaced the Webview')
    assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), session)
    assert.deepEqual(await evaluate("return [...root.querySelectorAll('[data-user-message]')].map(message => message.textContent)"), messages)
    assert.equal(await evaluate('return root.querySelector("[data-composer-input]").textContent'), 'UNSENT_ACTIVE_FAULT_DRAFT')
    const { readSessionLog } = await import('../lib/session-log.mjs')
    let receipts = 0
    phase = 'verify one durable user input'
    for await (const file of glob(['**/homes/*/sessions/**/*.jsonl', '**/homes/*/sessions/**/*.jsonl.zstd'], { cwd: root })) {
      const events = await readSessionLog(join(root, file))
      receipts += events.filter(event => event.type === 'user/message'
        && event.data.content.some(block => block.type === 'text' && block.text === prompt)).length
    }
    assert.equal(receipts, 1, 'Active-turn fault duplicated or lost durable input')
    result = { name, passed: true, detail: 'Fault overlapped streamed model content; one durable input, retained draft and Session, model completed without page reload.' }
  } catch (error) {
    const state = await evaluate(`return { streaming: !!root?.querySelector('[data-streaming]'),
      messages: root?.querySelectorAll('[data-user-message]').length,
      plugin: doc.querySelector(${JSON.stringify(marker)})?.dataset.vscodeHmrProbe,
      pluginState: doc.defaultView.__dshHmrProbeState }`)
    result = { name, passed: false, phase, error: error.message, state }
  } finally {
    try {
      await evaluate('doc.defaultView.__dshActiveFault?.source?.close()')
      if (patch !== undefined && originalPatch !== undefined) {
        await replace(patch, originalPatch)
        const layout = (await rpc('listPlugins', {})).find(row => row.moduleName === '@deepseek-ai/dsh-client-ui-vscode')
        await rpc('setPluginEnabled', { id: layout.entryId, enabled: true })
        await waitFor(() => evaluate(`return doc.querySelector(${JSON.stringify(marker)}) === null`))
        if (result?.passed) {
          assert.deepEqual(await evaluate('return doc.defaultView.__dshHmrProbeState'), { mounts: [1, 2], disposals: [1, 2] })
        }
      }
    } catch (error) {
      result = { name, passed: false, phase: 'cleanup', error: error.message, failure: result?.passed ? undefined : result }
    }
  }
  console.log('VSCODE_FAULT_RESULT ' + JSON.stringify(result))
  return [result]
}
