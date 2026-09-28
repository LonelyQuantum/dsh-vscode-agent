# DSH VS Code 开发预览

[English](README.md) | 中文

此开发预览在 DSH Activity Bar 视图中打开单栏 DSH 对话。它使用现有 DSH Web 运行时和 Conversation 工厂来实现 [VS Code 开发计划](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.zh.md)。Windows x64 支持本地 VSIX 预览；发行验收仍未完成。开发宿主包保持私有；VSIX 打包独立于 npm 发布。

## 启动预览

源码基线为 DSH `0.1.7-rc.2`。更新后须重新构建；已有 `0.1.6-alpha.2` VSIX 不包含新运行时。开发计划分别记录源码模型及恢复验证与打包产物验收。保留现有会话代际；用新写入器打开重要历史前，先在隔离 Harness 主目录中验证升级。

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

构建共享应用后，运行 `pnpm.cmd run package:vscode`。本地产物为 `apps/vscode/lib/dsh-vscode-agent-0.0.3-win32-x64.vsix`；通过 VS Code 的 **扩展: 从 VSIX 安装** 命令安装。打包使用本地 npm tarball 和隔离的生产依赖安装，包含必需的 peer 和 Client 注入包。包内包含共享 Web 组合及其 Office 转换依赖，不包含 Desktop 的 Electron 外壳、Python/Office skills 载荷、Node 或 pnpm 分发。生产依赖集合记录了 283 个工作区包；开发计划记录产物测量及验收结果。客户端 JavaScript 不包含构建机器的调试路径注释，但保留许可证文本；Windows VSIX 不包含 source map、本机 pnpm 记录或 POSIX 启动脚本。仍需兼容的外部 Node。不执行 Marketplace 发布或签名。

打包的客户端资源与 DSH 包记录匹配版本。`runtime.json` 记录平台、架构、包版本和生产锁文件摘要。启动器拒绝版本或平台不匹配，打包元数据无效时不会回退到源码仓库。启动器在加载模块前规范化安装路径，使 Windows 盘符别名共享 DSH 的模块状态。`dsh.repositoryPath` 仅适用于源码开发。构建只替换自己生成的扩展暂存目录；重新构建前请停止开发窗口。

产物冒烟测试将 VSIX 安装到仓库外的临时扩展目录并检查已安装文件：`node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe" --vsix apps/vscode/lib/dsh-vscode-agent-0.0.3-win32-x64.vsix`。它不会修改用户日常使用的 VS Code 安装。

<a id="editor-context"></a>
## 编辑器上下文

工具栏显式捕获活动文件、选区或当前 Problems。文件快照包含规范化的工作区相对路径、语言、文档版本、未保存标记、从零开始且末端不包含的范围，以及编辑器中的确切文本。Problems 包含当前报告的诊断，不会重新分析，也不保证诊断对应的文档版本。未保存文件必须已在工作区内有磁盘路径；拒绝未命名文档和符号链接逃逸。引用 chip 以只读文档预览完整 JSON；仅在提交时，共享输入框才将相同文本序列化为普通用户输入。复制或恢复草稿保留快照文本，不会重新读取文件。

`dsh.contextMaxBytes` 默认为每份完整序列化快照 65,536 个 UTF-8 字节；`dsh.contextMaxProblems` 默认为 100 条诊断。超限捕获直接拒绝，不截断。捕获期间修改草稿、切换会话或释放视图会阻止延迟插入。仅捕获不会写入工作区文件，也不会发送模型输入。

## 运行时与传输

文件链接仅在当前查看的会话目录和规范化文件属于此工作区时，才在原生编辑器的指定行打开。改动文件卡片使用 DSH 捕获的完整前后版本打开只读 `vscode.diff` 标签页，两侧合计最多 4 MiB。新建和删除文件不存在的一侧为空，并由标题明确标注。重命名使用 DSH 的旧路径和新路径快照；捕获也可能包含用户同时编辑的内容，并非仅归因于 Agent。拒绝二进制和超大文件对比。捕获随 Host 会话或运行时结束而过期；已打开的标签页保留其副本直到关闭。不提供应用或回退操作。

扩展宿主管理一个 Node 子进程，使用从共享 Web 配置派生的 `vscode` profile。每个规范化工作区路径在扩展的 VS Code 全局存储中拥有独立的 Harness 主目录，不与桌面版共享会话。选择主目录前会解析目录 junction 和路径大小写别名。旧版按非规范化别名索引的主目录不会被自动移动或删除。关闭面板会释放其 HTTP 请求和 socket，但保留子进程；`DSH: Stop Agent Runtime`、`DSH: Restart Agent Runtime` 和扩展退出会等待进程退出。扩展宿主意外退出时，通过 IPC 断开请求子进程关闭。

子进程在初始化 profile 前为其 Harness 主目录持有上游写入锁，并在正常关闭后释放。使用同一主目录的第二个窗口会被拒绝，并显示重启提示；不同工作区主目录可以独立运行。锁记录子进程 PID，因此扩展宿主丢失后，不会在子进程仍退出中时立即允许另一个写入方进入。崩溃恢复遵循[上游锁规则](../../packages/util/atomic-write/README.zh.md)：已退出的持有者可以被接替，但不明确的记录和被复用的存活 PID 需要操作者检查。

子进程监听临时 IPv4 回环端口。启动 token 仅通过私有 IPC 传输；扩展宿主用它交换 HTTP-only cookie。Webview 使用限制路由的 `postMessage` HTTP 和 WebSocket 适配器，不接收启动 URL 或 cookie。Gateway 保留业务协议及流分帧。套接字适配器仅允许 Gateway URL 和文本帧，不协商子协议；事件监听器和事件处理属性均接收传输事件。HTTP 响应按需逐步读取；上传请求经过缓冲，单次超过 8 MiB 时会在转发前被拒绝。

插件图事件使用 `eventsource` 库经同一带认证的 Fetch 桥接传输，仅允许 `/plugins/events`。适配器在流错误或 EOF 后重连；关闭时中止请求并取消待执行的重试。认证保留在 Extension Host。SSE 解析和重试语义由该库负责，扩展不维护第二套事件解析器。

静态资源限定于 `web/`、`resources/` 和 `carrier/`；工作区、Host 入口及打包运行时都不属于 Webview 资源根目录。CSP 拒绝未列出的来源、任意内联脚本、外部连接/图片、基础 URL 更改、表单、frame 和 object。带 nonce 的脚本以及基于 blob 的插件/worker 加载仍可使用。Windows 开发预览保留 `unsafe-eval`，因为共享 Cordis 配置 loader 在客户端启动时构造函数，同时保留共享 UI 所需的内联样式。这是限定范围的预览例外，不是 XSS 安全保证，也不代表已完成 Marketplace 发行加固：已安装的 Cordis 插件属于受信任代码，启用前必须审查。

manifest（元数据清单）在受限模式中禁用 DSH。启动过程在异步读取工作区、凭据和安装信息后再次检查信任。授予信任后扩展可用；撤销信任会重启 Extension Host，释放所属运行时，并使 DSH 保持禁用。原生操作在接纳页面消息前也检查信任。真实编辑器信任检查使用独立观察扩展，不使用扩展测试生命周期，使 VS Code 能执行正常的宿主重启。

## 验证

编辑器界面支持将键盘焦点移入历史记录，并用 Escape 返回历史按钮。捕获选区后焦点回到输入框；带额外修饰键的 Enter 及输入法组合保留草稿，Shift+Enter 插入换行。宿主样式表将背景、文字、边框和字体 token 映射到 VS Code，支持亮色/暗色及两种高对比度主题，并遵循减少动态效果设置。无密钥浏览器检查覆盖 320/420 px 布局、权限菜单关闭、不可变上下文回放，以及键盘操作进程分组中的 45 个录制工具结果。运行时意外退出会显示本地化重启提示，不重发输入。页面错误诊断仅携带失败标记，不携带原始异常文本。

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

显式追加 `--live-home "C:/path/to/desktop/home"` 会使用该主目录管理的 `DEEPSEEK_API_KEY` 引用，启用付费真实模型检查。此选项支持默认 DeepSeek 路由，不复用自定义提供方设置或 OAuth 记录。密钥仅传入临时测试进程环境；测试通过真实 Webview 提交未保存选区，仅使用 DSH 解码器读取 DSH 会话目录中的日志，并取消第二轮。VS Code 自身的 JSONL 日志不在扫描范围内。不会复制凭据或桌面会话。已录制的 `vscode-editor-context` 场景还通过 `apps/web/tests/vscode-submission.e2e.ts` 无密钥回放不可变上下文提交。

在真实模型检查中再追加 `--interactions`，会上传二进制字节、将排队消息转为 steering、在只读权限下请求写文件、授予“允许一次”、打开原生 diff、核对捕获文档和下载文件字节，并回答 `ask_user_question` 选项。随后重启运行时，要求同一批已提交消息各恢复一次。所有写入均限定在临时工作区。

将 `--faults` 与 `--live-home` 一起使用，会选择故障验证而非普通真实模型流程。测试检查插件事件通道、停用并恢复临时 profile 的布局插件、断开已建立的 Gateway 连接，并在真实 shell 工具子进程报告就绪后终止所属运行时。模型检查使用所选 DeepSeek 凭据。结果写入已忽略的 `apps/vscode/lib/fault-results*.json`；任何用例失败都会在清理后使命令失败。`--fault-case plugins`、`--fault-case reconnect` 或 `--fault-case crash` 可选择单个领域。`--faults --fault-case plugins` 不需要 `--live-home` 或模型请求，并将实际 Host 启用状态与 UI 挂载数量和 `tests/expected/plugin-lifecycle.json` 比对。

另有两项真实模型测试需要显式选择：`--faults --fault-case streaming` 在模型文本开始流式输出后断开 Gateway；`--faults --fault-case rebuild` 在流式输出期间原子替换临时插件的客户端产物，观察重建事件、替换挂载及释放。两者均需要 `--live-home`，要求不重载 Webview、保留草稿及选中会话、模型正常完成，且持久化用户输入恰好一份。插件测试在报告成功前恢复其隔离 profile，并确认两代产物均已释放。该测试覆盖产物监听及客户端重载，不覆盖源码编译器。

将 `--compat-case migration`、`--compat-case auto-review` 或 `--compat-case compaction` 与 `--live-home` 一起使用，可验证一条会话路径。迁移测试创建测试专属 V3 历史，通过 V4 继续对话，并检查重启后前代字节、文件标识及修改时间不变。Auto review 仅在临时 profile 启用可选实验性组合包、确认风险弹窗，验证审查后的文件写入、进程崩溃后恢复 Auto，以及显式卸载时上游切换到 Full access 的行为。压缩测试仅降低该 profile 中标准预设的阈值，要求不使用 `/compact` 即产生自动摘要/检查点事件，并检查重启后上下文记忆。这些选项也接受 `--vsix` 以测试隔离安装；不能与 `--faults` 或 `--interactions` 组合。

在扩展宿主冒烟测试中追加 `--ux`，可在真实 Webview 中检查原生键盘路由、输入法 Enter、多行草稿、历史焦点及捕获焦点。此无密钥选项接受 `--vsix`，但不能与模型或故障选项组合。

追加 `--security` 可无密钥检查浏览器实际执行的 CSP/资源限制、子进程归属竞争及两个真实对等窗口。目录 junction 别名必须被拒绝，不同工作区则能启动；对等窗口只共享测试扩展的存储。将 `--trust` 与 `--vsix` 一起使用，可验证安装扩展从受限模式到信任后启动，再回到受限模式的周期，要求原有子进程退出。该检查在隔离的用户数据、共享数据和扩展目录中操作原生 Workspace Trust 按钮。这些选项与 `--ux`、模型和故障检查分开运行。

## 已知限制

每个窗口仅允许单个已信任的本地文件夹，拒绝 Remote SSH/WSL、虚拟工作区和多根工作区。Windows 本地信任切换和多窗口归属已完成验证；macOS/Linux 尚未验证。明确不支持对同一 Harness 主目录并发编辑，包括两个窗口使用同一文件夹别名的情况。

工具栏提供新建对话、当前工作区历史和原生 API 密钥配置。上次选中的会话保留在 Webview 状态中，仅当它仍属于此工作区且未归档时恢复。开发计划分别记录迁移、Auto review、压缩（compaction）及恢复的源码与安装产物证据。这些检查不代表长期断网、所有工具类别或媒体下载 UI 已通过验收。Auto review 仍为实验功能，默认禁用。

重启后请检查显示的权限模式。上游 [Auto review 卸载](../../packages/experimental/auto-review/README.zh.md#understand-the-implementation)会将活动 Auto 会话切换为 Full access，此模式没有逐工具审查或审批。运行时关闭可能执行该卸载；此预览不保证正常重启后仍选中 Auto。如需审查，请在继续操作前重新选择 Auto 并确认风险。

插件生命周期检查要求停用和启用布局插件时移除并重新挂载恰好一个 UI，而不替换 Webview。适配器测试覆盖分块 UTF-8 事件、流错误及 EOF 后重连、路由拒绝和关闭取消。开发计划记录活动轮次中的产物重载验收；该测试不验证源码编译。
