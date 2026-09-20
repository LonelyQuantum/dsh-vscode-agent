/** Live fault probes for an isolated VS Code test window; never use a user's workspace. */
import { strict as assert } from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Exercise the actual Webview and owned runtime with bounded, observable fault injection.
 * @param harness - The isolated workspace, CDP connection, and readiness helpers from test-extension.
 * @returns Per-probe results without credentials or model transcript contents.
 */
export async function runFaultChecks({ root, workspace, evaluate, request, contextId, waitFor, readIfPresent, selected }) {
  const results = []
  let phase = 'startup'
  const check = async (name, operation) => {
    if (selected && !({ plugins: name.startsWith('plugin-'), reconnect: name === 'gateway-reconnect', crash: name === 'tool-runtime-crash' })[selected]) return
    try {
      const detail = await operation()
      results.push({ name, passed: true, detail })
    } catch (error) {
      results.push({ name, passed: false, phase, error: error.message })
    }
    console.log('VSCODE_FAULT_RESULT ' + JSON.stringify(results.at(-1)))
  }
  const key = async (key, code, windowsVirtualKeyCode) => {
    await request('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode })
    await request('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
  }
  const send = async (text) => {
    phase = 'workspace initialization'
    await waitFor(() => evaluate("return [...root.querySelectorAll('button')].some(button => button.textContent === 'New conversation' && !button.disabled)"))
    phase = 'wait for editable composer'
    await waitFor(() => evaluate("return root?.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true'"))
    await evaluate("root.querySelector('[data-composer-input]').focus()")
    phase = 'focus editable composer'
    await waitFor(() => evaluate("return doc.activeElement === root.querySelector('[data-composer-input]')"))
    phase = 'insert draft through keyboard transport'
    await request('Input.insertText', { text })
    await waitFor(() => evaluate(`return root.querySelector('[data-composer-input]').textContent.includes(${JSON.stringify(text)})`))
    phase = 'submit model prompt'
    await key('Enter', 'Enter', 13)
    await waitFor(() => evaluate(`return [...root.querySelectorAll('[data-user-message]')].some(message => message.textContent.includes(${JSON.stringify(text)}))`))
  }
  const settled = () => evaluate("return !!root && ![...root.querySelectorAll('button')].some(button => /Stop generat/.test(button.getAttribute('aria-label') ?? ''))")
  const instances = async (constructor, body) => {
    const prototype = await request('Runtime.evaluate', { contextId, expression: `${constructor}.prototype` })
    const objects = await request('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId })
    try {
      const result = await request('Runtime.callFunctionOn', { objectId: objects.objects.objectId,
        functionDeclaration: `function () { ${body} }`, returnByValue: true })
      if (result.exceptionDetails) throw new Error('Live transport instance inspection failed')
      return result.result.value
    } finally {
      await request('Runtime.releaseObject', { objectId: objects.objects.objectId })
      await request('Runtime.releaseObject', { objectId: prototype.result.objectId })
    }
  }

  await check('plugin-events', async () => {
    phase = 'plugin EventSource connection'
    const live = await instances('EventSource', 'return this.map(source => ({ url: source.url, readyState: source.readyState }))')
    const native = await evaluate(`return new Promise(resolve => {
      let source;
      try { source = new doc.defaultView.EventSource('/plugins/events'); }
      catch (error) { resolve({ error: error.message }); return; }
      const finish = kind => { clearTimeout(timer); const readyState = source.readyState; source.close(); resolve({ kind, readyState }); };
      const timer = setTimeout(() => finish('timeout'), 5000);
      source.addEventListener('open', () => finish('open'), { once: true });
      source.addEventListener('error', () => finish('error'), { once: true });
    })`)
    const result = await evaluate(`return (async () => {
      const response = await doc.defaultView.fetch('/plugins/events');
      const reader = response.body.getReader();
      let received = '';
      try {
        while (!received.includes('"type":"graph"')) {
          const value = await reader.read();
          if (value.done) break;
          received += new TextDecoder().decode(value.value);
        }
        return { status: response.status, graph: received.includes('"type":"graph"') };
      } finally { await reader.cancel(); }
    })()`)
    assert.equal(result.status, 200)
    assert.equal(result.graph, true)
    assert.equal(native.kind, 'open')
    assert.ok(live.some(source => source.url.endsWith('/plugins/events') && source.readyState === 1),
      `Host SSE returns a graph through fetch, but the page's EventSource is not connected: ${JSON.stringify({ live, native })}`)
    return 'The running plugin EventSource is connected and the Host supplies a graph.'
  })

  await check('gateway-reconnect', async () => {
    await send('Reply with the result of 17 + 25, followed by RECONNECT_READY. Do not call tools.')
    phase = 'first model response before disconnect'
    await waitFor(async () => await settled() && await evaluate("return root.innerText.split('RECONNECT_READY').length >= 3"), 90_000)
    const selected = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
    const before = await evaluate("return [...root.querySelectorAll('[data-user-message]')].map(message => message.textContent)")
    await evaluate("root.querySelector('[data-composer-input]').focus()")
    await request('Input.insertText', { text: 'UNSENT_RECONNECT_DRAFT' })
    phase = 'close live Gateway socket'
    assert.equal(await instances('WebSocket', `const open = this.filter(socket => socket.readyState === 1);
      for (const socket of open) socket.close(); return open.length`), 1)
    phase = 'Gateway reconnect'
    await waitFor(async () => await instances('WebSocket', 'return this.filter(socket => socket.readyState === 1).length') === 1)
    assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), selected)
    assert.deepEqual(await evaluate("return [...root.querySelectorAll('[data-user-message]')].map(message => message.textContent)"), before)
    assert.equal(await evaluate("return root.querySelector('[data-composer-input]').textContent"), 'UNSENT_RECONNECT_DRAFT')
    await evaluate("root.querySelector('[data-composer-input]').focus()")
    await request('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await request('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await key('Backspace', 'Backspace', 8)
    await send('Reply exactly RECONNECT_RECOVERED. Do not call tools.')
    phase = 'model response after reconnect'
    await waitFor(async () => await settled() && await evaluate("return root.innerText.split('RECONNECT_RECOVERED').length >= 3"), 90_000)
    return 'One live Gateway socket closed and reconnected; draft, selected Session, messages and the next real-model turn survived.'
  })

  await check('plugin-live-toggle', async () => {
    phase = 'toggle installed plugin through Host RPC'
    const rpc = async (method, args) => {
      const result = await evaluate(`return (async () => {
        const endpoint = 'pluginManager/' + ${JSON.stringify(method)};
        const response = await doc.defaultView.fetch('/api/' + endpoint, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request',
            rpcId: crypto.randomUUID(), method: endpoint, payload: { args: ${JSON.stringify(args)} } }) });
        return (await response.json()).result;
      })()`)
      assert.equal(result.ok, true, `Plugin manager ${method} RPC failed: ${result.error?.code} ${result.error?.message}`)
      return result.value
    }
    const plugin = (await rpc('listPlugins', {})).find(row => row.moduleName === '@deepseek-ai/dsh-client-ui-vscode')
    assert.ok(plugin?.enabled && !plugin.readOnlyReason, 'Isolated VS Code layout plugin is not toggleable')
    const origin = await evaluate('return doc.defaultView.performance.timeOrigin')
    const states = []
    const capture = async () => {
      const row = (await rpc('listPlugins', {})).find(row => row.moduleName === plugin.moduleName)
      states.push({ enabled: row.enabled, layouts: await evaluate('return doc.querySelectorAll("[data-vscode-conversation]").length') })
    }
    await capture()
    try {
      const disabled = await rpc('setPluginEnabled', { id: plugin.entryId, enabled: false })
      assert.equal(disabled.application, 'applied')
      const current = (await rpc('listPlugins', {})).find(row => row.moduleName === plugin.moduleName)
      assert.equal(current.enabled, false)
      phase = 'client receives disabled plugin graph'
      try { await waitFor(() => evaluate('return root === null'), 10_000) }
      catch { throw new Error('Host disabled the VS Code layout plugin, but the Webview kept its mounted UI; dynamic removal was not delivered') }
      await capture()
    } finally {
      const restored = await rpc('setPluginEnabled', { id: plugin.entryId, enabled: true })
      assert.equal(restored.application, 'applied', 'Could not restore the temporary profile plugin')
    }
    await waitFor(() => evaluate('return root !== null'))
    await capture()
    assert.equal(await evaluate('return doc.defaultView.performance.timeOrigin'), origin, 'Plugin reload replaced the Webview')
    assert.deepEqual(states, JSON.parse(await readFile(new URL('../tests/expected/plugin-lifecycle.json', import.meta.url), 'utf8')))
    return 'Host disable/enable removed and remounted the client layout without restarting the Webview.'
  })

  let toolPid
  try {
    await check('tool-runtime-crash', async () => {
      // The file handshake proves the model's shell tool reached the child before the runtime is killed.
      await writeFile(join(workspace, 'tool-probe.mjs'), `import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
appendFileSync('tool-invocations', process.pid + '\\n');
writeFileSync('tool-started.json', JSON.stringify({ pid: process.pid }));
const deadline = Date.now() + 120000;
while (!existsSync('tool-release') && Date.now() < deadline) await delay(100);
if (existsSync('tool-release')) writeFileSync('tool-completed', 'completed');
`)
      await send('Run node tool-probe.mjs in this workspace with your pwsh tool and wait for it to finish. This is a harmless local crash-recovery test; do not edit the script or run it in the background. Afterwards reply TOOL_FINISHED.')
      phase = 'real tool started handshake'
      toolPid = await waitFor(async () => {
        const ready = await readIfPresent(join(workspace, 'tool-started.json'))
        if (ready) return JSON.parse(ready).pid
        await evaluate(`const approval = root?.querySelector('[data-approval-key]');
          const allow = approval && [...approval.querySelectorAll('button')].find(button => /Allow once/.test(button.textContent));
          if (allow && !allow.disabled) allow.click();`)
        return undefined
      }, 90_000)
      assert.ok(Number.isInteger(toolPid) && toolPid > 0)
      process.kill(toolPid, 0)
      const selected = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
      const before = await evaluate("return [...root.querySelectorAll('[data-user-message]')].map(message => message.textContent)")
      phase = 'crash runtime with active tool'
      await writeFile(join(root, 'crash'), 'requested')
      await waitFor(() => readIfPresent(join(root, 'crashed')))
      let childStopped = false
      try { await waitFor(() => { try { process.kill(toolPid, 0); return false } catch { return true } }, 10_000); childStopped = true }
      catch { /* A live child is recorded as a failed cleanup assertion after recovery is exercised. */ }
      phase = 'restore crashed Session'
      await writeFile(join(root, 'reload'), 'requested')
      await waitFor(() => readIfPresent(join(root, 'reloaded')))
      await waitFor(() => evaluate('return !!root?.querySelector("[data-composer-input]")'))
      await waitFor(() => evaluate(`return JSON.stringify([...root.querySelectorAll('[data-user-message]')].map(message => message.textContent)) === ${JSON.stringify(JSON.stringify(before))}`))
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), selected)
      assert.equal(await readIfPresent(join(workspace, 'tool-completed')), undefined)
      await send('The previous runtime crashed deliberately. Do not rerun the previous command or any tools. Reply exactly CRASH_RECOVERED.')
      phase = 'model response after crash recovery'
      await waitFor(async () => await settled() && await evaluate("return root.innerText.split('CRASH_RECOVERED').length >= 3"), 90_000)
      assert.equal((await readIfPresent(join(workspace, 'tool-invocations'))).trim().split('\n').length, 1, 'The interrupted tool was rerun')
      assert.ok(childStopped, 'Runtime crash left the running tool child alive; Session recovery and the next model turn succeeded')
      return 'Killed the runtime during a real shell tool; child exited, Session restored once, no tool replay, and the next model turn completed.'
    })
  } finally {
    // Release only this fixture's child even when an assertion or CDP request fails.
    await writeFile(join(workspace, 'tool-release'), 'released')
    if (toolPid) await waitFor(() => { try { process.kill(toolPid, 0); return false } catch { return true } }, 15_000)
  }
  return results
}
