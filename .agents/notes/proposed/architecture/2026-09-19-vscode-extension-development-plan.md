# Agent Note: Build a Codex-style VS Code extension on the shared DSH application

Status: proposed

English | [中文](2026-09-19-vscode-extension-development-plan.zh.md)

## Problem

The fork needs a VS Code extension with an editor-centered, Codex-style conversation, explicit file and selection context, tool progress, approvals, and change review. ProleCoder supplies an existing interaction reference. DSH must remain the owner of agent execution, sessions, and permissions so the extension can follow upstream without maintaining parallel implementations.

This proposal replaces the initial conversation-only development plan after examining the upstream update from `dsh-v0.1.1-rc.2` to `dsh-v0.1.6-alpha.2`. Findings below describe inspected source and recorded upstream decisions. The [VS Code preview](../../../../apps/vscode/README.md) implements development items across P0–P4; the progress sections distinguish working features from pending release acceptance.

## Proposal

Build a thin VS Code Extension Host, an embedded DSH Client with an editor-specific layout, and a separately owned DSH process launched through the shared profile runner. Reuse the Web application composition and override the platform-specific entries in a small VS Code bundle. Qualify the packaged runtime early, and ship Windows local-workspace support first. Additional operating systems and remote workspaces get explicit qualification milestones.

### Upstream findings and plan changes

| Inspected upstream change | Consequence for this extension |
|---|---|
| [Desktop wraps the complete Web application](../../implemented/architecture/2026-09-10-desktop-web-wrapper.md), following PR #3981. Its business traffic uses authenticated HTTP and WebSocket; IPC carries lifecycle and bootstrap data. | Evaluate an Extension Host proxy to an owned loopback Web runtime first. A portless business IPC carrier is conditional on a demonstrated Webview requirement, not a prerequisite. |
| [Connection transport hooks](../../../../packages/client/connection/src/client/index.ts) expose `rpc`, `fetch`, `openStream`, `loadBundle`, `ownsHost`, and `streamBaseUrl`; [Gateway](../../../../packages/api/gateway/README.md) owns multiplexed streams, readiness, and recovery. | Replace the old `createApiClient` assumption. Preserve unary cancellation, logical stream cancellation, generation readiness, and journal catch-up through the current interfaces. |
| [Client modules](../../../../packages/client/modules/README.md) support live plugin composition, lazy chunks, styles, and graph updates; PR #4189 adds live composition. | The transport spike must cover dynamic assets, exact Fetch routes, uploads/downloads, and module reload as well as a text prompt. |
| [Component Factories](../../implemented/architecture/2026-09-10-component-factories-and-local-slots.md), shipped in PR #4359, include `conversation.content`. | Compose the existing conversation body and composer in a narrow VS Code layout. Preserve their stores and Session scope; implement editor-specific controls through declared slots and callbacks. |
| [Client-derived tool presentation](../../implemented/architecture/2026-08-23-client-derived-tool-presentation.md) consumes raw events and persisted result metadata. | Keep `ui-tool` as the card owner. Do not expect Host render intents in Session Remote responses or import Host tool implementations into the Webview. |
| [Workspace changes](../../../../packages/deliverables/workspace-changes/README.md) and [review UI](../../../../packages/client/ui-deliverables/README.md) capture turn comparisons; PR #4279 supplies the review preview. | Reuse summaries and change coordinates. Native full-file diff needs a bounded read of both captured versions: the current response supplies hunks, not complete files. Historical review after Host restart remains a separate persistence decision. |
| [The application launcher](../../../../docs/architecture.md) requires profiles; [app-boot](../../../../packages/boot/app-boot/README.md) owns runtime/link resolution and plugin installation. | Use an application-owned `vscode` profile and the shared launcher. Do not introduce a standalone agent executable or reuse Desktop's reserved profile. |
| [Session format status](../../../../docs/session-format-status.md) records released format 3; [adjacent migrations](../../implemented/architecture/2026-08-31-released-session-format-migrations.md) retain immutable generations. The [agent loop](../../../../docs/architecture.md) owns the durable inbox. | Reuse migration, queue, receipt, and recovery behavior. Do not build a Webview-owned session log or assume persisted data can be discarded because the product is prerelease. |

### Process and data ownership

The Webview owns presentation and transient editor UI. The Extension Host owns Workspace Trust, the active workspace binding, process supervision, native editor operations, and credentials access. DSH owns agent state, durable input, approval state, model selection, and tools. A hidden Webview may release UI resources without silently cancelling an active turn; workspace close, extension shutdown, and explicit stop follow defined process and task lifetimes.

The preferred experiment is Webview `postMessage` to a narrowly scoped Extension Host bridge, then the existing authenticated HTTP/WebSocket endpoints of the extension-owned runtime. Reuse Gateway stream framing and Connection recovery rather than inventing new business messages. VS Code cannot be assumed to provide Electron's custom-protocol or request-header interception APIs; Webview asset mapping, CSP, cookies, and byte streaming must be demonstrated. A failed compatibility experiment may justify a carrier using `ClientConnectionRpc`, while retaining the same Host services and generated Remote API.

Keep the launch token, authentication cookie, and provider secrets out of page URLs, Webview state, and logs. Limit proxy requests to the owned runtime and admitted routes. Reuse the existing root-token exchange and browser trust checks; do not weaken authentication to make the Webview connect. Native operations use typed commands scoped to the current Webview and workspace, with cancellation and resource disposal.

Develop with an isolated Harness home. Give each window an explicit runtime/profile ownership policy before enabling multiple windows; product data sharing and executable/plugin installation sharing are separate decisions. Reuse upstream credential ownership, adding a SecretStorage provider only where its scope and lifecycle fit; the Webview never receives raw secrets.

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

The Webview bridge keeps authentication in the Extension Host and preserves Gateway framing. Cordis's browser configuration loader requires `unsafe-eval`; the preview records that CSP exception rather than changing vendored behavior during the transport experiment. P0 must decide whether to remove or qualify it for distribution, then cover model completion/cancellation, reconnect, file transfers, live plugin changes, trust transitions, and abrupt shutdown during tools. The preview's [limits and launch procedure](../../../../apps/vscode/README.md) are authoritative for trying this partial implementation.

### Delivery sequence

P4 preview checks cover History keyboard focus, carrier colors in light/dark/high-contrast mode, Windows runtime termination followed by explicit restart, and installed VSIX startup. Raw page exceptions are excluded from diagnostics. Packaging selects workspace dependencies, required peers, and Client injection dependencies into a production runtime, records exact versions and a lockfile digest, and rejects platform/version mismatches. The shared Web composition includes Office conversion dependencies but not Desktop's Electron/Python/skills payload or an additional Node/pnpm distribution. Active-tool crashes, full interaction acceptance, CSP release review, and macOS/Linux qualification remain open.

P3 uses the optional `ConversationEditor` service defined by `ui-conversation`, supplied by `ui-vscode`, and consumed by Chat and deliverables. The native carrier validates file admission; captured review reads a fixed authenticated route backed by `workspaceChanges.contents`, sharing the recorder's limits and lifetime. Web and Desktop keep their Sidebar navigation when no editor service is mounted. This is read-only review, without durable historical captures or revert. Windows native-editor and backend tests cover exact versions, later disk edits, creation/deletion, rename, binary/size refusal, and expiration; real-model edit-to-review acceptance remains pending.

The P2 preview captures file, selection, and Problems only on explicit request, inserts immutable reference chips with draft-revision admission, and opens exact-text read-only previews. Unit tests cover UTF-8 limits, workspace/symlink admission, cancellation, and serialization; the real Windows Extension Host checks unsaved editor text, version, diagnostics, and preview. The recorded model-submission scenario remains an acceptance gap; this evidence does not mark P2 complete.

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

Use ProleCoder as the reference for Workspace Trust, editor selection/diagnostics, process recovery, native diff navigation, and VSIX tests. Keep agent execution, RPC business methods, history, compaction, and tool rendering with DSH. Direct code reuse requires a source/license decision before copying; behavior-level reference does not depend on importing ProleCoder's implementation.

Keep local `master` tracking `upstream/master` and free of extension commits. Fetch upstream and fast-forward `master`; incorporate that verified baseline into the feature branch without rewriting published work by default. Make product changes on the feature branch. Synchronizing the fork's remote `master` is a separate Git push, not implied by fetching upstream.

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
