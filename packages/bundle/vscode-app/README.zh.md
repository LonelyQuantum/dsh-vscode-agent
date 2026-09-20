---
description: "加入 VS Code 预览私有 Web profile 的编辑器展示层；组合方式及宿主要求。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-vscode-app

[English](README.md) | 中文

## 概述

在 VS Code 侧栏中使用 DSH 对话，同时保留共享 agent（智能体）运行时。扩展将此层加入其从 Web 派生的私有 profile。普通 Web 和 Desktop profile 不包含此层。其客户端展示需要编辑器启动桥接。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

启动 [VS Code 开发预览](../../../apps/vscode/README.zh.md)。启动器在私有 `vscode` profile 的 `base` 和 `web-app` 之后加入此内置组合包。不要将其加入纯浏览器 profile：那里没有编辑器管理的工作区和原生凭据命令。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部结构——点击展开</summary>

[补丁](cordis.patch.yml)插入编辑器布局和 Host 提示词贡献，禁用浏览器打开、URL 打印及 Web 专属模型界面说明。Host 入口通过共享 system-prompt 注册表提供 VS Code 界面描述；释放插件会移除该节。运行时与客户端依赖通过共享 profile 安装解析。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [编辑器展示](../../client/ui-vscode/README.zh.md)——导航和布局。
- [Web 应用](../web-app/README.zh.md)——底层应用组合。
- [Profile 解析](../../boot/app-boot/README.zh.md)——有序组合包层。

-----

<a id="model-experience"></a>
## 模型体验

### 编辑器界面说明

#### 模型看到的内容

`app:vscode-surface` 系统节标识编辑器界面，说明编辑器缓冲区和 Problems 不会隐式可见，并描述显式快照与原生只读审查。不包含回环 URL 或凭据。[编辑器上下文引用](../../client/ui-vscode/README.zh.md#model-experience)单独作为普通用户输入进入。已录制的 `vscode-editor-context` 场景固定组合后的提示词，并回放上下文提交。

##### VS Code 界面说明节

```markdown
You are interacting with the user through the DeepSeek Harness VS Code extension in a trusted local workspace. The conversation runs inside the editor, not in a standalone browser page. You have no implicit access to the active editor, selections, unsaved buffers, or Problems. Explicitly attached editor snapshots are user-provided context captured at the stated document version; they can differ from the current file on disk. Do not claim to see later editor changes without new evidence. File links and captured change comparisons can open in the native editor. Change comparisons are read-only and their captures expire when the Host session or runtime ends. Native review does not apply or revert edits. Use the existing conversation for approvals and questions. Do not start a replacement web server to update this interface.
```

#### Token 影响

模型请求包含一个静态系统节。编辑器快照仅在提交时增加独立的用户输入 token。

#### KV Cache 影响

静态界面说明在不同工作区和轮次间保持相同。显式上下文增加用户输入 token；模型选择仍由底层 profile 负责。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

此组合包不是独立应用。

- 它同时需要 Web 组合和 VS Code 宿主。
- 开发启动器使用源码仓库；Windows VSIX 携带匹配版本的运行时。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套检查。补丁不增加独立可变的 Host 状态；扩展的真实应用冒烟测试检查其组合。
