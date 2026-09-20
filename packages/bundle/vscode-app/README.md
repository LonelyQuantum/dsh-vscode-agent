---
description: "Editor presentation layer added to the VS Code preview's private Web profile; composition and carrier requirements."
kind: "package-bundle"
---

# @deepseek-ai/dsh-vscode-app

English | [中文](README.zh.md)

## Summary

Use DSH conversations in the VS Code sidebar without replacing the shared agent runtime. The extension adds this layer to its private Web-derived profile. Ordinary Web and Desktop profiles do not include it. Its Client presentation requires the editor's startup bridge.

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

Start the [VS Code development preview](../../../apps/vscode/README.md). Its launcher adds this in-box bundle after `base` and `web-app` in the private `vscode` profile. Do not add it to a browser-only profile: the editor-owned workspace and native credential command are unavailable there.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) inserts `ui-vscode`. The manifest declares that plugin as a dependency so the shared profile resolver can resolve its Host entry and Client bundle. The package entry has no additional runtime effect.

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

Indirectly, through [editor context references](../../client/ui-vscode/README.md#model-experience) submitted as ordinary user input.

#### KV Cache effect

Submitted context adds user-input tokens; model composition remains with the underlying profile.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

This bundle is not an independent application.

- It requires both the Web composition and the VS Code carrier.
- The development preview still resolves runtime packages from its source checkout.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The patch adds no independently mutable Host state; the extension's real-application smoke checks its composition.
