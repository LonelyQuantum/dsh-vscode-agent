# DSH Agent — 社区预览

[English](MARKETPLACE.md) | 中文

在 VS Code 右侧边栏与 coding agent（编程智能体）对话，附加编辑器选中文字和 Problems，并检查文件改动。此社区扩展基于 DeepSeek Harness；它不是 DeepSeek 或 OpenAI 的官方产品，与这两家公司均无隶属关系。

## 环境要求与安装

此预览面向 Windows x64、桌面版 VS Code 1.106 及以上版本，以及外部 Node `^22.19.0 || >=24.0.0`。不支持 Remote SSH/WSL、虚拟文件夹和多根工作区。模型提供方可能收取 API 使用费用。

通过 **Extensions: Install from VSIX** 安装 Windows VSIX，打开一个受信任的本地文件夹，再运行 **DSH: Open Agent**。若 VS Code 保存的位置导致 DSH 出现在左侧，请使用 **Move View → Secondary Side Bar**。如果编辑器的 PATH 中没有 Node，请将 `dsh.nodePath` 设置为兼容 Node 可执行文件的绝对路径。

## 配置提供方

默认使用共享模式。此扩展或匹配的新版 Desktop 均可启动后端，无需让 Desktop 保持运行。要复用已有密钥、API 地址、模型及对话，请运行 **DSH: Connect Shared Desktop Backend**，选择与 Desktop 相同的 Harness home。两个应用必须使用相同的 DSH 版本。未发送的草稿不会共享。

空的共享 home 可以在没有 Desktop 时启动，但此预览尚未提供原生的共享提供方配置表单。请单独配置该 home 的提供方，或在 **DSH: Configure API** 中选择私有 API 选项，使用隔离模式。该选项将密钥存入 VS Code SecretStorage，并创建独立的工作区历史记录；它不会配置或合并共享 home。

不要将密钥粘贴到聊天、源文件或问题报告中。[隐私与数据处理说明](PRIVACY.zh.md)介绍了本地存储、模型请求和反馈授权的上传行为。

## 使用对话

初始列表显示当前工作区的对话；如果当前工作区没有对话，则显示全部对话。在底部输入框发送消息即可开始对话。左上角返回按钮会回到列表，不会停止任务。加号菜单用于添加文件和图片，上下文按钮用于附加选中文字及 Problems。

工具权限约束模型操作；授权前请检查审批提示和文件差异。受信任的 agent 可依据所选权限读取文件、执行命令及修改工作区。仅启用你信任的插件。后端崩溃后请使用 **DSH: Restart Runtime**；扩展不会自动重发消息。

## 预览限制与支持

VSIX 包含 Node Host 和客户端资源，不包含 Electron、Node、pnpm 或 Desktop 的 Python/Office 技能资源。Desktop 专属 Office/Python 资源需要兼容的桌面运行时。此版本是社区预览，不是安全认证，也不保证任意插件都安全。

请向[社区问题跟踪器](https://github.com/LonelyQuantum/dsh-vscode-agent/issues)报告可复现的问题，附上版本和脱敏后的复现步骤；移除密钥、账户令牌、本机 home 路径、对话内容和私有文件。另见[更新记录](CHANGELOG.zh.md)、[开发者说明](README.zh.md)和[发布清单](RELEASING.zh.md)。
