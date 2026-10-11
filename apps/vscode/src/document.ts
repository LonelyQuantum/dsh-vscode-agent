/** Restrictive Webview document around the exact built DSH Web entry. */
import { randomBytes } from 'node:crypto'

/**
 * Render offline recovery controls with fixed actions, never command URIs or process output.
 * @param message Localized plain text.
 * @param actions Fixed recovery actions and locale-owned labels.
 * @returns Escaped document with a nonced action sender only when controls exist.
 */
export function statusDocument(message: string,
  actions: readonly { action: 'restart' | 'configure' | 'home' | 'node'; label: string }[] = [],
): string {
  const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const nonce = randomBytes(24).toString('hex')
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';`
  const controls = actions.map(({ action, label }) =>
    `<button type="button" data-action="${action}">${escape(label)}</button>`).join('')
  const script = 'const api=acquireVsCodeApi();document.addEventListener("click",event=>{'
    + 'const action=event.target?.dataset?.action;if(action)api.postMessage({channel:"dsh-status",action});});'
  return `<html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head>`
    + `<body><p>${escape(message)}</p>${controls}`
    + (actions.length ? `<script nonce="${nonce}">${script}</script>` : '') + '</body></html>'
}

/**
 * Convert built local assets and install the carrier before the Web entry.
 * @param html Built Web index.
 * @param uri Local resource mapper.
 * @param cspSource VS Code resource authority.
 * @param nonce Per-document script nonce.
 * @returns Webview HTML.
 */
export function webviewDocument(html: string, uri: (path: string) => string, cspSource: string, nonce: string): string {
  const escaped = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const rewritten = html.replace(/\b(src|href)="\.\/([^"<>]+)"/g, (_match, attribute: string, path: string) => {
    if (path.split('/').some(part => part === '..') || path.includes('\\')) throw new Error('Invalid built Web asset path')
    return `${attribute}="${escaped(uri('web/' + path))}"`
  }).replace(/<script\b/g, `<script nonce="${escaped(nonce)}"`)
  const csp = `default-src 'none'; script-src ${cspSource} 'nonce-${nonce}'; `
    + `style-src ${cspSource} 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; `
    + `img-src ${cspSource} data: blob:; font-src ${cspSource} data:; connect-src ${cspSource}; worker-src blob:; `
    + 'base-uri \'none\'; form-action \'none\'; frame-src \'none\'; object-src \'none\';'
  return rewritten.replace('<head>', '<head>'
    + `<meta http-equiv="Content-Security-Policy" content="${escaped(csp)}">`
    + `<link rel="stylesheet" href="${escaped(uri('resources/editor.css'))}">`
    + `<script nonce="${escaped(nonce)}" src="${escaped(uri('carrier/bridge.js'))}"></script>`)
}
