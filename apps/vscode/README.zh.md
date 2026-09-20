# DSH VS Code 开发预览

[English](README.md) | 中文

此源码仓库开发预览在 DSH Activity Bar 视图中打开单栏 DSH 对话。它使用现有 DSH Web 运行时和 Conversation 工厂来实现 [VS Code 开发计划](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.zh.md)；它不是可安装的发行版。

## 启动预览

需要桌面版 VS Code 1.100 或更新版本、一个已信任的本地文件夹，以及 PATH 中满足 `^22.19.0 || >=24.0.0` 的 Node。在仓库根目录先构建共享应用，再构建扩展：

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run dev:vscode
```

`dev:vscode` 构建扩展，并通过 PATH 中的 `code` 命令打开扩展开发宿主。在该窗口的 Activity Bar 打开 DSH，或在命令面板运行 `DSH: Open Agent`。中文 VS Code 显示为 `DSH: 打开 Agent`。构建产物位于 `apps/vscode/lib/extension/`；构建后可通过 `pnpm.cmd run start:vscode` 跳过构建直接启动。

此预览复用当前仓库已构建的 Host 包、已安装的依赖及复制的 Web 资源，不会另行下载一份 Node 或 pnpm。上游更新后需重新构建共享应用和扩展；移动仓库目录后需重新构建扩展或设置 `dsh.repositoryPath`。如果扩展宿主无法在 PATH 中找到兼容的 `node`，请将机器级设置 `dsh.nodePath` 指向 Node 可执行文件的绝对路径。

`DSH: 配置 API 密钥` 打开密码输入框，并将 DeepSeek 密钥保存到 VS Code SecretStorage。下次启动子进程时通过环境传入密钥，不经过 Webview 或设置。`DSH: 删除已保存的 API 密钥` 删除扩展保存的密钥；继承的环境凭据和工作区 `.env` 凭据相互独立，不受影响。更换密钥后需重启 DSH。其他模型提供方设置沿用现有 DSH Web 应用；不要把凭据写入 VS Code 设置，也不要提交 `.env` 文件。

<a id="editor-context"></a>
## 编辑器上下文

工具栏显式捕获活动文件、选区或当前 Problems。文件快照包含规范化的工作区相对路径、语言、文档版本、未保存标记、从零开始且末端不包含的范围，以及编辑器中的确切文本。Problems 包含当前报告的诊断，不会重新分析，也不保证诊断对应的文档版本。未保存文件必须已在工作区内有磁盘路径；拒绝未命名文档和符号链接逃逸。引用 chip 以只读文档预览完整 JSON；仅在提交时，共享输入框才将相同文本序列化为普通用户输入。复制或恢复草稿保留快照文本，不会重新读取文件。

`dsh.contextMaxBytes` 默认为每份完整序列化快照 65,536 个 UTF-8 字节；`dsh.contextMaxProblems` 默认为 100 条诊断。超限捕获直接拒绝，不截断。捕获期间修改草稿、切换会话或释放视图会阻止延迟插入。仅捕获不会写入工作区文件，也不会发送模型输入。

## 运行时与传输

扩展宿主管理一个 Node 子进程，使用从共享 Web 配置派生的 `vscode` profile。每个工作区路径在扩展的 VS Code 全局存储中拥有独立的 Harness 主目录，不与桌面版共享会话。关闭面板会释放其 HTTP 请求和 socket，但保留子进程；`DSH: Stop Agent Runtime`、`DSH: Restart Agent Runtime` 和扩展退出会等待进程退出。扩展宿主意外退出时，通过 IPC 断开请求子进程关闭。

子进程监听临时 IPv4 回环端口。启动 token 仅通过私有 IPC 传输；扩展宿主用它交换 HTTP-only cookie。Webview 使用限制路由的 `postMessage` HTTP 和 WebSocket 适配器，不接收启动 URL 或 cookie。Gateway 保留业务协议及流分帧。HTTP 响应按需逐步读取；上传请求经过缓冲，单次超过 8 MiB 时会在转发前被拒绝。

静态资源使用 VS Code 资源 URL。开发 CSP 允许 `unsafe-eval`，因为仓库内的 Cordis 配置 loader 在客户端启动时构造函数。它不允许任意内联脚本或直接连接回环地址。移除此例外或验证其发行安全性仍属于 P0 安全决策，并非绕过认证的手段。

## 验证

以下定向测试不需要模型提供方凭据：

```powershell
pnpm.cmd --filter @deepseek-ai/dsh-vscode run typecheck
pnpm.cmd exec vitest run apps/vscode/tests packages/client/ui-vscode/tests
```

构建后，使用已安装的 VS Code 可执行文件运行真实扩展宿主冒烟测试，替换示例路径：

```powershell
node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe"
```

此冒烟测试创建并删除自己的临时工作区和 VS Code 数据目录，仅对该隔离测试进程禁用 Workspace Trust。测试检查未保存选区和文件快照、Problems、只读预览、真实客户端启动、API 流量、插件资源、Gateway WebSocket，以及停止后所属进程退出；不会提交模型请求。

## 已知限制

仅允许单个已信任的本地文件夹，拒绝 Remote SSH/WSL、虚拟工作区和多根工作区。同一文件夹的并发窗口、Windows 以外的操作系统、工具运行期间崩溃及信任状态变化尚未完成集成验证。不要对同一文件夹同时打开两个此预览。

工具栏提供新建对话、当前工作区历史和原生 API 密钥配置。上次选中的会话保留在 Webview 状态中，仅当它仍属于此工作区且未归档时恢复。真实扩展宿主冒烟测试要求运行时重启前后均挂载此编辑器专用布局。原生文件和差异操作、独立运行时和 VSIX 打包仍在开发计划中。冒烟测试不代表已验证上下文提交回放、模型轮次、审批、反问、steering（中途引导）、压缩（compaction）、文件和媒体下载、插件图刷新或此桥接下的重连行为。这些上游能力需要扩展专属的端到端覆盖，才能将预览视为适合日常工作的工具。
