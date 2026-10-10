# DSH Agent — Community Preview

English | [中文](MARKETPLACE.zh.md)

Chat with a coding agent in VS Code's right sidebar, attach editor selections and Problems, and inspect file changes. This community extension is built on DeepSeek Harness; it is not an official DeepSeek or OpenAI product and is not affiliated with either company.

## Requirements and installation

The preview targets Windows x64, desktop VS Code 1.106 or newer, and an external Node `^22.19.0 || >=24.0.0`. Remote SSH/WSL, virtual folders and multi-root workspaces are unsupported. Model providers may charge for API usage.

Install the Windows VSIX using **Extensions: Install from VSIX**, open one trusted local folder, then run **DSH: Open Agent**. If DSH appears on the left because of saved VS Code placement, use **Move View → Secondary Side Bar**. Set `dsh.nodePath` to an absolute compatible Node executable when Node is not on the editor's PATH.

## Configure a provider

Shared mode is the default. Either this extension or a matching updated Desktop can start the backend; Desktop need not be running. To reuse existing credentials, API endpoints, models and conversations, run **DSH: Connect Shared Desktop Backend** and select the same Harness home as Desktop. Both applications must use the same DSH version. Unsent drafts are not shared.

An empty shared home can start without Desktop, but this preview does not yet provide a native shared-provider setup form. Provision that home's provider configuration separately, or choose the private API option under **DSH: Configure API** to use isolated mode. That option stores a key in VS Code SecretStorage and creates separate workspace history; it does not configure or merge the shared home.

Never paste keys into chat, source files or issue reports. The [privacy and data-handling notice](PRIVACY.md) explains local storage, model requests and feedback-authorized uploads.

## Work with conversations

The initial list shows conversations for the current workspace, or all conversations if none belong to it. Send a message from the bottom composer to start a conversation. The upper-left back button returns to the list without stopping its task. Use the plus menu for files and images, and the context buttons for selected text and Problems.

Tool permissions apply to model actions; review prompts and file diffs before granting access. A trusted agent can read files, run commands and modify the workspace according to its selected permissions. Enable only plugins you trust. After a backend crash, use **DSH: Restart Runtime**; the extension does not resend your message automatically.

## Preview limits and support

The VSIX includes the Node Host and client assets, not Electron, Node, pnpm or the Desktop Python/Office skills payload. Desktop-specific Office/Python resources require a compatible Desktop runtime. This is a community preview, not a security certification or a promise that arbitrary plugins are safe.

Report reproducible problems to the [community issue tracker](https://github.com/LonelyQuantum/dsh-vscode-agent/issues). Include versions and sanitized reproduction steps; remove keys, account tokens, home paths, conversation contents and private files. See the [change log](CHANGELOG.md), [developer instructions](README.md) and [release checklist](RELEASING.md).
