# Change log

English | [中文](CHANGELOG.zh.md)

## Unreleased

## 0.0.2-rc.1 — 2026-10-24

- Adapt RC to DSH `0.2.1-rc.3` with extension version `0.0.2-rc.1`; retain existing published artifacts unchanged.
- Port command-safe editor capture, declared-model onboarding, release-aware page reload and reconnecting shell HMR Fetch from the Alpha line.
- Preserve the upstream display-only `1017` badge and opt-in Search/Fetch defaults; document their separate endpoint and original-question transmission.
- Fix view replacement during asynchronous startup; retain one runtime and transport, cancel queued opens on stop, and ignore superseded view disposal.

## 0.0.1 — 2026-10-11

- Configure shared credentials, endpoints and default models through native inputs without opening Desktop or automatically testing a provider.
- Add shared/isolated identification and scoped recovery controls; preserve history and other native clients' leases.
- Resolve native file links from contained Session subdirectories and verify V3-to-V4 shared migration without rewriting predecessors.
- Adapt the RC line to DSH `0.2.0-rc.2`, preserving the extension development version `0.0.1`.
- Preserve Desktop login-shell preparation and pass the selected runtime version during shared cold startup.
- Disable product analytics only for newly initialized community shared profiles; preserve existing policy and document separate feedback telemetry.
- Use shared theme tokens and qualify editor navigation, tool groups, and portable context replay against RC.

- Add community identification, public installation guidance, privacy disclosure and package metadata.
- Set the community author and intended publisher to `LonelyQuantum`; keep the extension version at `0.0.1` and document migration from the local preview identity.
- Include a PNG icon, license notices and a SHA-256 sidecar in the packaging workflow.
- Include bilingual security guidance and the community repository's private vulnerability-reporting channel.
- Validate release files and reject the local publisher placeholder when checking Marketplace preparation.

- Let either Desktop or VS Code initialize and start the shared backend without opening Desktop first.
- Preserve one backend per home, shared provider configuration and durable conversations across cold restart and crash recovery.
- Keep explicit isolated mode and Desktop-only Office/Python resources separate from the extension's core runtime.
