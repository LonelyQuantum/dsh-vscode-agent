/** Actual VS Code smoke: requires a built extension and an isolated trusted test workspace. */
import * as vscode from 'vscode'
import { strict as assert } from 'node:assert'
import type { PreviewDiagnostics } from '../src/extension.ts'

/** Exercise Webview boot, native stream forwarding and shutdown in a real Extension Host. @returns Completion after the runtime stops. */
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<{ diagnostics(): PreviewDiagnostics }>('dsh-local.dsh-vscode-agent')
  assert.ok(extension)
  const api = await extension.activate()
  try {
    await vscode.commands.executeCommand('dsh.open')
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(poll)
        reject(new Error(`Webview did not connect: ${JSON.stringify(api.diagnostics())}`))
      }, 60_000)
      const poll = setInterval(() => {
        const state = api.diagnostics()
        if (state.clientFailure || (state.boot && state.assets > 0 && state.rpc > 0 && state.socket)) {
          clearInterval(poll)
          clearTimeout(timeout)
          if (state.clientFailure) reject(new Error(`Webview failed: ${JSON.stringify(state)}`))
          else resolve()
        }
      }, 100)
    })
    console.log('VSCODE_WEBVIEW_SMOKE_OK ' + JSON.stringify(api.diagnostics()))
  } finally {
    const pid = api.diagnostics().pid
    await vscode.commands.executeCommand('dsh.stop')
    if (pid !== undefined) assert.throws(() => process.kill(pid, 0))
  }
}
