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

it('pins native provider setup and scoped recovery copy without credential values', async () => {
  const actual = Object.fromEntries(['en', 'zh-CN'].map((language) => {
    const copy = extensionCopy(language)
    return [language, { provider: copy.provider, key: copy.sharedKey, endpoint: copy.endpoint, model: copy.model,
      save: copy.saveProvider, saved: copy.sharedSaved, conflict: copy.setupConflict, partial: copy.setupPartial,
      shared: copy.sharedMode, isolated: copy.isolatedMode, node: copy.nodeFailed, home: copy.homeFailed }]
  }))
  await expect(JSON.stringify(actual, null, 2) + '\n').toMatchFileSnapshot('./expected/provider-setup.json')
})
