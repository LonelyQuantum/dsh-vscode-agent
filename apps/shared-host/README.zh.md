---
description: "Desktop 与 VS Code 共用的本地后台所有权和原生客户端租约。"
kind: "package-library"
---

# @deepseek-ai/dsh-shared-host

[English](README.md) | 中文

## 摘要

Desktop 和 VS Code 为每个规范化 Harness 主目录连接同一个 Desktop profile 进程。两端共享模型提供方配置、凭据存储、已安装插件、工作区和会话持久化，不复制数据。任一应用都能初始化空主目录并启动后台。关闭一个应用只释放其租约；最后一个租约释放后关闭 profile。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办事项](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

原生 Desktop 宿主和 Extension Host 调用 `./client` 的 `acquireSharedHost`。两端均提供自身可信的运行时位置；VS Code 仅在冷启动时解析 Node 可执行文件。共享 Node Host 调用 `./server` 的 `serveSharedHost`，在所有者锁内初始化缺失的 profile 文件，再通过正常的 `dsh` profile 运行器启动。本库不是 Cordis 插件，也不是应用入口。

任一客户端均无需等待另一端先运行。两端必须使用相同 DSH 版本和 Harness 主目录。已有 profile 文件保持不变；扩展隔离主目录仍保持独立，不会被自动移动、合并或删除。目录选择和独立模式命令见[扩展设置](../vscode/README.zh.md)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

主目录中的私有 `.shared-host` 目录保存不含凭据的启动器和临时认证端点。POSIX 权限和 Windows 仅所有者访问规则保护发现数据。启动文件锁串行化原生启动器；后台写入锁持续到 profile 关闭。现有锁实现拒绝不明确的所有者，并恢复已退出进程持有的锁。

回环控制 socket 要求随机 bearer token、完全匹配的产品及协议版本，以及原生客户端角色。拒绝带浏览器 Origin 的请求。应用流量使用现有认证 HTTP 和 Gateway API。模型提供方密钥不会复制到 VS Code 设置或 Webview。Platform 账户凭据仅发送给 Desktop 租约。

Desktop 更新保留独占访问权，其他原生客户端仍连接时拒绝更新。profile 恢复需要同时取得启动锁和写入锁。原生进程消失会释放其 socket 租约；已启动但无人连接的后台具有有界启动生命周期。原生客户端报告意外断连，不重发用户消息；重新连接会取得新租约，并重新打开持久化会话。

本库不注册运行时 invariant 插件：它管理 Cordis 图之外的原生进程资源。租约测试观察监听器关闭和应用清理；Desktop 共享后台验证在临时主目录中检查已构建 profile、冷启动和崩溃恢复。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Desktop](../desktop/README.zh.md)——profile 与打包运行时所有权。
- [VS Code](../vscode/README.zh.md)——编辑器集成与配置。
- [原子文件锁](../../packages/util/atomic-write/README.zh.md)——已退出所有者恢复。

-----

<a id="model-experience"></a>
## 模型体验

无。本库不添加模型提示词、工具或会话事件；共享 Desktop profile 保留既有模型行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办事项

- 仅支持本地同账户客户端；不支持远程扩展宿主。
- 编辑器冷启动优先使用已保存且兼容、Office 载荷仍存在的 Desktop 启动器。没有该载荷时，编辑器启动自身运行时；随后连接 Desktop 不会热安装其可选 Office/Python 资源。关闭两端后启动 Desktop 可启用这些资源。
- 后台崩溃后需要显式重新连接或重启应用。本库不是常驻后台服务。
- 不自动导入旧版扩展的隔离历史。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
