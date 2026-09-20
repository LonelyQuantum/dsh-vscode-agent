/** Restrictive Webview document around the exact built DSH Web entry. */

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
  // Cordis Loader initializes its expression evaluator in the shared Web bundle; this preview requires eval.
  const csp = `default-src 'none'; script-src ${cspSource} 'nonce-${nonce}' blob: 'unsafe-eval'; `
    + `style-src ${cspSource} 'unsafe-inline'; `
    + `img-src ${cspSource} data: blob:; font-src ${cspSource} data:; connect-src ${cspSource}; worker-src blob:;`
  return rewritten.replace('<head>', '<head>'
    + `<meta http-equiv="Content-Security-Policy" content="${escaped(csp)}">`
    + `<link rel="stylesheet" href="${escaped(uri('resources/editor.css'))}">`
    + `<script nonce="${escaped(nonce)}" src="${escaped(uri('bridge.js'))}"></script>`)
}
