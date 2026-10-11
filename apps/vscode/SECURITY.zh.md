# 社区扩展安全说明

[English](SECURITY.md) | 中文

本策略适用于 LonelyQuantum 维护的 DSH Agent 社区扩展，不代表 DeepSeek、OpenAI 或其安全团队。本地存储及数据共享行为见[隐私说明](PRIVACY.zh.md)。

## 私密报告漏洞

请使用此仓库的[私密漏洞报告入口](https://github.com/LonelyQuantum/dsh-vscode-agent/security/advisories/new)。GitHub Private Vulnerability Reporting 已启用。报告仅向报告者及获授权的安全公告协作者共享，不会作为公开 Issue 发布。需要 GitHub 账户，无需单独的邮箱地址。详见 [GitHub 报告指南](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)。

请说明受影响的扩展及打包 DSH 版本、操作系统、预期的安全限制、实际影响及最小复现步骤。使用临时工作区和合成数据。仅在必要时附上脱敏日志或小型概念验证；不要上传 API 密钥、账户令牌、完整 Harness home、私有源文件或对话历史。

仅测试你拥有或获得授权的系统及数据。协调披露前不要公开利用细节。如果报告也影响上游 DSH，社区维护者可以通过约定的私密渠道与上游协调；不要将私密报告发送给无关的维护者或公开 Issue。

## 支持范围

维护者会在文档列明的受支持平台上调查最新社区预览版。欢迎报告旧版本问题，但项目不承诺回移修复、响应时限或漏洞奖金。Auto 审查属于默认禁用的实验功能；此预览版不是安全认证。

普通配置和产品问题请通过[公开问题跟踪器](https://github.com/LonelyQuantum/dsh-vscode-agent/issues)提交脱敏后的复现步骤。如果私密报告表单不可用，可以在那里询问私密联系方式，但不要包含漏洞细节或敏感数据。
