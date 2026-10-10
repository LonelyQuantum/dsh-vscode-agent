# Change log

English | [中文](CHANGELOG.zh.md)

## Unreleased

- Adapt the RC line to DSH `0.2.0-rc.2`, preserving the extension development version `0.0.1`.
- Preserve Desktop login-shell preparation and pass the selected runtime version during shared cold startup.
- Disable product analytics only for newly initialized community shared profiles; preserve existing policy and document separate feedback telemetry.
- Use shared theme tokens and qualify editor navigation, tool groups, and portable context replay against RC.

- Add community identification, public installation guidance, privacy disclosure and package metadata.
- Include a PNG icon, license notices and a SHA-256 sidecar in the packaging workflow.
- Validate release files and reject the local publisher placeholder when checking Marketplace preparation.

- Let either Desktop or VS Code initialize and start the shared backend without opening Desktop first.
- Preserve one backend per home, shared provider configuration and durable conversations across cold restart and crash recovery.
- Keep explicit isolated mode and Desktop-only Office/Python resources separate from the extension's core runtime.
