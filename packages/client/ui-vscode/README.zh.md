---
description: "VS Code 宿主中的 DSH 单栏对话；工作区选择、历史记录及共享 Conversation 组合的参考。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-vscode

[English](README.md) | 中文

## 概述

在窄版编辑器侧栏中打开对话、新建对话，或从当前工作区的历史记录恢复对话。上次选中的会话仍属于该工作区且未归档时，会恢复该选择。消息和输入控件使用共享 Conversation 实现。此展示需要 VS Code 宿主；普通 Web 和 Desktop profile 保留各自布局。

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

打开历史记录会将键盘焦点移到返回控件。Escape 关闭历史记录并将焦点恢复到工具栏按钮，不修改草稿。

在狭窄编辑器列中，消息可使用完整文本记录宽度，两侧各留 12 px。原生宿主为消息、输入框、菜单、代码和滚动条提供 VS Code 配色；浏览器组合保留自身主题。

[VS Code 预览](../../../apps/vscode/README.zh.md)在 Web 组合包之后加入[编辑器组合包](../../bundle/vscode-app/README.zh.md)。它挂载以下配置行，无需插件配置：

```yaml
- name: '@deepseek-ai/dsh-client-ui-vscode'
```

宿主在客户端启动前提供已信任的本地工作区。历史记录排除已归档会话和其他工作区的会话。新建对话使用共享工作区导航策略，包括复用已有空白会话。API 密钥按钮打开原生密码输入框；密钥不会进入此客户端插件。

通过工具栏显式附加文件、选区或 Problems。每个引用 chip 包含宿主生成的不可变快照；点击后以只读方式预览将提交的确切文本。复制或恢复草稿保留该文本。如果捕获完成前草稿版本变化、切换会话或关闭视图，则拒绝插入。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部结构——点击展开</summary>

插件选择优先级更高的根节点内容，同时保留 Web 布局的声明和服务。其允许无会话状态的子节点渲染 `conversation.content`，不重复实现会话投影、工具渲染或输入框。启动等待两份远程基线就绪后再解析工作区成员关系。dispose（资源释放）移除订阅，并阻止延迟返回的工作区结果改变导航。启动失败保持可见，直到用户重试。

宿主只在 Webview 状态中保存选中的会话 id。会话控制器仍是对话数据的真源。参见[注册](src/client/index.ts)和[展示](src/client/Conversation.tsx)。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Conversation](../ui-conversation/README.zh.md)——共享内容和输入。
- [工作区导航](../ui-workspace/README.zh.md)——会话创建和选择。
- [Slot 架构](../../../docs/subsystems/slots.zh.md)——声明和工厂。

-----

<a id="model-experience"></a>
## 模型体验

间接通过[编辑器宿主的显式快照](../../../apps/vscode/README.zh.md#editor-context)，将其原样序列化到共享输入框记录的用户输入中。

#### KV Cache 影响

只有提交的快照增加用户输入 token；捕获和预览本身不向模型发送内容。已有请求前缀不变。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

支持的工作区类型由编辑器宿主决定。

- 原生文件只允许在宿主的工作区内打开；捕获差异需要原始 Host 会话仍存活。
- 不渲染独立设置面板；凭据配置使用宿主的原生命令。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套检查。此展示不拥有会话事件或独立产生的运行时观测；启动及渲染测试直接检查导航和资源释放。
