---
description: "Editor presentation layer added to the VS Code preview's private Web profile; composition and carrier requirements."
kind: "package-bundle"
---

# @deepseek-ai/dsh-vscode-app

English | [中文](README.zh.md)

## Summary

Use DSH conversations with an isolated editor profile when you do not want to share Desktop data. The extension adds this layer only in `isolated` mode. Default `shared` mode uses the Desktop profile without this bundle; the Web composition supplies the bridge-gated editor presentation.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Start the [VS Code development preview](../../../apps/vscode/README.md). In `isolated` mode, its launcher adds this in-box bundle after `base` and `web-app` in the private `vscode` profile. Do not add it to a browser-only profile: the editor-owned workspace and native credential command are unavailable there.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) inserts a Host prompt contribution; the Web bundle owns the editor layout. It disables browser opening, URL printing, and the Web-specific model orientation. The Host entry contributes the VS Code surface description through the shared system-prompt registry; disposal removes that section. Runtime and Client dependencies resolve through the shared profile installation.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Editor presentation](../../client/ui-vscode/README.md) — navigation and layout.
- [Web application](../web-app/README.md) — underlying application composition.
- [Profile resolution](../../boot/app-boot/README.md) — ordered bundle layers.

-----

<a id="model-experience"></a>
## Model Experience

### Editor surface orientation

#### What the model sees

The `app:vscode-surface` system section identifies the editor interface, states that editor buffers and Problems are not implicitly visible, and describes explicit snapshots and read-only native review. No loopback URL or credential is included. [Editor context references](../../client/ui-vscode/README.md#model-experience) enter separately as ordinary user input. The recorded `vscode-editor-context` scenario pins the assembled prompt and replays context submission.

##### VS Code surface section

```markdown
You are interacting with the user through the DeepSeek Harness VS Code extension in a trusted local workspace. The conversation runs inside the editor, not in a standalone browser page. You have no implicit access to the active editor, selections, unsaved buffers, or Problems. Explicitly attached editor snapshots are user-provided context captured at the stated document version; they can differ from the current file on disk. Do not claim to see later editor changes without new evidence. File links and captured change comparisons can open in the native editor. Change comparisons are read-only and their captures expire when the Host session or runtime ends. Native review does not apply or revert edits. Use the existing conversation for approvals and questions. Do not start a replacement web server to update this interface.
```

#### Token effect

One static system section is included in model requests. Editor snapshots add separate user-input tokens only when submitted.

#### KV Cache effect

The static surface section remains identical across workspaces and turns. Explicit context adds user-input tokens; model selection remains with the underlying profile.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

This bundle is not an independent application.

- It requires both the Web composition and the VS Code carrier.
- The development launcher uses the checkout; the Windows VSIX carries a version-matched runtime.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The patch adds no independently mutable Host state; the extension's real-application smoke checks its composition.
