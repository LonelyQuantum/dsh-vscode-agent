/** Startup guidance directs either native client to its shared home without a Desktop prerequisite. */
import { expect, it } from 'vitest'
import { extensionCopy } from '../src/locale.ts'

it('keeps first-run and recovery guidance aligned in both locales', async () => {
  const actual = Object.fromEntries(['en', 'zh-CN'].map((language) => {
    const copy = extensionCopy(language)
    return [language, { folder: copy.desktopFolder, configured: copy.desktopConfigured, failed: copy.desktopFailed }]
  }))
  await expect(JSON.stringify(actual, null, 2) + '\n').toMatchFileSnapshot('./expected/shared-startup.json')
})
