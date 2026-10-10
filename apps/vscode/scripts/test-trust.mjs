/** Change trust only through the isolated editor's native Workspace Trust controls. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Grant and revoke trust while an independent test extension observes DSH enablement and process exit.
 * @param tools Isolated editor and file-based readiness observations.
 * @returns Completion after the revoked state is acknowledged.
 */
export async function runWorkspaceTrustCheck({ browser, root, waitFor, readIfPresent }) {
  const observed = async (name) => {
    const failure = await readIfPresent(join(root, 'failed'))
    if (failure) throw new Error(failure)
    return readIfPresent(join(root, name))
  }
  const page = await waitFor(() => browser.contexts()[0].pages().find(page => page.url().includes('workbench')))
  await writeFile(join(root, 'phase'), 'granting')
  await page.getByRole('button', { name: 'Trust', exact: true }).click()
  await waitFor(() => observed('granted'), 120_000)
  await writeFile(join(root, 'phase'), 'revoking')
  await page.getByRole('button', { name: "Don't Trust", exact: true }).click()
  await waitFor(() => observed('revoked'), 120_000)
  console.log('VSCODE_WORKSPACE_TRUST_CYCLE_OK')
}
