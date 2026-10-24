# Community preview release checklist

English | [中文](RELEASING.zh.md)

This reference covers the Windows x64 VSIX owned by this community fork, not upstream npm or Desktop releases. Packaging and verification do not publish, create tags, or upload credentials. Public distribution requires a separate maintainer decision.

## Version policy

The packaged runtime record includes its DSH version, official release tag, source branch, dependency versions, and lock checksum. Packaging requires that tag to be an ancestor of the source branch; alpha and RC artifacts are qualified separately. Local filenames include the DSH version (`dsh-vscode-agent-<extension-version>-dsh-<dsh-version>-win32-x64.vsix`) so an alpha build does not overwrite a retained RC VSIX.

The extension version is owned by `extension.manifest.json`; the workspace `package.json` version follows DSH independently. The extension uses `MAJOR.MINOR.PATCH-alpha.N`, `MAJOR.MINOR.PATCH-rc.N`, and `MAJOR.MINOR.PATCH`, without copying DSH's version numbers. Alpha and RC keep separate prerelease counters for a target release; promotion follows SemVer precedence from alpha to RC to stable. Development commits and local rebuilds on the same DSH release retain the declared version; accumulate changes under `Unreleased` in the [change log](CHANGELOG.md).

Every adaptation to a different official DSH release must advance the extension version before packaging, even for local-only installation. Increment the corresponding channel's prerelease counter and update the manifest, change log, versioned examples and assertions together. For the current development lines, the next adaptation uses `0.0.2-alpha.2` on Alpha and `0.0.2-rc.2` on RC; these are not the currently installed versions. A version change does not authorize tagging or publication.

GitHub VSIX previews retain the full extension version in the manifest, asset filename and `vscode-v<version>` tag. Validate installation in the supported editor before distribution. Marketplace does not support SemVer prerelease identifiers; its preparation check rejects these manifests. A future Marketplace release requires a separately approved compatible numbering scheme, not silently stripping the channel suffix.

For a public release, choose the release version, update the manifest, change log and versioned examples, and commit those changes before tagging. Build and validate that commit, then tag it as `vscode-v<version>` to distinguish extension releases from upstream DSH releases. After publication, use a new version for each subsequent public release, including previews; never replace an existing release with different contents under the same version.

## Build and inspect

Build the repository with `pnpm.cmd run build`, then run `pnpm.cmd run package:vscode` from the repository root. Finish Host-emitting builds, including `doc-typecheck`, before starting installed-editor or built-runtime checks. The package command includes community-facing documentation, preserves license notices, marks the VSIX as pre-release and creates a `.vsix.sha256` sidecar. `pnpm.cmd run verify:vscode-release` checks staged metadata and the actual file list selected by vsce; it does not replace installed-artifact testing or a security audit.

Keep the VSIX and its checksum together. Verify the SHA-256 value before sharing the artifact. The package links documentation to the packaging branch in this fork: push its source before distributing, and do not package from a temporary private branch. The build does not send keys to any registry.

## Installed-artifact acceptance

Use the existing [artifact smoke](README.md#windows-vsix) with `--fresh-shared --onboarding` and `--fresh-shared --ux` separately to test native setup and daily use in a fresh home without Desktop. Run `--fresh-shared --security` and `--fresh-shared --trust` separately against the same VSIX, then the documented shared-mode live interaction and fault checks. Retain focused isolated-mode regressions. Use temporary homes and sanitized data; verify shared credentials/models/history, both startup orders, crash recovery and final process exit. A successful package command is not editor acceptance.

Record the exact artifact checksum with the observed checks in the [development plan](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.md). Native setup saves configuration without a connection test; its mock acceptance does not certify a real provider credential or endpoint. Do not mark shared-mode interaction, security, trust or lifecycle acceptance complete based only on packaging, unit tests, older artifacts or isolated-mode checks. An unexplained Auto reviewer-removal timeout remains an open acceptance item even if a retry succeeds.

## Distribution decisions

- The community author and intended publisher ID are `LonelyQuantum`. Confirm registration and ownership of that Marketplace publisher before uploading; local metadata checks cannot verify an account. Users of the `dsh-local` preview must follow the [extension identity migration](../../docs/upgrade-guide/v0.2.0-rc.2/vscode-publisher-identity/guide.md) before installing the new identity.
- Verify that the community repository's private vulnerability reporting remains enabled and include the [security policy](SECURITY.md); do not direct private reports to an unrelated upstream maintainer.
- Review bundled dependency licenses, upstream notices and corresponding-source obligations, including the [native dependency notices](DEPENDENCY-NOTICES.md). Retain upstream copyrights. The repository-wide notice is not a certification that a community distributor has every required permission.
- Confirm provider onboarding, privacy disclosure and feedback-sharing behavior with the intended audience. Custom plugins can change the default data handling.
- Select GitHub VSIX preview, Marketplace, or Open VSX explicitly. Do not publish unsupported platform targets or claim acceptance in a registry that has not been tested.

The [official VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) owns current publisher registration and authentication requirements. Keep publisher credentials outside the repository and chat. This repository supplies no unattended publishing workflow, and this checklist does not authorize uploading the artifact.
