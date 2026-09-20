# DSH VS Code 开发预览

[English](README.md) | 中文

此开发预览在 DSH Activity Bar 视图中打开单栏 DSH 对话。它使用现有 DSH Web 运行时和 Conversation 工厂来实现 [VS Code 开发计划](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.zh.md)。Windows x64 支持本地 VSIX 预览；发行验收仍未完成。

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

<a id="windows-vsix"></a>
## Windows VSIX 预览

构建共享应用后，运行 `pnpm.cmd run package:vscode`。本地产物为 `apps/vscode/lib/dsh-vscode-agent-0.0.1-win32-x64.vsix`；通过 VS Code 的 **扩展: 从 VSIX 安装** 命令安装。打包使用本地 npm tarball 和隔离的生产依赖安装，包含必需的 peer 和 Client 注入包。包内包含共享 Web 组合及其 Office 转换依赖，不包含 Desktop 的 Electron 外壳、Python/Office skills 载荷、Node 或 pnpm 分发。产物约 175 MiB；仍需兼容的外部 Node。不执行 Marketplace 发布或签名。

打包的客户端资源与 DSH 包记录匹配版本。`runtime.json` 记录平台、架构、包版本和生产锁文件摘要。启动器拒绝版本或平台不匹配，打包元数据无效时不会回退到源码仓库。`dsh.repositoryPath` 仅适用于源码开发。构建只替换自己生成的扩展暂存目录；重新构建前请停止开发窗口。

产物冒烟测试将 VSIX 安装到仓库外的临时扩展目录并检查已安装文件：`node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe" --vsix apps/vscode/lib/dsh-vscode-agent-0.0.1-win32-x64.vsix`。它不会修改用户日常使用的 VS Code 安装。

<a id="editor-context"></a>
## 编辑器上下文

工具栏显式捕获活动文件、选区或当前 Problems。文件快照包含规范化的工作区相对路径、语言、文档版本、未保存标记、从零开始且末端不包含的范围，以及编辑器中的确切文本。Problems 包含当前报告的诊断，不会重新分析，也不保证诊断对应的文档版本。未保存文件必须已在工作区内有磁盘路径；拒绝未命名文档和符号链接逃逸。引用 chip 以只读文档预览完整 JSON；仅在提交时，共享输入框才将相同文本序列化为普通用户输入。复制或恢复草稿保留快照文本，不会重新读取文件。

`dsh.contextMaxBytes` 默认为每份完整序列化快照 65,536 个 UTF-8 字节；`dsh.contextMaxProblems` 默认为 100 条诊断。超限捕获直接拒绝，不截断。捕获期间修改草稿、切换会话或释放视图会阻止延迟插入。仅捕获不会写入工作区文件，也不会发送模型输入。

## 运行时与传输

文件链接仅在当前查看的会话目录和规范化文件属于此工作区时，才在原生编辑器的指定行打开。改动文件卡片使用 DSH 捕获的完整前后版本打开只读 `vscode.diff` 标签页，两侧合计最多 4 MiB。新建和删除文件不存在的一侧为空，并由标题明确标注。重命名使用 DSH 的旧路径和新路径快照；捕获也可能包含用户同时编辑的内容，并非仅归因于 Agent。拒绝二进制和超大文件对比。捕获随 Host 会话或运行时结束而过期；已打开的标签页保留其副本直到关闭。不提供应用或回退操作。

扩展宿主管理一个 Node 子进程，使用从共享 Web 配置派生的 `vscode` profile。每个工作区路径在扩展的 VS Code 全局存储中拥有独立的 Harness 主目录，不与桌面版共享会话。关闭面板会释放其 HTTP 请求和 socket，但保留子进程；`DSH: Stop Agent Runtime`、`DSH: Restart Agent Runtime` 和扩展退出会等待进程退出。扩展宿主意外退出时，通过 IPC 断开请求子进程关闭。

子进程监听临时 IPv4 回环端口。启动 token 仅通过私有 IPC 传输；扩展宿主用它交换 HTTP-only cookie。Webview 使用限制路由的 `postMessage` HTTP 和 WebSocket 适配器，不接收启动 URL 或 cookie。Gateway 保留业务协议及流分帧。HTTP 响应按需逐步读取；上传请求经过缓冲，单次超过 8 MiB 时会在转发前被拒绝。

插件图事件使用 `eventsource` 库经同一带认证的 Fetch 桥接传输，仅允许 `/plugins/events`。适配器在流错误或 EOF 后重连；关闭时中止请求并取消待执行的重试。认证保留在 Extension Host。SSE 解析和重试语义由该库负责，扩展不维护第二套事件解析器。

静态资源使用 VS Code 资源 URL。开发 CSP 允许 `unsafe-eval`，因为仓库内的 Cordis 配置 loader 在客户端启动时构造函数。它不允许任意内联脚本或直接连接回环地址。移除此例外或验证其发行安全性仍属于 P0 安全决策，并非绕过认证的手段。

## 验证

编辑器界面支持将键盘焦点移入历史记录，并用 Escape 返回历史按钮。宿主样式表将主要背景、文字、边框和字体 token 映射到 VS Code，增加高对比度焦点边框，并遵循减少动态效果设置。运行时意外退出会显示本地化重启提示并释放旧连接；重新打开会启动新的所属进程，不自动重发输入。页面错误诊断仅携带失败标记，不携带原始异常文本。

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

显式追加 `--live-home "C:/path/to/desktop/home"` 会使用该主目录管理的 `DEEPSEEK_API_KEY` 引用，启用付费真实模型检查。此选项支持默认 DeepSeek 路由，不复用自定义提供方设置或 OAuth 记录。密钥仅传入临时测试进程环境；测试通过真实 Webview 提交未保存选区，使用 DSH 解码器读取生成的持久化日志，并取消第二轮。不会复制凭据或桌面会话。已录制的 `vscode-editor-context` 场景还通过 `apps/web/tests/vscode-submission.e2e.ts` 无密钥回放不可变上下文提交。

在真实模型检查中再追加 `--interactions`，会上传二进制字节、将排队消息转为 steering、在只读权限下请求写文件、授予“允许一次”、打开原生 diff、核对捕获文档和下载文件字节，并回答 `ask_user_question` 选项。随后重启运行时，要求同一批已提交消息各恢复一次。所有写入均限定在临时工作区。

将 `--faults` 与 `--live-home` 一起使用，会选择故障验证而非普通真实模型流程。测试检查插件事件通道、停用并恢复临时 profile 的布局插件、断开已建立的 Gateway 连接，并在真实 shell 工具子进程报告就绪后终止所属运行时。模型检查使用所选 DeepSeek 凭据。结果写入已忽略的 `apps/vscode/lib/fault-results*.json`；任何用例失败都会在清理后使命令失败。`--fault-case plugins`、`--fault-case reconnect` 或 `--fault-case crash` 可选择单个领域。`--faults --fault-case plugins` 不需要 `--live-home` 或模型请求，并将实际 Host 启用状态与 UI 挂载数量和 `tests/expected/plugin-lifecycle.json` 比对。

## 已知限制

仅允许单个已信任的本地文件夹，拒绝 Remote SSH/WSL、虚拟工作区和多根工作区。同一文件夹的并发窗口、Windows 以外的操作系统及信任状态变化尚未完成集成验证。不要对同一文件夹同时打开两个此预览。

工具栏提供新建对话、当前工作区历史和原生 API 密钥配置。上次选中的会话保留在 Webview 状态中，仅当它仍属于此工作区且未归档时恢复。Windows 源码预览故障测试验证了空闲 Gateway 重连后保留草稿和历史且下一轮模型请求正常，以及 shell 工具运行中终止运行时后子进程退出、显式重启、消息恢复且工具不重复执行。这些检查不代表长期断网、活动流期间重连、所有工具类别或打包 VSIX 的模型故障路径已通过验收。压缩（compaction）和媒体下载 UI 仍未验证。

Windows 源码预览和隔离安装 VSIX 的无密钥检查均验证了停用和启用布局插件会移除并重新挂载恰好一个 UI，而不替换 Webview。适配器测试覆盖分块 UTF-8 事件、流错误及 EOF 后重连、路由拒绝和关闭取消。模型轮次运行中重新构建插件源码仍未验证。
