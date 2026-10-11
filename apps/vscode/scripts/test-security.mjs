/** Keyless CSP checks executed inside the real Webview; no external service is contacted. */
import { strict as assert } from 'node:assert'
import { createServer } from 'node:http'

/**
 * Exercise browser enforcement and VS Code local-resource admission.
 * @param tools Owned Webview driver and bounded observation helper.
 * @returns Completion after attempted requests and the private listener settle.
 */
export async function runSecurityCheck({ evaluate, waitFor }) {
  let requests = 0
  const server = createServer((_request, response) => { requests++; response.end('not-admitted') })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    const address = server.address()
    const origin = `http://127.0.0.1:${address.port}`
    await evaluate(`
      const win = doc.defaultView;
      win.__cspProbe = { violations: [], executed: false, fetchBlocked: false, evalBlocked: false, functionBlocked: false, blobExecuted: false };
      doc.addEventListener('securitypolicyviolation', event => win.__cspProbe.violations.push(event.effectiveDirective));
      const script = doc.createElement('script');
      script.textContent = 'window.__cspProbe.executed = true';
      doc.head.append(script);
      try { win.eval('window.__cspProbe.executed = true'); } catch { win.__cspProbe.evalBlocked = true; }
      try { new win.Function('window.__cspProbe.executed = true')(); } catch { win.__cspProbe.functionBlocked = true; }
      const blob = win.URL.createObjectURL(new win.Blob(['window.__cspProbe.blobExecuted = true'], { type: 'text/javascript' }));
      const blobScript = doc.createElement('script'); blobScript.src = blob;
      blobScript.onload = blobScript.onerror = () => { win.URL.revokeObjectURL(blob); blobScript.remove(); };
      doc.head.append(blobScript);
      const style = doc.createElement('style'); style.textContent = ':root { --csp-untrusted-style: rejected; }'; doc.head.append(style);
      const base = doc.createElement('base'); base.href = ${JSON.stringify(origin + '/')}; doc.head.append(base);
      const image = doc.createElement('img'); image.src = ${JSON.stringify(origin + '/image')}; doc.body.append(image);
      const object = doc.createElement('object'); object.data = ${JSON.stringify(origin + '/object')}; doc.body.append(object);
      return win.fetch(${JSON.stringify(origin + '/fetch')}).then(() => {}, () => { win.__cspProbe.fetchBlocked = true });
    `)
    const required = ['script-src', 'script-src-elem', 'style-src-elem', 'base-uri', 'img-src', 'object-src', 'connect-src']
    await waitFor(() => evaluate(`return ${JSON.stringify(required)}.every(value => doc.defaultView.__cspProbe.violations.includes(value))`))
    const result = await evaluate('return doc.defaultView.__cspProbe')
    assert.equal(result.executed, false)
    assert.equal(result.fetchBlocked, true)
    assert.equal(result.evalBlocked, true)
    assert.equal(result.functionBlocked, true)
    assert.equal(result.blobExecuted, false)
    const styles = await evaluate(`return { untrusted: doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--csp-untrusted-style'),
      owned: [...doc.querySelectorAll('style[data-plugin-css]')].map(style => ({ plugin: style.dataset.pluginCss, nonce: !!style.nonce, active: !!style.sheet })) }`)
    assert.equal(styles.untrusted, '')
    assert.ok(styles.owned.length > 10, 'Shared UI styles did not mount')
    assert.deepEqual(styles.owned.filter(style => !style.nonce || !style.active), [], 'Shared UI stylesheet lacks its nonce or was blocked')
    assert.equal(requests, 0, 'CSP allowed a request to the external listener')
    const resources = await evaluate(`return (async () => {
      const carrier = doc.querySelector('script[src*="/carrier/bridge.js"]').src;
      const base = carrier.slice(0, carrier.lastIndexOf('/carrier/'));
      const fetchStatus = async path => { try { return (await doc.defaultView.fetch(base + path)).status } catch { return 0 } };
      return { carrier: await fetchStatus('/carrier/bridge.js'), style: await fetchStatus('/resources/editor.css'),
        host: await fetchStatus('/host.mjs'), manifest: await fetchStatus('/package.json'),
        runtime: await fetchStatus('/runtime/node_modules/@deepseek-ai/dsh/package.json') };
    })()`)
    assert.equal(resources.carrier, 200)
    assert.equal(resources.style, 200)
    for (const key of ['host', 'manifest', 'runtime']) assert.notEqual(resources[key], 200, `Webview read private ${key}`)
    console.log('VSCODE_CSP_RESOURCE_ISOLATION_OK')
  } finally {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
