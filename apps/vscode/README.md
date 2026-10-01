# DSH VS Code development preview

English | [中文](README.zh.md)

This preview opens the current workspace's conversation list in VS Code's secondary sidebar. Send from its bottom-docked composer to begin a conversation; use the upper-left back button to return without stopping tasks. The plus menu adds file and image attachments. Desktop and VS Code share a local backend by default: credentials, API endpoints, model configuration, plugins, and Session history. Windows x64 supports a local VSIX preview; Marketplace acceptance remains incomplete.

## Start the preview

The source baseline is DSH `0.1.7-rc.2`. Rebuild after updating; an existing `0.1.6-alpha.2` VSIX is not the new runtime. The development plan records source-model and recovery qualification separately from packaged-artifact acceptance. Preserve existing Session generations; test upgrades in an isolated Harness home before opening valuable history with the new writer.

Use one trusted local folder in desktop VS Code 1.106 or newer, plus Node `^22.19.0 || >=24.0.0` for editor-owned cold startup or isolated mode. Build the shared application from the repository root before building this extension:

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run dev:vscode
```

`dev:vscode` builds the extension and opens an Extension Development Host through `code` on PATH. Open DSH in the secondary sidebar or run `DSH: Open Agent` (`DSH: 打开 Agent` in Chinese). Existing view-placement preferences take precedence; use **Move View → Secondary Side Bar** when needed. Output is `apps/vscode/lib/extension/`; `pnpm.cmd run start:vscode` skips rebuilding.

The preview reuses this checkout's built Host packages, installed dependencies, and copied Web assets. It does not download a second Node or pnpm distribution. Rebuild the shared application after upstream changes, then rebuild the extension; moving the checkout requires rebuilding the extension or setting `dsh.repositoryPath`. Set the machine-scoped `dsh.nodePath` to an absolute Node executable if the Extension Host cannot find a compatible `node` on PATH.

Open the extension to connect to the shared backend or initialize and start it from the extension's own runtime; Desktop need not be installed or opened first. The machine-scoped `dsh.desktopHome` selects an existing or new Harness home. When unset, the first available setting wins: `DSH_HOME`, this checkout's development home, then the account's `.dsh` directory. Missing directories are created on trusted startup, not skipped in favor of another home. `DSH: Connect Shared Desktop Backend` selects another home. Both clients require the same DSH version and home; existing profile files and history are preserved.

`DSH: Configure API` selects the shared backend or explicitly switches to `dsh.backend = isolated` with a private key in SecretStorage. Shared mode uses the Desktop profile's credentials and provider configuration without copying keys. Removing a saved extension key never deletes Desktop credentials. Existing private history remains available in isolated mode and is not automatically merged.

<a id="windows-vsix"></a>
## Windows VSIX preview

Community-facing installation and data handling are described in [the listing](MARKETPLACE.md) and [privacy notice](PRIVACY.md). The [release checklist](RELEASING.md) separates package validation from publisher registration and installed-editor acceptance.

After building the shared application, run `pnpm.cmd run package:vscode`. The local artifact is `apps/vscode/lib/dsh-vscode-agent-0.0.8-win32-x64.vsix`; install it with VS Code's **Extensions: Install from VSIX** command. Packaging uses local npm tarballs plus an isolated production installation, including required peers and Client injection packages. It includes the shared Node Host, Web composition and Office conversion dependencies, without Desktop's Electron shell, Python/Office skills payload, Node, or pnpm distributions. The packaged runtime inventory records the production closure. Client JavaScript omits build-machine debug-path comments while retaining license text; source maps, machine-local pnpm records, and POSIX launchers are excluded from the Windows VSIX. A compatible external Node is still required. No Marketplace publication or signing is performed.

Packaged client assets and DSH packages have matching recorded versions. `runtime.json` records the platform, architecture, package versions, and production lockfile digest. The launcher rejects version/platform mismatches and never falls back to a checkout when packaged metadata is invalid. It canonicalizes the installation path before loading modules, so Windows drive-letter aliases share DSH's module state. `dsh.repositoryPath` applies only to source development. The build replaces only its generated extension staging directory; stop development windows before rebuilding.

The artifact smoke installs the VSIX into a temporary extension directory outside this checkout and exercises the installed files: `node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe" --vsix apps/vscode/lib/dsh-vscode-agent-0.0.8-win32-x64.vsix --fresh-shared`. This starts the default shared backend in an empty test home without Desktop registration, then checks restart, crash recovery, and final process exit. It does not change the user's normal VS Code installation.

<a id="editor-context"></a>
## Editor context

The bottom toolbar explicitly captures selected text or current Problems; the plus menu uploads files and images. File snapshots contain the canonical workspace-relative path, language, document version, unsaved flag, zero-based end-exclusive range, and exact editor text. Problems contain the currently reported diagnostics, not a fresh analysis or a guarantee of the document version they describe. Unsaved files must already have an on-disk path inside this workspace; untitled documents and symlink escapes are rejected. A reference chip previews the complete JSON as a read-only document; the shared composer serializes that same text into ordinary user input only on submission. Copied or restored drafts retain the snapshot text, not a fresh read of the file.

`dsh.contextMaxBytes` defaults to 65,536 UTF-8 bytes per complete serialized snapshot; `dsh.contextMaxProblems` defaults to 100 diagnostics. Oversized captures are rejected without truncation. Changing the draft, switching Sessions, or disposing the view during capture prevents late insertion. Capturing alone neither writes workspace files nor sends model input.

## Runtime and transport

File links open in the native editor at the requested line only when the viewed Session directory and canonical file belong to this workspace. Changed-file cards open read-only `vscode.diff` tabs from DSH's complete captured before/after versions, capped at 4 MiB combined. Created and deleted files have an empty missing side and an explicit title. Renames use DSH's old/new snapshot paths; captures may also include concurrent user edits and are not exclusive agent attribution. Binary and oversized comparisons are refused. Captures expire with their Host Session or runtime; already-open tabs retain their copies until closed. No apply or revert action is provided.

Default `shared` mode gives each native client a lease on one Desktop-profile backend per canonical Harness home. Multiple editor windows and Desktop share one writer. Each editor lists its current workspace's conversations, or all conversations when that workspace has none. New messages from the list start conversations in the editor's workspace. Closing a panel retains its native lease; stopping, restarting, or exiting releases only that window's lease. The last lease shuts down the profile.

`dsh.backend = isolated` retains the original private `vscode` profile per canonical workspace under extension global storage, with a single-writer lock. Neither mode moves or deletes history. The [shared backend library](../shared-host/README.md) owns authenticated leases, version checks, cold launch, crash recovery, and exclusive Desktop updates.

The backend binds an ephemeral IPv4 loopback port. Shared mode carries native boot data over an authenticated control socket; isolated mode uses private child IPC. The Extension Host exchanges the launch token for an HTTP-only cookie. Route-limited Webview adapters receive neither the URL nor the cookie. Gateway retains its stream framing. HTTP responses are incremental; buffered uploads above 8 MiB are refused.

Plugin graph events use the `eventsource` library over the same authenticated Fetch bridge, restricted to `/plugins/events`. The adapter reconnects after a stream error or EOF; closing it aborts the request and cancels pending retries. Authentication stays in the Extension Host. The library owns SSE parsing and retry semantics; the extension does not maintain a second event parser.

Static resources are limited to `web/`, `resources/`, and `carrier/`; the workspace, Host entry, and packaged runtime are not Webview resource roots. CSP refuses unlisted sources, arbitrary inline scripts, dynamic string compilation (`eval` and `Function`), external connections/images, base-URL changes, forms, frames, and objects. Plugin scripts and generated style elements carry the page nonce; blob workers remain available. The shared Loader compiles trusted Host configuration expressions only when requested, so literal-only Client startup needs no `unsafe-eval`. Inline style attributes remain allowed through `style-src-attr 'unsafe-inline'` for shared layout and math rendering; unnonced inline style elements are blocked. This is not an XSS guarantee or a hardened Marketplace-release claim: installed Cordis plugins are trusted code and must be reviewed before enabling them.

The manifest disables DSH in Restricted Mode. Startup checks trust again after asynchronous workspace, credential, and installation reads. Granting trust makes the extension available; revoking trust restarts the Extension Host, disposes its runtime, and leaves DSH disabled. Native actions also check trust before admitting page messages. The real-editor trust check uses a separate observer extension rather than the extension-test lifecycle, so VS Code can perform its normal host restart.

## Verification

The editor chrome supports keyboard focus into History and Escape back to its toggle. Capturing a selection returns focus to the composer; modified Enter chords and IME composition preserve the draft, while Shift+Enter inserts a line. The carrier stylesheet maps background, text, border, and font tokens to VS Code, supports light/dark and both high-contrast themes, and respects reduced motion. Keyless browser checks cover 320/420 px layouts, permission-menu dismissal, immutable context replay, and 45 recorded tool results inside keyboard-operated process groups. Unexpected runtime exit shows a localized restart instruction without resending input. Page error diagnostics carry only a failure flag, never raw exception text.

Focused tests run without provider credentials:

```powershell
pnpm.cmd --filter @deepseek-ai/dsh-vscode run typecheck
pnpm.cmd exec vitest run apps/vscode/tests packages/client/ui-vscode/tests
```

After building, run the real Extension Host smoke with the installed VS Code executable, replacing the example path:

```powershell
node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe"
```

The smoke explicitly selects isolated mode and creates and removes its own temporary workspace and VS Code Portable directories, including `argv.json`. Workspace Trust is disabled only for that test process. It checks editor snapshots, Problems, read-only preview, client boot, API traffic, plugin assets, a Gateway socket, and owned process exit without a model request.

Explicitly adding `--live-home "C:/path/to/desktop/home"` enables a paid real-model check using that home's managed `DEEPSEEK_API_KEY` reference. This option supports the default DeepSeek route, not custom provider settings or OAuth records. It passes the key only to the temporary test process environment, submits an unsaved selection through the real Webview, reads only DSH Session-directory logs with DSH's decoder, and cancels a second turn. VS Code's own JSONL logs are excluded. It does not copy credentials or Desktop sessions. The recorded `vscode-editor-context` scenario additionally replays the immutable submission without a key through `apps/web/tests/vscode-submission.e2e.ts`.

Adding `--interactions` to the live check also uploads binary bytes, steers a queued message, requests a file write under Read Only permissions, grants Allow once, opens native diff, verifies captured documents and downloaded file bytes, and answers an `ask_user_question` option. It then restarts the runtime and requires the same submitted messages to appear once. All writes stay in the temporary workspace.

Use `--faults` with `--live-home` to select fault qualification instead of the ordinary live flow. It checks the plugin event channel, disables and restores the temporary profile's layout plugin, disconnects an established Gateway socket, and terminates the owned runtime after a real shell-tool child reports readiness. The model checks use the selected DeepSeek credential. Results are written to ignored `apps/vscode/lib/fault-results*.json`; a failed probe makes the command fail after cleanup. `--fault-case plugins`, `--fault-case reconnect`, or `--fault-case crash` selects one area. `--faults --fault-case plugins` requires no `--live-home` or model request and compares actual Host enablement and mounted UI counts against `tests/expected/plugin-lifecycle.json`.

Two additional live probes require explicit selection: `--faults --fault-case streaming` disconnects the Gateway after model text starts streaming; `--faults --fault-case rebuild` atomically replaces a temporary plugin's client artifact during streaming and observes the rebuild event, replacement mount, and disposal. Both require `--live-home`, retain the draft and selected Session without reloading the Webview, and require model completion plus exactly one durable user input. The plugin probe restores its isolated profile and verifies both artifact generations are disposed before reporting success. It exercises artifact watching and client reload, not the source compiler.

Use `--compat-case migration`, `--compat-case auto-review`, or `--compat-case compaction` with `--live-home` to qualify one Session path. Migration seeds test-owned V3 history, continues it through V4, and checks that the predecessor bytes, identity, and modification time survive restart. Auto review enables the optional experimental bundle only in the temporary profile, acknowledges its risk dialog, verifies a reviewed file write, restores Auto after both a process crash and graceful restart, and requires human approval after explicit unload switches to Read Only. Rejecting that approval leaves the target file absent. Compaction lowers the standard preset's threshold only in that profile, requires automatic summary/checkpoint events without `/compact`, and checks remembered context after restart. These options also accept `--vsix` to exercise an isolated installation; they cannot combine with `--faults` or `--interactions`.

Add `--ux` to the Extension Host smoke to check native keyboard routing, IME Enter, multiline drafts, the conversation list, file-menu hit testing, and capture focus in the real Webview. This keyless option accepts `--vsix` but cannot combine with model or fault options.

Add `--security` for keyless browser-enforced CSP/resource checks, competing child ownership, and two real peer windows. A junction alias must be refused while a different workspace can boot, with both peer windows sharing only the test extension's storage. Add `--trust` with `--vsix` for an installed-extension cycle from Restricted Mode to trusted startup and back to Restricted Mode, requiring the previous child to exit. This uses the native Workspace Trust buttons in isolated user, shared-data, and extension directories. These options are separate from `--ux`, model, and fault checks.

## Known limitations

Each window admits one trusted local folder. Remote SSH/WSL, virtual and multi-root workspaces are rejected. Shared mode supports multiple native clients per home; isolated mode retains its single-writer restriction. Backend crashes require an explicit reconnect and never resend input. Windows is locally qualified; macOS/Linux shared-carrier behavior is not.

The bottom toolbar provides explicit selection/Problems capture and native API configuration. Startup shows the conversation list rather than restoring the last Session. Unsent drafts are not shared. Auto review remains experimental and disabled by default.

Normal shutdown preserves an Auto Session's durable permission selection. Unloading its reviewer while the runtime is active switches it to Read Only with human approval; reinstalling the reviewer does not silently re-enable Auto. Live reviewer removal cancels active Auto work and closes its agent-owned persistent terminals before downgrading; user-owned VS Code terminals are unaffected. Older previews may already have recorded Full access during shutdown: check those Sessions explicitly, because the log cannot distinguish that change from a deliberate selection. See [Auto review lifecycle](../../packages/experimental/auto-review/README.md#understand-the-implementation).

Plugin lifecycle checks require disabling and enabling the layout plugin to remove and remount exactly one UI without replacing the Webview. Adapter tests cover fragmented UTF-8 events, stream-error and EOF reconnect, route rejection, and close cancellation. The development plan records active-turn artifact reload qualification; the probe does not qualify source compilation.
