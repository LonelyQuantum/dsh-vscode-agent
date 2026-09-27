# Agent Note: Build a Codex-style VS Code extension on the shared DSH application

Status: proposed

English | [中文](2026-09-19-vscode-extension-development-plan.zh.md)

## Problem

The fork needs a VS Code extension with an editor-centered, Codex-style conversation, explicit file and selection context, tool progress, approvals, and change review. ProleCoder supplies an existing interaction reference. DSH must remain the owner of agent execution, sessions, and permissions so the extension can follow upstream without maintaining parallel implementations.

This proposal follows the official `dsh-v0.1.7-rc.2` baseline. Findings below describe inspected source and recorded upstream decisions. The [VS Code preview](../../../../apps/vscode/README.md) implements development items across P0–P4; integration priorities distinguish earlier preview evidence from the acceptance required after this update.

## Proposal

Build a thin VS Code Extension Host, an embedded DSH Client with an editor-specific layout, and a separately owned DSH process launched through the shared profile runner. Reuse the Web application composition and override the platform-specific entries in a small VS Code bundle. Qualify the packaged runtime early, and ship Windows local-workspace support first. Additional operating systems and remote workspaces get explicit qualification milestones.

### Upstream findings and plan changes

The integration baseline is official `upstream/master` at `dsh-v0.1.7-rc.2`, fetched on 2026-09-27. It adds 1,963 reachable commits over the `dsh-v0.1.6-alpha.2` baseline; local `master` equals the new baseline. The 17 extension commits are rebased, with the previous tip retained at `backup/vscode-before-upstream-2026-09-27`. No remote branch is updated by this operation.

| Inspected upstream change | Consequence for this extension |
|---|---|
| The [Session writer](../../../../packages/core/session/src/types.ts) is V4, with adjacent migration and immutable historical generations. | Qualify opening V3 conversations and writing V4 successors in an isolated home. Preserve the recorded V3 editor-context fixture; a writer bump alone does not authorize rewriting it or imply downgrade support. |
| [Client Session presentation](../../../../packages/client/ui-session/README.md) separates view bindings from Agent scope; [Conversation](../../../../packages/client/ui-conversation/README.md) adds grouping and messages-only composition. | Adapt editor capture to the current binding/input API. Keep `conversation.content` as the UI owner and recheck draft preservation, empty-session startup, history, and narrow layouts. |
| [Connection](../../../../packages/client/connection/src/client/index.ts), [Gateway](../../../../packages/api/gateway/README.md), and [modules](../../../../packages/client/modules/README.md) include relative routes, duplex streams, trust classification, and server-restart revision fixes. | Retain the authenticated Fetch/WebSocket bridge and library-backed plugin events. Requalify byte transfers, cancellation, dynamic assets, active-turn reconnect, and plugin rebuilds through the real Webview. |
| [Agent presets](../../../../packages/preset/agent-preset/README.md) now use profile YAML; [Web bundles](../../../../packages/bundle/web-app/package.json) declare ordered patch files. | Keep the VS Code layer above the complete Web bundle. Verify installed preset resources, new-profile startup, and existing-profile reconciliation; do not copy an old preset roster into the extension. |
| [Approval](../../../../packages/client/ui-approval/README.md) gains localized explanations and an auto-review fix; [compaction](../../../../packages/compaction/compaction-basic/README.md) reserves completion capacity and headroom. | Re-run manual approval, automatic review, cancellation, and compaction acceptance through shared controls. These remain DSH capabilities, not new extension implementations. |
| [Timed user questions](2026-09-19-timed-user-question-two-settlements.md) remain proposed; [ask-user](../../../../packages/interaction/tool-ask-user/README.md) still blocks until answer or cancellation. Shipped profiles disable scheduling by default. | Do not claim nonblocking timed questions or enable scheduling implicitly. Keep these outside first-release scope; ordinary questions and plan review still require regression coverage. |
| [Review UI](../../../../packages/client/ui-deliverables/README.md) adds file hover previews, app selection, syntax highlighting, and scrolling fixes. | Preserve upstream Web/Sidebar behavior beside the optional `ConversationEditor` service and bounded captured-content route. Native diff remains read-only and Host-lifetime limited. |
| [Shared runtime preparation](../../../../scripts/primary-runtime/prepare.ts) replaces Desktop-only helpers; workspace dependencies use exact DSH release ranges. | Move development pnpm sharing to the shared runtime owner, retain Python-only payload support, align extension package versions/ranges, and regenerate the production closure. Keep external Node for VS Code. |
| [Shortcuts](../../../../packages/client/shortcuts/README.md), plugin settings, and tool/process grouping change the shared interaction surface. | Recheck VS Code keybinding collisions, focus, menus, light/dark/high-contrast colors, and 320/420 px widths before accepting the new artifact. Voice and automation stay optional, not release prerequisites. |

### Integration priorities after this update

| Order | Work and owning stage | Exit evidence |
|---|---|---|
| R0 | Rebase adaptation, generated declarations, dependencies, and build (P0/P4). | Clean conflict resolution; focused tests, type/build checks, generated catalogs, and bilingual documentation match the new baseline. |
| R1 | Shared composition and carrier recovery (P0/P1). | Source Extension Host boots, submits/cancels, transfers bytes, reconnects during streaming, and reloads a replaced plugin artifact during a turn without duplicate input or leaked credentials. |
| R2 | Session and interaction compatibility (P1/P2/P3). | V3-to-V4 open/write preserves predecessors; editor-context replay, queue/steer, manual/automatic approval, questions, compaction, restart, and captured native diff retain their semantics. |
| R3 | Codex-style editor UX regression (P4). | Narrow-layout replay plus real editor checks cover grouped tool progress, composer focus, shortcuts, theme, accessible labels, and native file/review navigation. Use ProleCoder as a behavior reference, not a second state model. |
| R4 | New Windows artifact qualification (P4). | Rebuild the VSIX from this exact baseline, install outside the checkout, and repeat source interaction/fault checks. Record actual size and dependency closure; finish CSP and Workspace Trust review before release. |

R0 precedes R1–R4. This section records acceptance of `0.1.7-rc.2`; the later P0–P4 progress paragraphs retain the `0.1.6-alpha.2` preview evidence. Repeat each affected check against the new build; old VSIX files and ignored test reports alone are not current evidence. P5 stays deferred.

Integration evidence on 2026-09-27 covers the complete shared build, extension build and typecheck, lint, focused runtime/client/review/documentation tests, and keyless browser checks for context capture, narrow layout, themes, and immutable submission. The editor-context scenario has a V4 successor and refreshed shared prompt/schema expectations; its V3 generation remains unchanged. Documentation checks include the built website. Rebuilt VSIX qualification remains open.

R0's Windows compatibility checks pass on this host: NodeNext validates 323 package declaration APIs through temporary directory junctions, and Cordis validates 218 configs with Git-indexed link placeholders resolved to working-tree targets. Focused tests cover target-preserving cleanup, invalid declarations, ordinary YAML scalars, link chains, cycles, missing targets, and repository escapes; native file-symlink coverage runs on POSIX.

R1's Windows source checks pass after the editor update: native Extension Host startup, context submission/cancellation, binary upload/download, queue/steer, manual approval, native diff, user questions, restart, plugin enable/disable, and shell-tool crash recovery run against the current build. Paid model checks reuse the selected Desktop credential without copying its sessions. Two explicit fault probes in `apps/vscode/scripts/test-active-faults.mjs` inject Gateway loss or replace a temporary client artifact after model text starts streaming. Both require one durable input, preserved draft and selected Session, model completion, and no page reload. Plugin reload also requires one replacement mount, a rebuild event, and disposal of both generations. They qualify artifact watching, not source compilation. R2 still needs historical V3-to-V4 opening, automatic approval, and compaction acceptance; R3–R4 remain open.

### Process and data ownership

The Webview owns presentation and transient editor UI. The Extension Host owns Workspace Trust, the active workspace binding, process supervision, native editor operations, and credentials access. DSH owns agent state, durable input, approval state, model selection, and tools. A hidden Webview may release UI resources without silently cancelling an active turn; workspace close, extension shutdown, and explicit stop follow defined process and task lifetimes.

The preferred experiment is Webview `postMessage` to a narrowly scoped Extension Host bridge, then the existing authenticated HTTP/WebSocket endpoints of the extension-owned runtime. Reuse Gateway stream framing and Connection recovery rather than inventing new business messages. VS Code cannot be assumed to provide Electron's custom-protocol or request-header interception APIs; Webview asset mapping, CSP, cookies, and byte streaming must be demonstrated. A failed compatibility experiment may justify a carrier using `ClientConnectionRpc`, while retaining the same Host services and generated Remote API.

Keep the launch token, authentication cookie, and provider secrets out of page URLs, Webview state, and logs. Limit proxy requests to the owned runtime and admitted routes. Reuse the existing root-token exchange and browser trust checks; do not weaken authentication to make the Webview connect. Native operations use typed commands scoped to the current Webview and workspace, with cancellation and resource disposal.

Develop with an isolated Harness home. Give each window an explicit runtime/profile ownership policy before enabling multiple windows; product data sharing and executable/plugin installation sharing are separate decisions. Reuse upstream credential ownership, adding a SecretStorage provider only where its scope and lifecycle fit; the Webview never receives raw secrets.

The VS Code bundle owns its model-visible surface section through the shared system-prompt registry. It disables the standalone Web orientation, browser handoff, and URL printing. The section describes explicit editor snapshots and read-only native review without exposing the private runtime URL; its assembled prompt and tool schemas have a recorded-scenario pin.

### Proposed code placement

| Location | Responsibility |
|---|---|
| `apps/vscode/` | Extension manifest, activation, process supervisor, native actions, Webview entry/assets, VSIX packaging, and Extension Host tests. |
| `packages/bundle/vscode-app/` | A small patch above the shared Web composition: VS Code adapters and layout, with explicitly selected optional features. |
| `packages/client/ui-vscode/` | Root layout and editor affordances composed with the existing conversation Factory, declared slots, theme tokens, and locale dictionaries. |
| Host adapter, placement decided in the spike | A Cordis plugin only for Host behavior that must call editor-owned operations; no `vscode` imports in general DSH packages. |

`apps/vscode/`, `packages/bundle/vscode-app/`, and `packages/client/ui-vscode/` contain the source-checkout preview. The bundle selects an editor-only root while retaining the shared Conversation factory and services. The Extension Host supplies the workspace through the private startup handshake; Client Loader entries do not inherit Host plugin configuration. Follow the current [Client rules](../../../../packages/client/AGENTS.md) for Host/Client faces, dependency declarations, slot ownership, and localized copy. Extract shared helpers from Desktop only when both products consume a stable responsibility; Electron-specific controls and updater code stay with Desktop.

### P0 progress and open decisions

The Windows Extension Development Host boots the real shared-profile application, loads Web client and plugin assets, issues API requests, establishes the Gateway WebSocket, mounts the editor-specific single-column conversation, and stops its owned Node child. A restart smoke checks both remount and old-process exit. The toolbar provides new conversation, workspace history, native SecretStorage setup, and restoration of an eligible last-selected Session; focused tests cover navigation and late startup disposal. Both source development and the Windows x64 VSIX use an external compatible Node. The VSIX installs into an isolated directory outside the checkout and passes the same native-editor and lifecycle smoke. P0 and P1 acceptance remain incomplete.

The Webview bridge keeps authentication in the Extension Host and preserves Gateway framing. Real Webview checks cover model completion/cancellation, binary upload, downloaded file bytes, queued-message steering, and conversation restoration after runtime restart. Windows source-preview fault checks also cover idle Gateway reconnect and runtime termination during a shell tool. Plugin events use the `eventsource` library through authenticated Fetch instead of the native Webview-origin connection; its parser and retry handling avoid a separately maintained SSE implementation. A keyless editor check verifies Host disable/enable removes and remounts the layout without replacing the Webview. Adapter tests cover stream-loss reconnect and cancellation; current active-turn evidence is recorded in the integration section above. Cordis's browser configuration loader requires `unsafe-eval`; distribution qualification still needs a CSP decision and trust transitions. The preview's [limits and launch procedure](../../../../apps/vscode/README.md) are authoritative for trying this partial implementation.

### Delivery sequence

P4 preview checks cover History keyboard focus, carrier colors in light/dark/high-contrast mode, Windows runtime termination followed by explicit restart, and installed VSIX startup. The source-preview shell-tool crash check observes child exit, restored messages without rerunning the tool, and a subsequent real-model response. Raw page exceptions are excluded from diagnostics. Packaging selects workspace dependencies, required peers, and Client injection dependencies into a production runtime, records exact versions and a lockfile digest, and rejects platform/version mismatches. The shared Web composition includes Office conversion dependencies but not Desktop's Electron/Python/skills payload or an additional Node/pnpm distribution. Other tool categories, packaged fault paths, full interaction acceptance, CSP release review, and macOS/Linux qualification remain open.

P3 uses the optional `ConversationEditor` service defined by `ui-conversation`, supplied by `ui-vscode`, and consumed by Chat and deliverables. The native carrier validates file admission; captured review reads a fixed authenticated route backed by `workspaceChanges.contents`, sharing the recorder's limits and lifetime. Web and Desktop keep their Sidebar navigation when no editor service is mounted. This is read-only review, without durable historical captures or revert. Windows native-editor and backend tests cover exact versions, later disk edits, creation/deletion, rename, binary/size refusal, and expiration. A live model requests a write under Read Only permissions; Allow once admits it, and the change card opens native diff whose read-only documents match the captured versions. The same flow answers an `ask_user_question` option and waits for model completion.

The P2 preview captures file, selection, and Problems only on explicit request, inserts immutable reference chips with draft-revision admission, and opens exact-text read-only previews. Unit tests cover UTF-8 limits, workspace/symlink admission, cancellation, and serialization; the real Windows Extension Host checks unsaved editor text, version, diagnostics, and preview. A live Webview check submits an unsaved selection, verifies the model's reply and durable Session text, and cancels another turn. The recorded `vscode-editor-context` scenario replays the shared composer, immutable submission, model reply, and persisted Session without credentials. File/Problems capture and cancellation remain covered by their focused native and Client tests.

| Stage | Deliverable | Exit evidence |
|---|---|---|
| P0: architecture and executable spike | Minimal extension, shared-profile launch, owned loopback proxy experiment, packaged assets, and current transport hooks. | A real Extension Development Host completes a model turn and cancels another; Session listing, readiness/reconnect, one upload/download, lazy asset loading, and plugin graph refresh work under CSP. Closing the extension leaves no owned process. Record any transport gap before selecting the final carrier. |
| P1: first usable vertical slice | Activity Bar entry, single-column conversation, session switch/new/resume, tool cards, approval/questions/plan, model/permissions, queue and steering. Add setup, SecretStorage integration, trust handling, and bounded diagnostics. | Windows local workspace can install the VSIX, configure a provider, perform an edit with approval, stop work, reload, and resume without duplicate input or leaked credentials. Native runtime and module-resolution smoke runs outside the source checkout. |
| P2: editor context | Active file, selected text, explicit context chips, file references, and Problems snapshots. | Submitted context matches the visible draft, including unsaved text and file version. Paths identify the correct execution world; the admitted model input is replayable from the DSH log. Cancellation does not attach context to another Session. |
| P3: native change review | Route file links to editor locations; use upstream change summaries; expose bounded captured file versions for read-only `vscode.diff` documents. | Before/after are the recorded versions, not today's disk contents or reconstructed partial hunks. Create/delete, rename, repeated edits, binary/oversized files, missing captures, and user edits during a turn have explicit behavior. Expired history is shown honestly. |
| P4: interaction and release qualification | Keyboard navigation, composer behavior, queue/steer controls, compact progress, theme/font/accessibility, localization, crash recovery, and version-pinned runtime packaging. | Focused UX comparisons and installable artifact tests cover Windows, then macOS/Linux. Remote SSH/WSL and multi-root support ship only after filesystem identity, process placement, credentials, and multi-window behavior are tested. |
| P5: separate enhancements | Durable historical review, conflict-aware apply/revert, richer subagent views, native Chat participant, Git workflows, background handoff, and optional FIM. | Each enhancement states its data ownership and product acceptance criteria; it does not block P0–P4. |

P0 includes distribution feasibility because VS Code's embedded Node version is not the DSH runtime contract. Pin the extension, client assets, and runtime to a tested version set. Verify the chosen standalone Node or packaged DSH path against the repository's engines and native dependencies; do not assume Desktop's Electron RunAsNode implementation transfers to VS Code. Default optional browser/computer-use and Office capabilities to the selected product composition rather than inheriting the Desktop payload by accident.

### Reuse and upstream maintenance

The Windows preview has implementation commits for each P0–P4 area, not a completed release-acceptance claim. Non-persistent theme registrations follow the editor palette; browser replay checks shared controls and message widths at 320/420 px. Remaining qualification items above stay visible when handing off the preview.

Use ProleCoder as the reference for Workspace Trust, editor selection/diagnostics, process recovery, native diff navigation, and VSIX tests. Keep agent execution, RPC business methods, history, compaction, and tool rendering with DSH. Direct code reuse requires a source/license decision before copying; behavior-level reference does not depend on importing ProleCoder's implementation.

Keep local `master` tracking `upstream/master` and free of extension commits. Fetch upstream and fast-forward `master`; rebase the feature branch only when requested, retaining a local backup and the fetched remote tip. A later authorized rewritten push uses an exact `--force-with-lease`, never `--force`. Synchronizing the fork's remote `master` is a separate push, not implied by fetching upstream.

## Alternatives considered

**A new portless IPC backend as the first milestone.** It adds ownership of streams, exact Fetch routes, byte transfer, module serving, and recovery. Upstream's shared Web wrapper gives a working reference with lower divergence. Reconsider only when measured VS Code constraints prevent the shared Web path or a concrete product requirement prohibits a listener.

**Embed the complete three-column Web page unchanged.** It accelerates a transport proof, but duplicates the editor's file and preview areas and squeezes the conversation in a narrow sidebar. Keep it as a temporary diagnostic view; the product composes `conversation.content` in an editor-specific layout.

**Build on the SDK or ACP.** The [current TypeScript SDK limitations](../../../../packages/sdk/client/README.md#known-limitations-and-deferred-work) still exclude mid-turn cancellation and server-to-client requests. These protocols are useful to their consumers but do not replace the existing interactive GUI API for this extension.

**Copy ProleCoder's full frontend and backend.** That creates parallel session, provider, and tool-state implementations while losing DSH's client evolution. Retain the editor-integration behavior and implement adapters against current DSH interfaces.

## Acceptance criteria

- The first release completes the editor workflow: select context, send, observe tools, approve, cancel or steer, inspect changes, and resume a Session after reload.
- P0 records transport and packaged-runtime evidence; P1 ships a Windows VSIX before expanding optional features or operating-system support.
- Runtime cancellation, hidden-view behavior, crashes, restart, workspace close, and extension disposal are tested through the real composition. Failed startup and unavailable history have visible recovery or limitation states.
- Context and inbox changes preserve logged model inputs and released-format migration rules. Native review never presents partial hunks or mutable current files as captured complete versions.
- Verification follows [testing policy](../../../../docs/testing.md) and [snapshot ownership](../../../../snapshots/AGENTS.md): recorded Session cases under `snapshots/`, other expectations beside their owner, plus Extension Host/VSIX tests. GUI PRs include real-server/model evidence under the [GIF workflow](../../../skills/record-browser-gif/SKILL.md).
- Changes to shared UI run the relevant GUI and browser replay checks; documentation pairs, localization, published artifacts, and affected behavior get their owning checks. An Agent Note accompanies a lasting architectural decision, not every local UI adjustment.

## Risks

Webview CSP and origin rules may prevent direct reuse of Electron's asset/authentication adapters. P0 must test ordinary Fetch consumers and lazy chunks, not only Connection RPC. Any bridge must bound buffering and await cancelled stream teardown before reconnecting.

The current change recorder retains summaries and captured bytes only while its Session lives, and concurrent user or external edits may enter a turn's workspace comparison. This is review evidence, not exclusive agent attribution or a safe rollback transaction. Durable review and apply/revert need separate conflict and persistence designs.

Upstream APIs and plugin composition remain pre-stable. The [LogicalSession proposal](2026-09-06-logical-session-storage-rebuild.md) is proposed work, not an implementation dependency. Follow current Remote and projection APIs, pin a qualified baseline, and reassess upstream before each milestone. The linked Desktop, launch, stream, Factory, and presentation decisions retain independent value; this VS Code proposal supersedes none of them.
