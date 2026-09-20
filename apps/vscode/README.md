# DSH VS Code development preview

English | [中文](README.zh.md)

This source-checkout preview opens a single-column DSH conversation inside the DSH Activity Bar view. It uses the existing DSH Web runtime and Conversation factory for the [VS Code development plan](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.md); it is not an installable release.

## Start the preview

Use one trusted local folder in desktop VS Code 1.100 or newer, plus Node `^22.19.0 || >=24.0.0` on PATH. Build the shared application from the repository root before building this extension:

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run dev:vscode
```

`dev:vscode` builds the extension and opens an Extension Development Host through the `code` command on PATH. In that window, open DSH in the Activity Bar or run `DSH: Open Agent` from the Command Palette. Chinese VS Code displays `DSH: 打开 Agent`. The build output is `apps/vscode/lib/extension/`; after a build, `pnpm.cmd run start:vscode` launches it without rebuilding.

The preview reuses this checkout's built Host packages, installed dependencies, and copied Web assets. It does not download a second Node or pnpm distribution. Rebuild the shared application after upstream changes, then rebuild the extension; moving the checkout requires rebuilding the extension or setting `dsh.repositoryPath`. Set the machine-scoped `dsh.nodePath` to an absolute Node executable if the Extension Host cannot find a compatible `node` on PATH.

`DSH: Configure API Key` opens a password input and stores the DeepSeek key in VS Code SecretStorage. The next child launch receives it through its environment, not the Webview or settings. `DSH: Remove Saved API Key` removes this extension-owned key; inherited environment credentials and workspace `.env` credentials remain independent. Restart DSH after changing the key. Other provider settings use the existing DSH Web application; do not put credentials into VS Code settings or commit `.env` files.

<a id="editor-context"></a>
## Editor context

The toolbar explicitly captures the active file, selected text, or current Problems. File snapshots contain the canonical workspace-relative path, language, document version, unsaved flag, zero-based end-exclusive range, and exact editor text. Problems contain the currently reported diagnostics, not a fresh analysis or a guarantee of the document version they describe. Unsaved files must already have an on-disk path inside this workspace; untitled documents and symlink escapes are rejected. A reference chip previews the complete JSON as a read-only document; the shared composer serializes that same text into ordinary user input only on submission. Copied or restored drafts retain the snapshot text, not a fresh read of the file.

`dsh.contextMaxBytes` defaults to 65,536 UTF-8 bytes per complete serialized snapshot; `dsh.contextMaxProblems` defaults to 100 diagnostics. Oversized captures are rejected without truncation. Changing the draft, switching Sessions, or disposing the view during capture prevents late insertion. Capturing alone neither writes workspace files nor sends model input.

## Runtime and transport

The Extension Host owns one Node child using a `vscode` profile derived from the shared Web profile. Each workspace path gets a separate Harness home under the extension's VS Code global storage, without sharing Desktop sessions. Closing the panel releases its HTTP requests and sockets but keeps the child alive; `DSH: Stop Agent Runtime`, `DSH: Restart Agent Runtime`, and extension shutdown await process exit. Abrupt Extension Host loss requests child shutdown through IPC disconnect.

The child binds an ephemeral IPv4 loopback port. Its launch token travels only through private IPC; the Extension Host exchanges it for an HTTP-only cookie. The Webview uses route-limited `postMessage` HTTP and WebSocket adapters, without receiving the launch URL or cookie. Gateway retains its business protocol and stream framing. HTTP responses are pulled incrementally; uploads are buffered and rejected above 8 MiB per request before forwarding.

Static assets use VS Code resource URLs. The development CSP allows `unsafe-eval` because the vendored Cordis configuration loader constructs functions during client startup. It does not allow arbitrary inline scripts or direct loopback connections. Removing this exception or qualifying it for distribution remains a P0 security decision, not an authentication workaround.

## Verification

Focused tests run without provider credentials:

```powershell
pnpm.cmd --filter @deepseek-ai/dsh-vscode run typecheck
pnpm.cmd exec vitest run apps/vscode/tests packages/client/ui-vscode/tests
```

After building, run the real Extension Host smoke with the installed VS Code executable, replacing the example path:

```powershell
node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe"
```

This smoke creates and removes its own temporary workspace and VS Code data directories. Workspace Trust is disabled only for that isolated test process. It checks unsaved selection and file snapshots, Problems, read-only preview, real client boot, API traffic, plugin assets, a Gateway WebSocket, and owned process exit after stop; it does not submit a model request.

## Known limitations

Only a single trusted local folder is admitted. Remote SSH/WSL, virtual and multi-root workspaces are rejected. Concurrent windows on the same folder, operating systems other than Windows, crashes during active tools, and trust changes have not completed integration qualification. Do not open this preview twice on the same folder.

The toolbar provides new conversation, current-workspace history, and native API key setup. The last selected Session is retained in Webview state and restored only if it still belongs to this workspace and is not archived. The real Extension Host smoke requires this editor-specific layout to mount before and after runtime restart. Native file/diff actions, a standalone runtime, and VSIX packaging remain in the development plan. The smoke does not establish context submission replay, model turns, approvals, questions, steering, compaction, file/media downloads, plugin graph refresh, or reconnect behavior through this bridge. These upstream capabilities need extension-specific end-to-end coverage before the preview is considered usable for daily work.
