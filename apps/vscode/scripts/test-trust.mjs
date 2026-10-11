/** Change trust only through the isolated editor's native Workspace Trust controls. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Grant and revoke trust while an independent test extension observes DSH enablement and process exit.
 * @param tools Isolated editor and file-based readiness observations.
 * @returns Completion after the revoked state is acknowledged.
 */
export async function runWorkspaceTrustCheck({ browser, root, waitFor, readIfPresent, heldDesktop }) {
  const observed = async (name) => {
    const failure = await readIfPresent(join(root, 'failed'))
    if (failure) throw new Error(failure)
    return readIfPresent(join(root, name))
  }
  const page = await waitFor(() => browser.contexts()[0].pages().find(page => page.url().includes('workbench')))
  if (heldDesktop && await heldDesktop.control('inspect-update')) throw new Error('Restricted Mode acquired an editor lease')
  await writeFile(join(root, 'phase'), 'granting')
  await page.getByRole('button', { name: 'Trust', exact: true }).click()
  await waitFor(() => observed('granted'), 120_000)
  if (heldDesktop && !await heldDesktop.control('inspect-update')) throw new Error('Trusted DSH did not acquire an editor lease')
  await writeFile(join(root, 'phase'), 'revoking')
  await page.getByRole('button', { name: "Don't Trust", exact: true }).click()
  await waitFor(() => observed('revoked'), 120_000)
  if (heldDesktop) {
    process.kill(heldDesktop.ready.pid, 0)
    if (await heldDesktop.control('inspect-update')) throw new Error('Revocation did not release the editor lease')
  }
  console.log('VSCODE_WORKSPACE_TRUST_CYCLE_OK')
}
