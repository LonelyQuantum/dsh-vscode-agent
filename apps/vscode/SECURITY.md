# Community extension security

English | [中文](SECURITY.zh.md)

This policy covers the DSH Agent community extension maintained by LonelyQuantum. It does not represent DeepSeek, OpenAI or their security teams. Use the [privacy notice](PRIVACY.md) for storage and data-sharing behavior.

## Report a vulnerability privately

Use this repository's [private vulnerability report](https://github.com/LonelyQuantum/dsh-vscode-agent/security/advisories/new). GitHub Private Vulnerability Reporting is enabled. The report is shared with the reporter and authorized advisory collaborators, not posted as a public Issue. A GitHub account is required; no separate email address is needed. See [GitHub's reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

Describe the affected extension and bundled DSH versions, operating system, expected security restriction, observed impact and minimal reproduction steps. Use a temporary workspace and synthetic data. Include sanitized logs or a small proof of concept only when needed; never upload API keys, account tokens, a complete Harness home, private source files or conversation history.

Test only systems and data you own or have permission to test. Do not publish exploitation details before coordinated disclosure. If the report also affects upstream DSH, the community maintainer can coordinate with upstream through an agreed private channel; do not send private reports to an unrelated maintainer or public Issue.

## Support scope

The maintainer investigates the latest community preview on its documented supported platform. Reports about older versions remain welcome, but the project does not promise backported fixes, a response deadline or a bounty. Auto review is experimental and disabled by default; this preview is not a security certification.

Report ordinary setup and product bugs through the [public issue tracker](https://github.com/LonelyQuantum/dsh-vscode-agent/issues) with sanitized reproduction steps. If the private reporting form is unavailable, ask there for a private contact without including vulnerability details or sensitive data.
