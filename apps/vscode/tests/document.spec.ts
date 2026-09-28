import { expect, it } from 'vitest'
import { statusDocument, webviewDocument } from '../src/document.ts'

it('denies active content in lifecycle notices and escapes message text', () => {
  const html = statusDocument('<script>unexpected()</script> & notice')
  expect(html).toContain("default-src 'none'")
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;unexpected()&lt;/script&gt; &amp; notice')
})

it('maps static assets and installs a non-inline carrier before the Web entry', () => {
  const html = webviewDocument('<head><script type="module" src="./assets/main.js"></script><link href="./assets/main.css"></head>',
    path => `https://local.example/${path}`, 'https://local.example', 'nonce123')
  expect(html).toContain('src="https://local.example/web/assets/main.js"')
  expect(html).toContain('href="https://local.example/web/assets/main.css"')
  expect(html).toContain('href="https://local.example/resources/editor.css"')
  expect(html.indexOf('/bridge.js')).toBeLessThan(html.indexOf('/web/assets/main.js'))
  expect(html).toContain("default-src 'none'")
  for (const directive of ['base-uri', 'form-action', 'frame-src', 'object-src']) expect(html).toContain(`${directive} 'none'`)
  expect(html).toContain('/carrier/bridge.js')
  expect(html).not.toContain("script-src 'unsafe-inline'")
  expect(html).not.toContain('http://127.0.0.1')
})

it('refuses a built asset that escapes its resource root', () => {
  expect(() => webviewDocument('<head><script src="./../secret.js"></script></head>', String, 'local', 'nonce')).toThrow('asset path')
})
