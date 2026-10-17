/** Native editor operations required by the installed-extension trust scenario. */
interface TrustPage {
  url(): string
  getByText(text: string, options: { exact: boolean }): { first(): { isVisible(): Promise<boolean> } }
  getByRole(role: 'button', options: { name: string; exact: boolean }): { click(): Promise<void> }
}

/** Isolated editor and lifecycle observations, without provider credential access. */
interface TrustTools {
  browser: { contexts(): { pages(): TrustPage[] }[] }
  root: string
  waitFor<T>(check: () => T | Promise<T>, timeout?: number): Promise<T>
  readIfPresent(path: string): Promise<string | undefined>
  heldDesktop?: { control(action: 'inspect-update'): Promise<unknown>; ready: { pid: number } }
}

/**
 * Observe installed extension discovery before granting and revoking native Workspace Trust.
 * @param tools Test-owned editor, readiness waits and optional independent Desktop lease.
 * @returns Completion after revocation is acknowledged without terminating the other lease.
 */
export function runWorkspaceTrustCheck(tools: TrustTools): Promise<void>
