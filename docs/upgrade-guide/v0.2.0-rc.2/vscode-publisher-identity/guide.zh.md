---
kind: upgrade-guide
description: "社区 VS Code 预览版更改发布者身份，不再使用本地预览版的私有存储。"
---

# 社区 VS Code 发布者身份

[English](guide.md) | 中文

## 变更

社区扩展清单将 `LonelyQuantum` 设为作者名及预定发布者。规范扩展 ID 从 `dsh-local.dsh-vscode-agent` 变为 `lonelyquantum.dsh-vscode-agent`，开发版本仍为 `0.0.1`。这影响本地预览版安装，不影响上游 Desktop 或 npm 包；Marketplace 账号的注册及归属仍未验证。

VS Code 将新 ID 视为另一个扩展。共享 Harness home 保留密钥、提供方配置及对话。扩展私有存储（包括隔离模式 home）不会自动迁移。`dsh.*` 设置名保持不变。

## 迁移

1. 记录 `dsh.desktopHome` 设置中的共享 home 绝对路径。如果使用过隔离模式，先通过 `DSH: Stop Agent Runtime` 停止其运行时，在移除旧安装前备份旧扩展 `globalStorage/dsh-local.dsh-vscode-agent` 目录中的 home。
2. 安装新 VSIX 前，在所有 VS Code 窗口中禁用 `dsh-local.dsh-vscode-agent`。不要同时启用两种身份：它们提供相同的 DSH 命令及视图。确认备份和新扩展前，请保留已禁用的旧安装。
3. 打开新扩展，必要时运行 `DSH: Connect Shared Desktop Backend` 并选择同一个共享 home。仅此身份变更不需要复制密钥或重启 Desktop。
4. 确认 VS Code 将已启用的扩展标识为 `lonelyquantum.dsh-vscode-agent`，且共享会话列表可用。隔离模式历史仍保存在备份的旧 home 中，新扩展不会导入该历史。
