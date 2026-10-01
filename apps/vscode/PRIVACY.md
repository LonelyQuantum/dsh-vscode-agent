# Privacy and data handling

English | [中文](PRIVACY.zh.md)

This notice describes the community extension and the default bundled DSH profile. Custom providers, Cordis plugins, MCP servers and user configuration can change network activity and data access. Their operators have their own policies. The extension is not a service operated by DeepSeek or OpenAI.

## Local storage and access

Shared mode uses the selected Harness home's credentials, provider settings and durable conversation data; it does not copy provider keys into VS Code settings or the Webview. Isolated mode stores its configured key in VS Code SecretStorage and keeps separate per-workspace profile data under extension global storage. Uninstalling the extension does not erase the shared Harness home or provider-side records.

Conversation logs and attachments can contain source code, local paths, tool output and other sensitive content. Treat the Harness home and its backups as private. Shared access is for trusted applications running under the same operating-system account, not untrusted local users or remote clients.

## Model requests and tools

Sending a prompt can transmit messages, selected editor context, attachments, tool results and assembled agent context to the configured model provider. Capturing selected text or Problems alone does not send a model request; submission includes the captured snapshot. Tools and installed plugins can access files, run commands and contact external services according to configuration and permissions. The maintainer cannot control provider retention or guarantee that plugins redact private data.

## Feedback sharing

The bundled DSH profile defaults to feedback-only Session telemetry. New explicit feedback, ratings, edits or withdrawal can authorize uploading the conversation prefix through that feedback, including context, tool arguments/results, local working-directory paths and an anonymous home identifier. The default recipient is DeepSeek's Harness telemetry collector; configured deployments may select another endpoint. Ordinary model activity alone does not authorize this feedback upload. Provider API keys are not Session events, but secrets pasted into prompts or emitted by tools can be part of uploaded content.

The underlying profile supports disabling this telemetry with `DSH_TELEMETRY_DISABLED` set to a non-empty value before the backend starts. A running shared backend retains its startup configuration regardless of which client attaches later; close both clients before changing its startup environment. Disabling telemetry does not disable model requests, tool networking or provider retention. See the [upstream telemetry behavior](../../packages/session/session-telemetry-otel/README.md). Withdrawal of feedback is not a request that erases previously uploaded records.

## Support and disclosure

The community issue tracker is public. Do not attach raw logs, home directories or credentials. Report ordinary extension bugs with sanitized steps via the [issue tracker](https://github.com/LonelyQuantum/dsh-vscode-agent/issues). Do not post exploitable vulnerabilities or private data publicly; a private community security-contact channel must be established before public distribution.
