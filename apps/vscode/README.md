# DSH VS Code development preview

English | [中文](README.zh.md)

This development preview opens a single-column DSH conversation inside the DSH Activity Bar view. It uses the existing DSH Web runtime and Conversation factory for the [VS Code development plan](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.md). Windows x64 supports a local VSIX preview; release acceptance remains incomplete. The development carrier package is private; VSIX packaging is independent of npm publication.

## Start the preview

The source baseline is DSH `0.1.7-rc.2`. Rebuild after updating; an existing `0.1.6-alpha.2` VSIX is not the new runtime. The development plan records source-model and recovery qualification separately from packaged-artifact acceptance. Preserve existing Session generations; test upgrades in an isolated Harness home before opening valuable history with the new writer.

Use one trusted local folder in desktop VS Code 1.100 or newer, plus Node `^22.19.0 || >=24.0.0` on PATH. Build the shared application from the repository root before building this extension:

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run dev:vscode
```

`dev:vscode` builds the extension and opens an Extension Development Host through the `code` command on PATH. In that window, open DSH in the Activity Bar or run `DSH: Open Agent` from the Command Palette. Chinese VS Code displays `DSH: 打开 Agent`. The build output is `apps/vscode/lib/extension/`; after a build, `pnpm.cmd run start:vscode` launches it without rebuilding.

The preview reuses this checkout's built Host packages, installed dependencies, and copied Web assets. It does not download a second Node or pnpm distribution. Rebuild the shared application after upstream changes, then rebuild the extension; moving the checkout requires rebuilding the extension or setting `dsh.repositoryPath`. Set the machine-scoped `dsh.nodePath` to an absolute Node executable if the Extension Host cannot find a compatible `node` on PATH.

`DSH: Configure API Key` opens a password input and stores the DeepSeek key in VS Code SecretStorage. The next child launch receives it through its environment, not the Webview or settings. `DSH: Remove Saved API Key` removes this extension-owned key; inherited environment credentials and workspace `.env` credentials remain independent. Restart DSH after changing the key. Other provider settings use the existing DSH Web application; do not put credentials into VS Code settings or commit `.env` files.

<a id="windows-vsix"></a>
## Windows VSIX preview

After building the shared application, run `pnpm.cmd run package:vscode`. The local artifact is `apps/vscode/lib/dsh-vscode-agent-0.0.1-win32-x64.vsix`; install it with VS Code's **Extensions: Install from VSIX** command. Packaging uses local npm tarballs plus an isolated production installation, including required peers and Client injection packages. It includes the shared Web composition and its Office conversion dependencies, without Desktop's Electron shell, Python/Office skills payload, Node, or pnpm distributions. The previous `0.1.6-alpha.2` artifact was approximately 175 MiB; the updated artifact needs a new size measurement. A compatible external Node is still required. No Marketplace publication or signing is performed.

Packaged client assets and DSH packages have matching recorded versions. `runtime.json` records the platform, architecture, package versions, and production lockfile digest. The launcher rejects version/platform mismatches and never falls back to a checkout when packaged metadata is invalid. `dsh.repositoryPath` applies only to source development. The build replaces only its generated extension staging directory; stop development windows before rebuilding.

The artifact smoke installs the VSIX into a temporary extension directory outside this checkout and exercises the installed files: `node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe" --vsix apps/vscode/lib/dsh-vscode-agent-0.0.1-win32-x64.vsix`. It does not change the user's normal VS Code installation.

<a id="editor-context"></a>
## Editor context

The toolbar explicitly captures the active file, selected text, or current Problems. File snapshots contain the canonical workspace-relative path, language, document version, unsaved flag, zero-based end-exclusive range, and exact editor text. Problems contain the currently reported diagnostics, not a fresh analysis or a guarantee of the document version they describe. Unsaved files must already have an on-disk path inside this workspace; untitled documents and symlink escapes are rejected. A reference chip previews the complete JSON as a read-only document; the shared composer serializes that same text into ordinary user input only on submission. Copied or restored drafts retain the snapshot text, not a fresh read of the file.

`dsh.contextMaxBytes` defaults to 65,536 UTF-8 bytes per complete serialized snapshot; `dsh.contextMaxProblems` defaults to 100 diagnostics. Oversized captures are rejected without truncation. Changing the draft, switching Sessions, or disposing the view during capture prevents late insertion. Capturing alone neither writes workspace files nor sends model input.

## Runtime and transport

File links open in the native editor at the requested line only when the viewed Session directory and canonical file belong to this workspace. Changed-file cards open read-only `vscode.diff` tabs from DSH's complete captured before/after versions, capped at 4 MiB combined. Created and deleted files have an empty missing side and an explicit title. Renames use DSH's old/new snapshot paths; captures may also include concurrent user edits and are not exclusive agent attribution. Binary and oversized comparisons are refused. Captures expire with their Host Session or runtime; already-open tabs retain their copies until closed. No apply or revert action is provided.

The Extension Host owns one Node child using a `vscode` profile derived from the shared Web profile. Each workspace path gets a separate Harness home under the extension's VS Code global storage, without sharing Desktop sessions. Closing the panel releases its HTTP requests and sockets but keeps the child alive; `DSH: Stop Agent Runtime`, `DSH: Restart Agent Runtime`, and extension shutdown await process exit. Abrupt Extension Host loss requests child shutdown through IPC disconnect.

The child binds an ephemeral IPv4 loopback port. Its launch token travels only through private IPC; the Extension Host exchanges it for an HTTP-only cookie. The Webview uses route-limited `postMessage` HTTP and WebSocket adapters, without receiving the launch URL or cookie. Gateway retains its business protocol and stream framing. Its socket adapter admits only the Gateway URL and text frames, without subprotocol negotiation; both event listeners and event-handler properties receive transport events. HTTP responses are pulled incrementally; uploads are buffered and rejected above 8 MiB per request before forwarding.

Plugin graph events use the `eventsource` library over the same authenticated Fetch bridge, restricted to `/plugins/events`. The adapter reconnects after a stream error or EOF; closing it aborts the request and cancels pending retries. Authentication stays in the Extension Host. The library owns SSE parsing and retry semantics; the extension does not maintain a second event parser.

Static assets use VS Code resource URLs. The development CSP allows `unsafe-eval` because the vendored Cordis configuration loader constructs functions during client startup. It does not allow arbitrary inline scripts or direct loopback connections. Removing this exception or qualifying it for distribution remains a P0 security decision, not an authentication workaround.

## Verification

The editor chrome supports keyboard focus into History and Escape back to its toggle. The carrier stylesheet maps primary background, text, border, and font tokens to VS Code, adds high-contrast focus borders, and respects reduced motion. Unexpected runtime exit shows a localized restart instruction and drops the stale connection; reopening starts a new owned process without automatically resending input. Page error diagnostics carry only a failure flag, never raw exception text.

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

Explicitly adding `--live-home "C:/path/to/desktop/home"` enables a paid real-model check using that home's managed `DEEPSEEK_API_KEY` reference. This option supports the default DeepSeek route, not custom provider settings or OAuth records. It passes the key only to the temporary test process environment, submits an unsaved selection through the real Webview, reads only DSH Session-directory logs with DSH's decoder, and cancels a second turn. VS Code's own JSONL logs are excluded. It does not copy credentials or Desktop sessions. The recorded `vscode-editor-context` scenario additionally replays the immutable submission without a key through `apps/web/tests/vscode-submission.e2e.ts`.

Adding `--interactions` to the live check also uploads binary bytes, steers a queued message, requests a file write under Read Only permissions, grants Allow once, opens native diff, verifies captured documents and downloaded file bytes, and answers an `ask_user_question` option. It then restarts the runtime and requires the same submitted messages to appear once. All writes stay in the temporary workspace.

Use `--faults` with `--live-home` to select fault qualification instead of the ordinary live flow. It checks the plugin event channel, disables and restores the temporary profile's layout plugin, disconnects an established Gateway socket, and terminates the owned runtime after a real shell-tool child reports readiness. The model checks use the selected DeepSeek credential. Results are written to ignored `apps/vscode/lib/fault-results*.json`; a failed probe makes the command fail after cleanup. `--fault-case plugins`, `--fault-case reconnect`, or `--fault-case crash` selects one area. `--faults --fault-case plugins` requires no `--live-home` or model request and compares actual Host enablement and mounted UI counts against `tests/expected/plugin-lifecycle.json`.

Two additional live probes require explicit selection: `--faults --fault-case streaming` disconnects the Gateway after model text starts streaming; `--faults --fault-case rebuild` atomically replaces a temporary plugin's client artifact during streaming and observes the rebuild event, replacement mount, and disposal. Both require `--live-home`, retain the draft and selected Session without reloading the Webview, and require model completion plus exactly one durable user input. The plugin probe restores its isolated profile and verifies both artifact generations are disposed before reporting success. It exercises artifact watching and client reload, not the source compiler.

## Known limitations

Only a single trusted local folder is admitted. Remote SSH/WSL, virtual and multi-root workspaces are rejected. Concurrent windows on the same folder, operating systems other than Windows, and trust changes have not completed integration qualification. Do not open this preview twice on the same folder.

The toolbar provides new conversation, current-workspace history, and native API key setup. The last selected Session is retained in Webview state and restored only if it still belongs to this workspace and is not archived. Windows source-preview fault checks verify idle and active-stream Gateway reconnect with retained draft/history, plus runtime termination during a shell tool with child exit, explicit restart, restored messages, and no repeated tool execution. They do not qualify prolonged outages, every tool category, or packaged VSIX model fault paths. Compaction and media download UI remain unqualified.

Keyless Windows checks in both the source preview and an isolated VSIX installation verify that disabling and enabling the layout plugin removes and remounts exactly one UI without replacing the Webview. Adapter tests cover fragmented UTF-8 events, stream-error and EOF reconnect, route rejection, and close cancellation. Active-turn artifact reload is qualified only in the source preview; source compilation and packaged live reload remain unqualified.
