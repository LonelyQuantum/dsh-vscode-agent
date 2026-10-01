# Community preview release checklist

English | [中文](RELEASING.zh.md)

This reference covers the Windows x64 VSIX owned by this community fork, not upstream npm or Desktop releases. Packaging and verification do not publish, create tags, or upload credentials. Public distribution requires a separate maintainer decision.

## Version policy

The extension version is owned by `extension.manifest.json`; the workspace `package.json` version follows DSH independently. Until the first public release, keep the extension at `0.0.1`. Ordinary commits and local builds do not increment it; accumulate changes under `Unreleased` in the [change log](CHANGELOG.md).

For a public release, choose the release version, update the manifest, change log and versioned examples, and commit those changes before tagging. Build and validate that commit, then tag it as `vscode-v<version>` to distinguish extension releases from upstream DSH releases. After publication, use a new version for each subsequent public release, including previews; never replace an existing release with different contents under the same version.

## Build and inspect

Build the repository with `pnpm.cmd run build`, then run `pnpm.cmd run package:vscode` from the repository root. The package command includes community-facing documentation, preserves license notices, marks the VSIX as pre-release and creates a `.vsix.sha256` sidecar. `pnpm.cmd run verify:vscode-release` checks staged metadata and the actual file list selected by vsce; it does not replace installed-artifact testing or a security audit.

Keep the VSIX and its checksum together. Verify the SHA-256 value before sharing the artifact. The package links documentation to the packaging branch in this fork: push its source before distributing, and do not package from a temporary private branch. The build does not send keys to any registry.

## Installed-artifact acceptance

Use the existing [artifact smoke](README.md#windows-vsix) with `--fresh-shared --ux` to test a fresh home without Desktop. Run `--security` and `--trust` separately against the same VSIX. Use a temporary home and sanitized data; verify shared credentials/models/history, both startup orders, crash recovery and final process exit. A successful package command is not editor acceptance.

Record the exact artifact checksum with the observed checks. The shared-backend implementation has local backend-level evidence; real-editor cold-start acceptance remains pending while the local VS Code update lock prevents launch. First-time shared-provider configuration has no native setup form yet. Do not mark either item complete based only on packaging or unit tests.

## Distribution decisions

- Confirm a public publisher ID and extension identity. `dsh-local` is for local previews only; `pnpm.cmd run verify:vscode-release --marketplace` rejects it. Changing publisher changes the extension identity and may separate VS Code storage and settings.
- Establish a private vulnerability-reporting channel owned by the community maintainer; do not direct private reports to an unrelated upstream maintainer.
- Review bundled dependency licenses, upstream notices and corresponding-source obligations. Retain upstream copyrights. The repository-wide notice is not a certification that a community distributor has every required permission.
- Confirm provider onboarding, privacy disclosure and feedback-sharing behavior with the intended audience. Custom plugins can change the default data handling.
- Select GitHub VSIX preview, Marketplace, or Open VSX explicitly. Do not publish unsupported platform targets or claim acceptance in a registry that has not been tested.

The [official VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) owns current publisher registration and authentication requirements. Keep publisher credentials outside the repository and chat. This repository supplies no unattended publishing workflow, and this checklist does not authorize uploading the artifact.
