---
description: "Single-column DSH conversations for the VS Code carrier; read this for workspace selection, history, and shared Conversation composition."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-vscode

English | [中文](README.zh.md)

## Summary

Open a conversation in a narrow editor sidebar, start another conversation, or resume one from the current workspace's history. The last selected Session is restored when it still belongs to that workspace and is not archived. Messages and input controls use the shared Conversation implementation. This presentation requires the VS Code carrier; ordinary Web and Desktop profiles retain their layouts.

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

The [VS Code preview](../../../apps/vscode/README.md) adds the [editor bundle](../../bundle/vscode-app/README.md) after the Web bundle. It mounts this row without plugin configuration:

```yaml
- name: '@deepseek-ai/dsh-client-ui-vscode'
```

The carrier supplies its trusted local workspace before Client boot. History excludes archived Sessions and other workspaces. New conversation uses the shared workspace navigation policy, including reuse of an existing blank Session. The API key button opens the native password input; no key enters this Client plugin.

Attach file, selection, or Problems explicitly from the toolbar. Each reference chip contains the carrier's immutable snapshot; clicking it opens a read-only preview of the exact submitted text. Copying or restoring the draft preserves that text. Capture is rejected if the draft revision changes, the Session changes, or the view closes before it finishes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin selects a higher-priority root occupant while retaining the Web layout's declarations and services. Its session-optional child renders `conversation.content`; it does not duplicate Session projection, tool rendering, or the composer. Startup waits for both remote baselines before resolving workspace membership. Disposal detaches subscriptions and prevents a late workspace result from changing navigation. Failed startup remains visible until retry.

The carrier stores only the selected Session id in Webview state. The Session controller remains authoritative for conversation data. See [registration](src/client/index.ts) and [presentation](src/client/Conversation.tsx).

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Conversation](../ui-conversation/README.md) — shared content and input.
- [Workspace navigation](../ui-workspace/README.md) — Session creation and selection.
- [Slot architecture](../../../docs/subsystems/slots.md) — declarations and factories.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the [editor carrier's explicit snapshots](../../../apps/vscode/README.md#editor-context), serialized unchanged into the shared composer's logged user input.

#### KV Cache effect

Only submitted snapshots add user-input tokens; capture and preview alone send nothing to the model. Existing request prefixes are unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The editor carrier defines the supported workspace types.

- Native files are admitted only inside the carrier's workspace; captured diffs require the original live Host Session.
- No independent settings panel is rendered; credential setup uses the carrier's native command.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This presentation owns no Session events or independently produced runtime observations; its startup and rendering tests check navigation and disposal directly.
