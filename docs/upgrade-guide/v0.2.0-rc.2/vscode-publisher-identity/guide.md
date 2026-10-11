---
kind: upgrade-guide
description: "The community VS Code preview changes publisher identity and no longer uses the local preview's private storage."
---

# Community VS Code publisher identity

English | [中文](guide.zh.md)

## Change

The community extension manifest names `LonelyQuantum` as its author and intended publisher. Its canonical extension ID changes from `dsh-local.dsh-vscode-agent` to `lonelyquantum.dsh-vscode-agent`, while its development version remains `0.0.1`. This affects local preview installations, not upstream Desktop or npm packages; Marketplace account registration and ownership remain unverified.

VS Code treats the new ID as a different extension. The shared Harness home retains its credentials, provider configuration and conversations. Extension-private storage, including isolated-mode homes, is not migrated automatically. The `dsh.*` setting names remain unchanged.

## Migration

1. Record the shared home's absolute path from the `dsh.desktopHome` setting. If you used isolated mode, stop its runtime with `DSH: Stop Agent Runtime` and back up its homes under the old extension's `globalStorage/dsh-local.dsh-vscode-agent` directory before removing the old installation.
2. Disable `dsh-local.dsh-vscode-agent` in every VS Code window before installing the new VSIX. Do not enable both identities: they contribute the same DSH commands and view. Keep the old installation disabled until you have checked the backup and new extension.
3. Open the new extension and run `DSH: Connect Shared Desktop Backend` if necessary, selecting the same shared home. No key copy or Desktop restart is required solely for this identity change.
4. Confirm that VS Code identifies the enabled extension as `lonelyquantum.dsh-vscode-agent` and that the shared conversation list is available. Isolated-mode history remains in the backed-up old home; the new extension does not import it.
