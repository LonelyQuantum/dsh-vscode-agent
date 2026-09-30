---
description: "Local backend ownership and native-client leases shared by Desktop and VS Code."
kind: "package-library"
---

# @deepseek-ai/dsh-shared-host

English | [中文](README.zh.md)

## Summary

Desktop and VS Code attach to one Desktop-profile process per canonical Harness home. They share provider configuration, credential storage, installed plugins, workspaces, and Session persistence without copying data. Either application can start the backend after Desktop registers its launcher. Closing one application releases its lease; the last lease shuts down the profile.

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

The native Desktop carrier and Extension Host call `acquireSharedHost` from `./client`. Desktop supplies the trusted executable paths and profile preparation callback; VS Code reuses the saved launcher. The private Desktop Host calls `serveSharedHost` from `./server` and boots the normal `dsh` profile runner. This library is not a Cordis plugin or an application entry point.

Start the updated Desktop application once before connecting VS Code. Both clients must use the same DSH version and Harness home. Existing isolated extension homes remain separate and are never moved, merged, or deleted automatically. See the [extension setup](../vscode/README.md) for selection and private-mode commands.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The home-private `.shared-host` directory stores a credential-free launcher and an ephemeral authenticated endpoint. POSIX permissions and Windows owner-only access rules protect discovery data. The startup file lock serializes native launchers; the backend's writer lock remains held through profile shutdown. The existing lock implementation refuses ambiguous owners and recovers dead processes.

The loopback control socket requires a random bearer token, exact product/protocol versions, and a native-client role. Browser Origin requests are refused. Application traffic uses the existing authenticated HTTP and Gateway APIs. Provider keys are not copied into VS Code settings or its Webview. Platform account credentials are sent only to Desktop leases.

Desktop updates reserve exclusive access and refuse while another native client is attached. Profile recovery requires both startup and writer locks. A disappearing native process releases its socket lease; an unclaimed launched backend has a bounded startup lifetime. The native client reports unexpected loss without resending a user message; reconnecting acquires a new lease and reopens durable Sessions.

The library registers no runtime invariant plugin: it owns native-process resources outside the Cordis graph. Its lease tests observe listener closure and application teardown; the Desktop shared-backend qualification exercises a built profile, cold launch, and crash recovery in a temporary home.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Desktop](../desktop/README.md) — profile and packaged runtime ownership.
- [VS Code](../vscode/README.md) — editor integration and configuration.
- [Atomic file locking](../../packages/util/atomic-write/README.md) — dead-owner recovery.

-----

<a id="model-experience"></a>
## Model Experience

None. This library adds no model prompt, tool, or Session event; the shared Desktop profile retains its existing model behavior.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Local, same-account clients only; remote extension hosts are unsupported.
- Desktop must register an installed launcher before editor-only cold launch. Moving or upgrading Desktop requires registering its launcher again.
- Backend crashes require an explicit reconnect or application restart. This is not an always-running background service.
- Earlier isolated extension history is not automatically imported.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
