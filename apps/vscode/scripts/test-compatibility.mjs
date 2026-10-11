/** Session migration and live interaction qualification inside a test-owned VS Code profile. */
import { strict as assert } from 'node:assert'
import { glob, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as yaml from 'js-yaml'
import { compressZstdFrame, generationLogPath, readSessionLog } from '../lib/session-log.mjs'
import { autoRemovalReady, compatibilityEvents } from './compatibility-state.mjs'

/**
 * Exercise one compatibility path through the real Webview and its test-owned runtime.
 * @param harness Test-owned paths, CDP operations, and bounded readiness helpers.
 * @returns Completion after UI, durable events, and owned files agree.
 */
export async function runCompatibilityCheck({ root, workspace, evaluate, request, waitFor, readIfPresent, presetFile, sharedHome, selected }) {
  let phase = 'initialize'
  let reviewedSession
  let removalObservation
  let activationObservation
  let reminderObservation
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
    const openPrevious = () => evaluate(`const row = [...root.querySelectorAll('nav button[data-session-id]')]
      .find(button => button.dataset.sessionId === ${JSON.stringify(previous)}); row?.click(); return !!row`)
    const reopened = selectedSession === undefined ? await openPrevious() : await waitFor(openPrevious)
    if (reopened) {
      await waitFor(() => evaluate(`return doc.defaultView.__DSH_VSCODE__.lastSession() === ${JSON.stringify(previous)}`))
      await ready()
    }
  }
  const profiles = sharedHome ? [] : await Array.fromAsync(glob('**/homes/*/profiles/vscode/package.json', { cwd: root }))
  if (!sharedHome) assert.equal(profiles.length, 1)
  const home = sharedHome ?? dirname(dirname(dirname(join(root, profiles[0]))))
  const configureStandardPlugin = async (name, configuration) => {
    const patch = join(home, sharedHome ? 'profiles/desktop/cordis.patch.yml' : 'profiles/vscode/cordis.patch.yml')
    const original = await readFile(patch, 'utf8')
    const preset = await readFile(presetFile, 'utf8')
    const start = preset.indexOf('    - id: preset-standard\n')
    assert.ok(start >= 0, 'Standard preset declaration was not found')
    const override = preset.slice(start).split('\n').map(line => line.startsWith('    ') ? line.slice(4) : line).join('\n')
    const declarations = override.split('\n').filter(line => line.trim() === `name: '${name}'`)
    assert.equal(declarations.length, 1, 'Expected one preset-local plugin')
    const target = declarations[0] + '\n'
    const indentation = declarations[0].match(/^ */)[0]
    const fields = yaml.dump(configuration).trimEnd().split('\n')
      .map(line => indentation + '  ' + line).join('\n')
    await writeFile(patch, original.replace(/^\[\]\s*$/m, '') + '\n' + override.replace(target, target
      + indentation + 'config:\n' + fields + '\n'))
  }
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
      phase = 'enable optional Auto review only in the test-owned profile'
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
      reviewedSession = expectedSession
      phase = 'restore Auto review after a process crash without plugin unload'
      await writeFile(join(root, 'crash'), 'requested')
      await waitFor(() => readIfPresent(join(root, 'crashed')))
      await restart(expectedSession)
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), expectedSession, 'The reviewed Session must reopen from the list after restart')
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Auto review')`))
      phase = 'preserve Auto review during a graceful runtime restart'
      await restart(expectedSession)
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), expectedSession)
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Auto review')`))
      assert.equal((await currentEvents()).filter(event => event.type === 'permission/preset').at(-1)?.data.preset, 'auto')
      phase = 'wait for the restored Auto Agent before live reviewer removal'
      await waitFor(async () => {
        const row = (await rpc('session/list', { _request: {} })).items.find(item => item.sessionId === expectedSession)
        const sameSession = await evaluate(`return doc.defaultView.__DSH_VSCODE__?.lastSession() === ${JSON.stringify(expectedSession)}`)
        activationObservation = { sameSession, agentAvailable: row?.agentAvailable ?? false,
          running: row?.running ?? false, preset: row?.projections?.values.permissions?.currentValue ?? null }
        return autoRemovalReady(row, sameSession)
      })
      phase = 'fall back to Read Only when Auto review unloads'
      const disabled = await rpc('pluginManager/setBundleEnabled', { name: '@deepseek-ai/dsh-experimental-auto-review', enabled: false })
      assert.equal(disabled.application, 'applied')
      await waitFor(async () => {
        removalObservation = await evaluate(`return { hasRoot: !!root,
          sameSession: doc.defaultView.__DSH_VSCODE__?.lastSession() === ${JSON.stringify(expectedSession)},
          access: root?.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label') ?? null,
          listVisible: !!root?.querySelector('nav') }`)
        return removalObservation.sameSession && removalObservation.access?.includes('Read Only')
      })
      await waitFor(async () => (await currentEvents()).filter(event => event.type === 'permission/preset').at(-1)?.data.preset === 'read-only')
      phase = 'require human approval for a write after reviewer removal'
      const priorApprovals = (await currentEvents()).filter(event => event.type === 'approval/asked').length
      await send('Call write once with file_path "unreviewed.txt", content "UNREVIEWED", sandbox_permissions "workspace-write", and justification "Verify human approval for this temporary test file after Auto review removal." Do not use shell or run_code. If approval is denied, do not retry or use another tool. Then reply AUTO_FALLBACK_DONE.')
      await waitFor(() => evaluate('return !!root.querySelector("[data-approval-key]")'), 90_000)
      await waitFor(async () => (await currentEvents()).filter(event => event.type === 'approval/asked').length === priorApprovals + 1)
      assert.equal(await readIfPresent(join(workspace, 'unreviewed.txt')), undefined)
      await evaluate(`const card = root.querySelector('[data-approval-key]');
        const reject = [...card.querySelectorAll('button')].find(button => /Reject/.test(button.textContent));
        if (!reject) throw new Error('Approval rejection control is missing'); reject.click()`)
      await completed('AUTO_FALLBACK_DONE')
      assert.equal(await readIfPresent(join(workspace, 'unreviewed.txt')), undefined)
      await waitFor(async () => (await currentEvents()).filter(event => event.type === 'approval/decided').at(-1)?.data.outcome === 'rejected')
      await restart(expectedSession)
      assert.equal(await evaluate('return doc.defaultView.__DSH_VSCODE__.lastSession()'), expectedSession)
      await waitFor(() => evaluate(`return root.querySelector('[aria-label^="Access mode"]')?.getAttribute('aria-label').includes('Read Only')`))
    } else if (selected === 'timed-question') {
      phase = 'enable timed questions only in the test-owned standard preset'
      await send('Reply only TIMED_SETUP_DONE. Do not call tools.')
      await completed('TIMED_SETUP_DONE')
      await configureStandardPlugin('@deepseek-ai/dsh-tool-ask-user', { mode: 'timed', timeout: 2 })
      await restart()
      await evaluate(`root.querySelector('[aria-label="Back to conversations"]').click()`)
      await ready()
      phase = 'let an unanswered timed question continue'
      await send('Call ask_user_question with timeout 2 and one question asking which label to use, with exactly two options Alpha and Beta. If it returns pending, reply exactly TIMED_PENDING_DONE and wait. If a later user-question-reply selects Alpha, reply exactly TIMED_LATE_DONE. Do not call any other tool.')
      await completed('TIMED_PENDING_DONE')
      await waitFor(() => evaluate(`return root.querySelector('[data-question-key]')?.innerText.includes('Work continued')`))
      const before = await currentEvents()
      const result = before.find(event => event.type === 'tool/result' && event.data.message.content.some(block => {
        if (block.type !== 'text') return false
        try { return JSON.parse(block.text).pending === true } catch (_error) { return false }
      }))
      assert.ok(result, 'The timed call did not log its pending result')
      phase = 'answer the continued question through the real Webview'
      await evaluate(`const option = root.querySelector('[data-question-key] [role=radio][aria-label=Alpha]');
        if (!option) throw new Error('Timed answer option missing'); option.focus(); option.click()`)
      await key('Enter')
      await completed('TIMED_LATE_DONE')
      const after = await currentEvents()
      const replies = after.filter(event => event.type === 'user/message' && event.data.source.kind === 'user-question-reply')
      assert.equal(replies.length, 1, 'The late reply must enter the inbox once')
      assert.deepEqual(after.find(event => event.type === 'tool/result' && event.seq === result.seq), result)
      phase = 'restore the timed question and late answer without replaying input'
      await restart()
      await waitFor(() => evaluate('return root.innerText.includes("TIMED_LATE_DONE")'))
      assert.equal((await currentEvents()).filter(event => event.type === 'user/message'
        && event.data.source.kind === 'user-question-reply').length, 1)
    } else if (selected === 'reminder') {
      phase = 'enable the optional RC Schedule bundle in the test-owned profile'
      const changed = await rpc('pluginManager/setBundleEnabled', { name: '@deepseek-ai/dsh-experimental-schedule-bundle', enabled: true })
      assert.equal(changed.application, 'applied', 'The optional Schedule bundle did not activate')
      await ready()
      phase = 'create a reminder through the enabled Schedule tools'
      await send('Call schedule_create exactly once with {"title":"Editor reminder","after_seconds":5,"prompt":"Reply exactly REMINDER_DELIVERED. Do not call any tools."}. After successful creation reply only REMINDER_CREATED. Do not repeat the reminder instructions or claim it has run; its due follow-up will arrive as new user input. Do not call any other tool.')
      await completed('REMINDER_CREATED')
      const createdEvents = await currentEvents()
      const calls = createdEvents.filter(event => event.type === 'tool/call' && event.data.name === 'schedule_create')
      assert.equal(calls.length, 1, 'The model must create one actual reminder, not only acknowledge it')
      const result = createdEvents.find(event => event.type === 'tool/result' && event.data.message.toolCallId === calls[0].data.callId)
      assert.ok(result && result.data.error === undefined, 'Reminder creation did not settle successfully')
      const record = JSON.parse(result.data.message.content.find(block => block.type === 'text').text)
      assert.ok(typeof record.title === 'string' && record.title.length > 0, 'The created reminder has no title')
      phase = 'render the created reminder card'
      await waitFor(async () => {
        reminderObservation = await evaluate(`const cards = [...root.querySelectorAll('[data-tool="schedule_create"]:not([data-state])')];
          return { cards: cards.length,
            titleVisible: cards.some(card => card.getBoundingClientRect().height > 0 && card.innerText.includes(${JSON.stringify(record.title)})),
            hasRoot: !!root, listVisible: !!root?.querySelector('nav') }`)
        return reminderObservation.titleVisible
      })
      phase = 'observe the due reminder in the conversation'
      await waitFor(async () => {
        const events = await currentEvents()
        const delivery = events.find(event => event.type === 'user/message' && event.data.source.kind === 'schedule')
        return delivery !== undefined && events.some(event => event.type === 'assistant/message' && event.seq > delivery.seq
          && JSON.stringify(event.data).includes('REMINDER_DELIVERED'))
          && await evaluate(`return root.innerText.includes('REMINDER_DELIVERED') && !root.querySelector('[data-streaming="true"]')`)
      }, 90_000)
      const events = await currentEvents()
      assert.ok(events.some(event => event.type === 'assistant/message' && JSON.stringify(event.data).includes('REMINDER_DELIVERED')))
      const deliveries = events.filter(event => event.type === 'user/message' && event.data.source.kind === 'schedule')
      assert.equal(deliveries.length, 1)
      phase = 'restore the reminder without duplicate delivery'
      await restart()
      await waitFor(() => evaluate('return root.innerText.includes("REMINDER_DELIVERED")'))
      assert.equal((await currentEvents()).filter(event => event.type === 'user/message'
        && event.data.source.kind === 'schedule').length, 1)
    } else {
      phase = 'finish the initial Session before changing its preset'
      await send('Reply only PRESET_SETUP_DONE. Do not call tools.')
      await completed('PRESET_SETUP_DONE')
      phase = 'configure automatic compaction in the test-owned profile'
      await configureStandardPlugin('@deepseek-ai/dsh-compaction-basic',
        { thresholdRatio: 0.005, retainTokens: 1, headroomTokens: 1024, maxTokens: 8192, auto: true })
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
    console.log('VSCODE_COMPAT_RESULT ' + JSON.stringify({ name: selected, passed: true,
      activationObservation, removalObservation }))
  } catch (error) {
    let durablePreset
    let eventCounts
    let sessionState
    if (reviewedSession) {
      const logs = await Array.fromAsync(glob(`sessions/*/${reviewedSession}/session.v4.jsonl*`, { cwd: home }))
      if (logs.length === 1) {
        const events = await readSessionLog(join(home, logs[0]))
        durablePreset = events.filter(event => event.type === 'permission/preset').at(-1)?.data.preset
        eventCounts = compatibilityEvents(events)
      }
      const observeSession = async () => {
        const row = (await rpc('session/list', { _request: {} })).items.find(item => item.sessionId === reviewedSession)
        return { agentAvailable: row?.agentAvailable ?? false, running: row?.running ?? false,
          approvalVisible: await evaluate('return !!root?.querySelector("[data-approval-key]")') }
      }
      try { sessionState = await observeSession() }
      catch (_diagnosticError) { /* The original failure remains authoritative if the backend is unavailable. */ }
    }
    console.log('VSCODE_COMPAT_RESULT ' + JSON.stringify({ name: selected, passed: false, phase,
      error: error.message, activationObservation, removalObservation, durablePreset, eventCounts, sessionState, reminderObservation }))
    throw error
  }
}
