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

[补丁](cordis.patch.yml)插入 `ui-vscode`。manifest（元数据清单）将该插件声明为依赖，使共享 profile 解析器能够解析其 Host 入口和客户端包。包入口没有额外运行时副作用。

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

间接通过作为普通用户输入提交的[编辑器上下文引用](../../client/ui-vscode/README.zh.md#model-experience)。

#### KV Cache 影响

提交的上下文增加用户输入 token；模型组合仍由底层 profile 负责。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

此组合包不是独立应用。

- 它同时需要 Web 组合和 VS Code 宿主。
- 开发预览仍从源码仓库解析运行时包。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套检查。补丁不增加独立可变的 Host 状态；扩展的真实应用冒烟测试检查其组合。
