/** Session migration and live interaction qualification inside a test-owned VS Code profile. */
import { strict as assert } from 'node:assert'
import { glob, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { compressZstdFrame, generationLogPath, readSessionLog } from '../lib/session-log.mjs'

/**
 * Exercise one compatibility path through the real Webview and its isolated runtime.
 * @param harness Test-owned paths, CDP operations, and bounded readiness helpers.
 * @returns Completion after UI, durable events, and owned files agree.
 */
export async function runCompatibilityCheck({ root, workspace, evaluate, request, waitFor, readIfPresent, presetFile, selected }) {
  let phase = 'initialize'
  const ready = () => waitFor(() => evaluate(`return !!doc.defaultView.__DSH_VSCODE__.lastSession()
    && root.querySelector('[data-composer-input]')?.getAttribute('contenteditable') === 'true'`))
  const rpc = async (method, args) => {
    const result = await evaluate(`return (async () => {
      const method = ${JSON.stringify(method)};
      const response = await doc.defaultView.fetch('/api/' + method, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request',
          rpcId: crypto.randomUUID(), method, payload: { args: ${JSON.stringify(args)} } }) });
      return (await response.json()).result;
    })()`)
    assert.equal(result.ok, true, `${method} failed: ${result.error?.message ?? result.error?.code ?? 'no diagnostic'}`)
    return result.value
  }
  const click = text => evaluate(`const button = [...doc.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)});
    if (!button) throw new Error('Required test control absent'); button.click()`)
  const key = async key => {
    const code = key === 'Enter' ? 13 : 27
    await request('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code })
    await request('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code })
  }
  const send = async text => {
    await waitFor(() => evaluate('return root?.querySelector("[data-composer-input]")?.getAttribute("contenteditable") === "true"'))
    await evaluate('root.querySelector("[data-composer-input]").focus()')
    await request('Input.insertText', { text })
    await key('Enter')
    await waitFor(() => evaluate(`return [...root.querySelectorAll('[data-user-message]')].some(node => node.textContent.includes(${JSON.stringify(text)}))`))
  }
  const completed = async marker => waitFor(() => evaluate(`return root.innerText.split(${JSON.stringify(marker)}).length >= 3
    && !root.querySelector('[data-streaming="true"]')
    && ![...root.querySelectorAll('button')].some(button => /Stop generat/.test(button.getAttribute('aria-label') ?? ''))`), 120_000)
  const restart = async selectedSession => {
    const previous = selectedSession ?? await evaluate('return doc.defaultView.__DSH_VSCODE__?.lastSession()')
    await rm(join(root, 'reloaded'), { force: true })
    await writeFile(join(root, 'reload'), 'requested')
    await waitFor(() => readIfPresent(join(root, 'reloaded')))
    await ready()
    const reopened = await evaluate(`const row = [...root.querySelectorAll('nav button[data-session-id]')]
      .find(button => button.dataset.sessionId === ${JSON.stringify(previous)}); row?.click(); return !!row`)
    if (reopened) {
      await waitFor(() => evaluate(`return doc.defaultView.__DSH_VSCODE__.lastSession() === ${JSON.stringify(previous)}`))
      await ready()
    }
  }
  const profiles = await Array.fromAsync(glob('**/homes/*/profiles/vscode/package.json', { cwd: root }))
  assert.equal(profiles.length, 1)
  const home = dirname(dirname(dirname(join(root, profiles[0]))))
  const currentEvents = async () => {
    const id = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
    const logs = await Array.fromAsync(glob(`sessions/*/${id}/session.v4.jsonl*`, { cwd: home }))
    assert.equal(logs.length, 1, 'Expected one current Session generation')
    return readSessionLog(join(home, logs[0]))
  }
  try {
    await ready()
    if (selected === 'migration') {
      phase = 'seed immutable V3 history'
      const id = 'vscode-legacy-qualification'
      const source = generationLogPath(join(home, 'sessions'), workspace, id, 3, 'zstd')
      const createdAt = Date.now()
      const header = { type: 'session', version: 3, id, cwd: workspace, createdAt, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
      const rows = [
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'step/start', data: { turn: 1, step: 1 } },
        { type: 'system/message', surfaceOp: 'append', data: { turn: 1, step: 1,
          message: { id: 'legacy-system', role: 'system', source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
            content: [{ type: 'text', text: 'Remember the user-provided project facts.' }] } } },
        { type: 'user/message', surfaceOp: 'append', data: { id: 'legacy-input', role: 'user', source: { kind: 'user' },
          content: [{ type: 'text', text: 'Remember the exact project code LEGACY_CONTEXT_42 for my next question.' }] } },
        { type: 'session/title', data: { title: 'V3 migration qualification', source: { kind: 'fallback' }, messageSeqs: [3] } },
        { type: 'step/end', data: { turn: 1, step: 1 } },
        { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ].map((row, seq) => ({ ...row, seq, time: createdAt + seq }))
      // The catalog reads a single-line header frame without decompressing event frames.
      const bytes = Buffer.concat([await compressZstdFrame(JSON.stringify(header) + '\n'),
        await compressZstdFrame(rows.map(row => JSON.stringify(row) + '\n').join(''))])
      await mkdir(dirname(source), { recursive: true })
      await writeFile(source, bytes, { flag: 'wx' })
      const before = await stat(source, { bigint: true })
      await restart()
      phase = 'list V3 without publishing V4'
      assert.ok((await rpc('session/list', { _request: {} })).items.some(row => row.sessionId === id))
      assert.deepEqual(await readdir(dirname(source)), ['session.v3.jsonl.zstd'])
      phase = 'activate historical Session through the bridge'
      const { workspace: current } = await rpc('workspace/create', { request: { path: workspace } })
      await rpc('session/create', { request: { sessionId: id, workspaceId: current.workspaceId } })
      await waitFor(() => evaluate('return [...root.querySelectorAll("nav button")].some(button => button.textContent === "V3 migration qualification")'))
      await click('V3 migration qualification')
      await waitFor(() => evaluate('return root.innerText.includes("LEGACY_CONTEXT_42")'))
      phase = 'continue migrated history with the real model'
      await send('What exact project code did I ask you to remember? Reply with that code followed by MIGRATION_DONE. Do not call tools.')
      await completed('MIGRATION_DONE')
      const events = await currentEvents()
      assert.equal(events.filter(event => event.type === 'user/message' && event.data.id === 'legacy-input').length, 1)
      assert.ok(events.some(event => event.type === 'assistant/message' && JSON.stringify(event.data).includes('LEGACY_CONTEXT_42')))
      phase = 'reopen V4 without rewriting V3'
      await restart()
      await waitFor(() => evaluate('return root.innerText.includes("MIGRATION_DONE")'))
      assert.deepEqual(await readFile(source), bytes)
      const after = await stat(source, { bigint: true })
      assert.equal(after.ino, before.ino)
      assert.equal(after.mtimeNs, before.mtimeNs)
      assert.equal((await readdir(dirname(source))).filter(name => name.startsWith('session.v4.')).length, 1)
    } else if (selected === 'auto-review') {
      phase = 'enable optional Auto review only in the isolated profile'
      const changed = await rpc('pluginManager/setBundleEnabled', { name: '@deepseek-ai/dsh-experimental-auto-review', enabled: true })
      assert.equal(changed.application, 'applied', `${changed.error?.code ?? 'Bundle activation failed'}: ${changed.error?.diagnostic ?? 'no diagnostic'}`)
      phase = 'select Auto review and acknowledge its risk dialog'
      await waitFor(() => evaluate(`return !!root?.querySelector('[aria-label^="Access mode"]')`))
      await evaluate(`root.querySelector('[aria-label^="Access mode"]').click()`)
      phase = 'find experimental option in the permission picker'
      await waitFor(() => evaluate('return [...doc.querySelectorAll("[role=menuitem]")].some(node => node.textContent.includes("Auto review"))'))
      await evaluate('[...doc.querySelectorAll("[role=menuitem]")].find(node => node.textContent.includes("Auto review")).click()')
      phase = 'acknowledge experimental risk'
      await waitFor(() => evaluate('return !!doc.querySelector("[role=dialog]")'))
      await evaluate('const dialog = doc.querySelector("[role=dialog]"); dialog.querySelector("input[type=checkbox], [role=checkbox]").click()')
      await click('Enable Auto review')
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]').getAttribute('aria-label').includes('Auto review')`))
      phase = 'review and execute a project-local write'
      await send('Create auto-reviewed.txt containing exactly AUTO_REVIEW_ALLOWED and a newline using a file-writing tool, not shell or run_code. Then reply AUTO_REVIEW_DONE.')
      await completed('AUTO_REVIEW_DONE')
      assert.equal(await readFile(join(workspace, 'auto-reviewed.txt'), 'utf8'), 'AUTO_REVIEW_ALLOWED\n')
      assert.equal(await evaluate('return root.querySelectorAll("[data-approval-key]").length'), 0)
      const events = await currentEvents()
      assert.ok(events.some(event => event.type === 'permission/preset' && event.data.preset === 'auto'))
      assert.ok(events.some(event => event.type === 'tool/result' && event.data.error === undefined))
      const expectedSession = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
      phase = 'restore Auto review after a process crash without plugin unload'
      await writeFile(join(root, 'crash'), 'requested')
      await waitFor(() => readIfPresent(join(root, 'crashed')))
      await restart(expectedSession)
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), expectedSession, 'The reviewed Session must reopen from the list after restart')
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Auto review')`))
      phase = 'preserve Auto review during a graceful runtime restart'
      await restart()
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), expectedSession)
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Auto review')`))
      assert.equal((await currentEvents()).filter(event => event.type === 'permission/preset').at(-1)?.data.preset, 'auto')
      phase = 'fall back to Read Only when Auto review unloads'
      const disabled = await rpc('pluginManager/setBundleEnabled', { name: '@deepseek-ai/dsh-experimental-auto-review', enabled: false })
      assert.equal(disabled.application, 'applied')
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Read Only')`))
      await waitFor(async () => (await currentEvents()).filter(event => event.type === 'permission/preset').at(-1)?.data.preset === 'read-only')
      phase = 'require human approval for a write after reviewer removal'
      await send('Create unreviewed.txt containing UNREVIEWED using a file-writing tool, not shell or run_code. If approval is denied, do not retry or use another tool. Then reply AUTO_FALLBACK_DONE.')
      await waitFor(() => evaluate('return !!root.querySelector("[data-approval-key]")'), 90_000)
      assert.equal(await readIfPresent(join(workspace, 'unreviewed.txt')), undefined)
      await evaluate(`const card = root.querySelector('[data-approval-key]');
        const reject = [...card.querySelectorAll('button')].find(button => /Reject/.test(button.textContent));
        if (!reject) throw new Error('Approval rejection control is missing'); reject.click()`)
      await completed('AUTO_FALLBACK_DONE')
      assert.equal(await readIfPresent(join(workspace, 'unreviewed.txt')), undefined)
      await restart()
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), expectedSession)
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Read Only')`))
    } else {
      phase = 'finish the initial Session before changing its preset'
      await send('Reply only PRESET_SETUP_DONE. Do not call tools.')
      await completed('PRESET_SETUP_DONE')
      phase = 'configure automatic compaction in the isolated profile'
      const patch = join(home, 'profiles/vscode/cordis.patch.yml')
      const original = await readFile(patch, 'utf8')
      const preset = await readFile(presetFile, 'utf8')
      const start = preset.indexOf('    - id: preset-standard\n')
      assert.ok(start >= 0, 'Standard preset declaration was not found')
      const override = preset.slice(start).split('\n').map(line => line.startsWith('    ') ? line.slice(4) : line).join('\n')
      const target = "            name: '@deepseek-ai/dsh-compaction-basic'\n"
      assert.equal(override.split(target).length, 2, 'Expected one preset-local compaction backend')
      await writeFile(patch, original.replace(/^\[\]\s*$/m, '') + '\n' + override.replace(target, target + '            config:\n'
        + '              thresholdRatio: 0.005\n              retainTokens: 1\n              headroomTokens: 1024\n              maxTokens: 8192\n              auto: true\n'))
      await restart()
      const previous = await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()')
      await evaluate(`root.querySelector('[aria-label="Back to conversations"]').click()`)
      await waitFor(() => evaluate(`return !!doc.defaultView.__DSH_VSCODE__.lastSession()
        && doc.defaultView.__DSH_VSCODE__.lastSession() !== ${JSON.stringify(previous)}`))
      const scratch = 'Disposable scratch: blue triangles repeat; these words contain no lasting task facts. '.repeat(1600)
      phase = 'create compactable history through the composer'
      await send('Remember the project code COMPACT_CONTEXT_73. The following scratch can be discarded after reading.\n' + scratch + '\nReply only COMPACTION_STORED. Do not call tools.')
      await completed('COMPACTION_STORED')
      phase = 'trigger pressure compaction without a compact command'
      await send('What is the project code I asked you to remember? Reply with that code followed by COMPACTION_DONE. Do not call tools.')
      await completed('COMPACTION_DONE')
      const events = await currentEvents()
      const starts = events.filter(event => event.type === 'compaction/start')
      const ends = events.filter(event => event.type === 'compaction/end')
      const summaries = events.filter(event => event.type === 'compaction/summary')
      assert.ok(starts.length > 0, 'Automatic compaction did not start')
      assert.equal(ends.length, starts.length)
      assert.ok(summaries.length > 0, 'Automatic compaction produced no summary')
      assert.ok(starts.every(event => event.data.sourceCommandId === undefined))
      assert.ok(summaries.some(event => event.data.shadowedSeqs.length > 0))
      assert.ok(events.some(event => event.type === 'user/message' && typeof event.surfaceOp === 'object'))
      assert.ok(events.some(event => event.type === 'assistant/message' && JSON.stringify(event.data).includes('COMPACT_CONTEXT_73')))
      phase = 'restore compacted history'
      await restart()
      await waitFor(() => evaluate('return root.innerText.includes("COMPACTION_DONE")'))
      assert.equal((await currentEvents()).filter(event => event.type === 'compaction/summary').length, summaries.length)
    }
    console.log('VSCODE_COMPAT_RESULT ' + JSON.stringify({ name: selected, passed: true }))
  } catch (error) {
    console.log('VSCODE_COMPAT_RESULT ' + JSON.stringify({ name: selected, passed: false, phase, error: error.message }))
    throw error
  }
}
