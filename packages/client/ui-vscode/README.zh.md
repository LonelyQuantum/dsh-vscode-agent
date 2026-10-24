---
description: "VS Code 宿主中的 DSH 单栏对话；工作区选择、历史记录及共享 Conversation 组合的参考。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-vscode

[English](README.md) | 中文

## 概述

在窄版编辑器侧栏中打开当前工作区的会话列表。在列表页发送消息即可开始对话，也可选择已有对话继续。左上角返回按钮回到列表，不停止正在运行的任务。消息和输入控件使用共享 Conversation 实现。此展示需要 VS Code 宿主；普通 Web 和 Desktop profile 保留各自布局。

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

打开插件时，底部固定的新消息输入框上方显示当前工作区的非空、未归档会话。如果没有此类会话，则显示全部会话。发送消息会在当前工作区开始对话。返回按钮选择该工作区的空白草稿，不停止后台任务，也不会把后续输入发到上一条对话。重新打开列表中的会话会恢复其文本记录和未发送草稿。重新加载后从列表开始，不恢复上次对话。

在狭窄编辑器列中，消息可使用完整文本记录宽度，两侧各留 12 px。原生宿主为消息、输入框、菜单、代码和滚动条提供 VS Code 配色。编辑器主题类名选择不持久化的明暗注册项，包括高对比度变体，使共享卡片使用对应配色而不修改已保存的 DSH 主题偏好。普通浏览器组合保留自身主题。

已发送的用户消息使用共享内容和文本 Factory，包括 Web 组合包挂载的[凭据显示遮蔽](../ui-secret-mask/README.zh.md)。遮蔽不会从复制文本、模型输入或会话存储中删除秘密。

会话行使用共享 DSH 圆角及焦点环 token，包括键盘焦点和指针输入模式下的隐藏规则。

[Web 组合包](../../bundle/web-app/README.zh.md)为 [VS Code 预览](../../../apps/vscode/README.zh.md)挂载以下配置行，包括共享 Desktop-profile 的客户端。它仅在原生编辑器桥接存在时激活；普通浏览器与 Desktop 文档保留原有布局。无需插件配置：

```yaml
- name: '@deepseek-ai/dsh-client-ui-vscode'
```

宿主在客户端启动前提供已信任的本地工作区。两种列表都排除已归档会话、空白草稿和委派的子 Agent。列表页输入框使用共享工作区导航策略，包括复用已有空白会话。Agent 视图右上角的钥匙按钮打开原生 API 配置；底部工具栏不提供 API 设置按钮。密钥不会进入此客户端插件。

输入框的加号菜单打开共享文件选择器，用于添加文件和图片附件。底部工具栏显式捕获选区或 Problems，不提供独立的文件、历史记录或新建对话按钮。每个编辑器引用 chip 包含宿主生成的不可变快照；点击后以只读方式预览将提交的确切文本。复制或恢复草稿保留该文本。如果捕获完成前草稿版本变化、开始导航、切换会话或关闭视图，则拒绝插入。

捕获的引用插入输入框光标所在位置，不替换已选中的草稿文本。命令标签必须位于开头；如果光标在其之前，请根据提示将光标移至标签之后，再次附加。

连接的 Host 宣告其他发行版本时，编辑器提示提供**暂不处理**和**重新加载 DSH 视图**，不抢占输入焦点。共享模块系统在重新加载前保留已加载的插件图，即使仅构建提交不同也如此。重新加载读取当前启动数据，只替换编辑器页面，保留原生后台租约和运行中的任务。页面回到列表，选择会话后恢复未发送的结构化草稿，包括命令和编辑器引用标签。关闭提示并不意味着可以安全加载其他版本的插件。

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
- Web 和 Desktop 的导航菜单不属于嵌入式 Conversation Factory；插件浏览与 Creator 菜单入口保留在对应客户端中，不在编辑器内增加第二侧栏。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
