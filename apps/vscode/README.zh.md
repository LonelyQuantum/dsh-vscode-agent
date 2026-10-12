# DSH VS Code 开发预览

[English](README.md) | 中文

此预览在 VS Code 辅助侧边栏中打开当前工作区的会话列表。在底部固定的输入框发送消息即可开始对话；左上角返回按钮回到列表，不停止任务。加号菜单用于添加文件和图片附件。Desktop 与 VS Code 默认共享本地后台：凭据、API 地址、模型配置、插件和会话历史。Windows x64 支持本地 VSIX 预览；Marketplace 验收仍未完成。

## 启动预览

此 alpha 开发线基于 DSH `0.2.1-alpha.2`；已发布的 `0.0.1` 社区预览仍由独立的 RC 分支维护。更新后须重新构建；旧 VSIX 包含不同的运行时。通过 `dsh.desktopHome` 为 alpha 选择独立的 Harness 主目录；共享时使用本 fork 匹配的 alpha Desktop。不要用 RC 打开 alpha 写入的历史：两者都可写入会话 V4，但支持的事件不同。保留已有代际，在升级前先使用主目录副本验证。源码检查与安装产物验收分别记录。

需要桌面版 VS Code 1.106 或更新版本，以及一个已信任的本地文件夹；编辑器自行冷启动或独立模式还需要满足 `^22.19.0 || >=24.0.0` 的 Node。在仓库根目录先构建共享应用，再构建扩展：

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run dev:vscode
```

`dev:vscode` 构建扩展，并通过 PATH 中的 `code` 打开扩展开发宿主。在辅助侧边栏打开 DSH，或运行 `DSH: Open Agent`（中文为 `DSH: 打开 Agent`）。已有视图位置偏好优先生效；如有需要，使用 **移动视图 → 辅助侧边栏**。产物位于 `apps/vscode/lib/extension/`；`pnpm.cmd run start:vscode` 跳过构建。

此预览复用当前仓库已构建的 Host 包、已安装的依赖及复制的 Web 资源，不会另行下载一份 Node 或 pnpm。上游更新后需重新构建共享应用和扩展；移动仓库目录后需重新构建扩展或设置 `dsh.repositoryPath`。如果扩展宿主无法在 PATH 中找到兼容的 `node`，请将机器级设置 `dsh.nodePath` 指向 Node 可执行文件的绝对路径。

打开扩展即可连接共享后台，或使用扩展自身运行时初始化并启动后台；无需先安装或打开 Desktop。机器级设置 `dsh.desktopHome` 选择已有或新的 Harness 主目录。未设置时按优先级使用第一个可用配置：`DSH_HOME`、当前仓库的开发主目录、账户的 `.dsh` 目录。缺失目录在受信任启动时创建，不会跳过并改用其他主目录。`DSH: 连接桌面版共享后台` 可选择其他主目录。两端需要相同 DSH 版本和主目录；已有 profile 文件及历史保持不变。共享需要本 fork 中支持共享宿主的匹配 Desktop；仅版本号相同的官方 Desktop 构建并不满足条件。

`DSH: 配置 API` 提供原生共享提供方配置、选择另一共享主目录，以及显式使用 `dsh.backend = isolated` 和 SecretStorage 独立密钥的选项。共享配置读取 DSH 的可配置提供方目录和模型列表，再输入 API 地址、密码保护的密钥及模型。首次配置在保存凭据前提供由提供方声明的模型；普通会话选择器仍要求已配置凭据。选择已声明模型，包括手填已有 ID，均保留其能力元数据。不会读回已有密钥，替换时留空保留原凭据。确认后通过后台设置和凭据服务写入，在替换密钥前检查设置修订号。保存不会测试 API 地址或发送模型请求。多步骤保存未完成时会明确提示恢复操作；请重新打开配置，不要假定所有写入均已回滚。重新连接后新会话使用所选默认模型，已有会话保留原模型。删除扩展密钥不会删除共享凭据，私有历史也不会自动合并。

<a id="windows-vsix"></a>
## Windows VSIX 预览

面向社区用户的安装与数据处理说明位于[介绍页](MARKETPLACE.zh.md)和[隐私说明](PRIVACY.zh.md)。[发布清单](RELEASING.zh.md)将包校验与发布者注册、安装后的编辑器验收分开说明。

构建共享应用后，运行 `pnpm.cmd run package:vscode`。本地产物为 `apps/vscode/lib/dsh-vscode-agent-0.0.1-dsh-0.2.1-alpha.2-win32-x64.vsix`；通过 VS Code 的 **扩展: 从 VSIX 安装** 命令安装。打包使用本地 npm tarball 和隔离的生产依赖安装，包含必需的 peer 和 Client 注入包。包内包含共享 Node Host、Web 组合及 Office 转换依赖，不包含 Desktop 的 Electron 外壳、Python/Office skills 载荷、Node 或 pnpm 分发。打包运行时清单记录生产依赖集合。客户端 JavaScript 不包含构建机器的调试路径注释，但保留许可证文本；Windows VSIX 不包含 source map、本机 pnpm 记录或 POSIX 启动脚本。仍需兼容的外部 Node。不执行 Marketplace 发布或签名。

打包的客户端资源与 DSH 包记录匹配版本。`runtime.json` 记录平台、架构、包版本和生产锁文件摘要。启动器拒绝版本或平台不匹配，打包元数据无效时不会回退到源码仓库。启动器在加载模块前规范化安装路径，使 Windows 盘符别名共享 DSH 的模块状态。`dsh.repositoryPath` 仅适用于源码开发。构建只替换自己生成的扩展暂存目录；重新构建前请停止开发窗口。

产物冒烟测试将 VSIX 安装到仓库外的临时扩展目录并检查已安装文件：`node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe" --vsix apps/vscode/lib/dsh-vscode-agent-0.0.1-dsh-0.2.1-alpha.2-win32-x64.vsix --fresh-shared`。它在未注册 Desktop 的空测试主目录中启动默认共享后台，再检查重启、崩溃恢复和最终进程退出。它不会修改用户日常使用的 VS Code 安装。

<a id="editor-context"></a>
## 编辑器上下文

底部工具栏显式捕获选区或当前 Problems；加号菜单上传文件和图片。文件快照包含规范化的工作区相对路径、语言、文档版本、未保存标记、从零开始且末端不包含的范围，以及编辑器中的确切文本。Problems 包含当前报告的诊断，不会重新分析，也不保证诊断对应的文档版本。未保存文件必须已在工作区内有磁盘路径；拒绝未命名文档和符号链接逃逸。引用 chip 以只读文档预览完整 JSON；仅在提交时，共享输入框才将相同文本序列化为普通用户输入。复制或恢复草稿保留快照文本，不会重新读取文件。

`dsh.contextMaxBytes` 默认为每份完整序列化快照 65,536 个 UTF-8 字节；`dsh.contextMaxProblems` 默认为 100 条诊断。超限捕获直接拒绝，不截断。捕获期间修改草稿、切换会话或释放视图会阻止延迟插入。仅捕获不会写入工作区文件，也不会发送模型输入。

## 运行时与传输

文件链接仅在当前查看会话的原项目目录和规范化文件属于此工作区时，才在原生编辑器的指定行打开。相对链接按该原项目目录解析，支持子目录；Agent 改变工作目录不会改变这些链接的基准。请使用相对于原项目的路径或绝对路径；当前工作目录相对的 Markdown 目标尚不能消除歧义。捕获的改动目标保留记录时的路径；目录消失、符号链接或 worktree 越界均被拒绝。改动文件卡片使用 DSH 捕获的完整前后版本打开只读 `vscode.diff` 标签页，两侧合计最多 4 MiB。新建和删除文件不存在的一侧为空，并由标题明确标注。重命名使用 DSH 的旧路径和新路径快照；捕获也可能包含用户同时编辑的内容，并非仅归因于 Agent。拒绝二进制和超大文件对比。捕获随 Host 会话或运行时结束而过期；已打开的标签页保留其副本直到关闭。不提供应用或回退操作。

默认 `shared` 模式为每个原生客户端提供一个租约，连接规范化 Harness 主目录对应的同一个 Desktop profile 后台。多个编辑器窗口与 Desktop 共用一个写入器。每个编辑器优先显示当前工作区的会话，没有时显示全部会话。在列表页发送新消息会在编辑器工作区开始对话。关闭面板保留原生租约；停止、重启或退出只释放该窗口租约。最后一个租约释放后关闭 profile。

`dsh.backend = isolated` 保留原有模式：每个规范化工作区在扩展全局存储中使用带单写入器锁的私有 `vscode` profile。两种模式都不会移动或删除历史。[共享后台库](../shared-host/README.zh.md)负责认证租约、版本检查、冷启动、崩溃恢复及 Desktop 独占更新。

后台监听临时 IPv4 回环端口。共享模式通过认证控制 socket 传送原生启动数据；独立模式使用私有子进程 IPC。Extension Host 用启动 token 交换 HTTP-only cookie。限制路由的 Webview 适配器不接收 URL 或 cookie。Gateway 保留流分帧。HTTP 响应逐步读取；拒绝超过 8 MiB 的缓冲上传。

插件图事件使用 `eventsource` 库经同一带认证的 Fetch 桥接传输，仅允许 `/plugins/events`。适配器在流错误或 EOF 后重连；关闭时中止请求并取消待执行的重试。认证保留在 Extension Host。SSE 解析和重试语义由该库负责，扩展不维护第二套事件解析器。

静态资源限定于 `web/`、`resources/` 和 `carrier/`；工作区、Host 入口及打包运行时都不属于 Webview 资源根目录。CSP 拒绝未列出的来源、任意内联脚本、动态字符串编译（`eval` 和 `Function`）、外部连接/图片、基础 URL 更改、表单、frame 和 object。插件脚本和生成的 style 元素携带页面 nonce；blob worker 仍可使用。共享 Loader 只在求值时编译受信任的 Host 配置表达式，因此仅含字面值的 Client 启动不需要 `unsafe-eval`。共享布局与数学公式渲染仍通过 `style-src-attr 'unsafe-inline'` 使用内联样式属性；不带 nonce 的内联 style 元素会被阻止。这不是 XSS 安全保证，也不代表已完成 Marketplace 发行加固：已安装的 Cordis 插件属于受信任代码，启用前必须审查。

manifest（元数据清单）在受限模式中禁用 DSH。启动过程在异步读取工作区、凭据和安装信息后再次检查信任。授予信任后扩展可用；撤销信任会重启 Extension Host，释放所属运行时，并使 DSH 保持禁用。原生操作在接纳页面消息前也检查信任。真实编辑器信任检查使用独立观察扩展，不使用扩展测试生命周期，使 VS Code 能执行正常的宿主重启。

## 验证

编辑器默认打开会话列表，会话中的回退按钮返回列表而不停止任务。捕获选区后焦点回到输入框；带额外修饰键的 Enter 及输入法组合保留草稿，Shift+Enter 插入换行。宿主样式表将背景、文字、边框和字体 token 映射到 VS Code，支持亮色/暗色及两种高对比度主题，并遵循减少动态效果设置。无密钥浏览器检查覆盖 320/420 px 布局、权限菜单关闭、不可变上下文回放，以及键盘操作进程分组中的 45 个录制工具结果。离线提示提供本地化重连及配置操作，不重发输入。页面错误诊断仅携带失败标记，不携带原始异常文本。

以下定向测试不需要模型提供方凭据：

```powershell
pnpm.cmd --filter @deepseek-ai/dsh-vscode run typecheck
pnpm.cmd exec vitest run apps/vscode/tests packages/client/ui-vscode/tests
```

构建后，使用已安装的 VS Code 可执行文件运行真实扩展宿主冒烟测试，替换示例路径：

```powershell
node apps/vscode/scripts/test-extension.mjs "C:/path/to/Microsoft VS Code/Code.exe"
```

冒烟测试创建、清理自己的临时工作区和 VS Code Portable 目录，包括 `argv.json`。默认选择独立模式，追加 `--fresh-shared` 则初始化临时共享主目录。工作区信任仅在该测试进程中禁用。它检查编辑器快照、Problems、只读预览、客户端启动、API 流量、插件资源、Gateway socket 和所属进程退出，不发送模型请求。`--fresh-shared --onboarding` 单独使用回环模拟模型驱动原生提供方配置和密钥轮换，验证密钥不进入 Webview 状态、设置补丁或会话日志，不向真实提供方发送请求。

显式追加 `--live-home "C:/path/to/desktop/home"` 会使用该主目录管理的 `DEEPSEEK_API_KEY` 引用，启用付费真实模型检查。此选项支持默认 DeepSeek 路由，不复用自定义提供方设置或 OAuth 记录。密钥仅传入临时测试进程环境；测试通过真实 Webview 提交未保存选区，仅使用 DSH 解码器读取 DSH 会话目录中的日志，并取消第二轮。VS Code 自身的 JSONL 日志不在扫描范围内。不会复制凭据或桌面会话。已录制的 `vscode-editor-context` 场景还通过 `apps/web/tests/vscode-submission.e2e.ts` 无密钥回放不可变上下文提交。

在真实模型检查中再追加 `--interactions`，会上传二进制字节、将排队消息转为 steering、在只读权限下请求写文件、授予“允许一次”、打开原生 diff、核对捕获文档和下载文件字节，并回答 `ask_user_question` 选项。随后重启运行时，要求同一批已提交消息各恢复一次。所有写入均限定在临时工作区。

将 `--faults` 与 `--live-home` 一起使用，会选择故障验证而非普通真实模型流程。测试检查插件事件通道、停用并恢复临时 profile 的布局插件、断开已建立的 Gateway 连接，并在真实 shell 工具子进程报告就绪后终止所属运行时。模型检查使用所选 DeepSeek 凭据。结果写入已忽略的 `apps/vscode/lib/fault-results*.json`；任何用例失败都会在清理后使命令失败。`--fault-case plugins`、`--fault-case reconnect` 或 `--fault-case crash` 可选择单个领域。`--faults --fault-case plugins` 不需要 `--live-home` 或模型请求，并将实际 Host 启用状态与 UI 挂载数量和 `tests/expected/plugin-lifecycle.json` 比对。

另有两项真实模型测试需要显式选择：`--faults --fault-case streaming` 在模型文本开始流式输出后断开 Gateway；`--faults --fault-case rebuild` 在流式输出期间原子替换临时插件的客户端产物，观察重建事件、替换挂载及释放。两者均需要 `--live-home`，要求不重载 Webview、保留草稿及选中会话、模型正常完成，且持久化用户输入恰好一份。插件测试在报告成功前恢复其临时 profile，并确认两代产物均已释放。该测试覆盖产物监听及客户端重载，不覆盖源码编译器。

将 `--compat-case migration`、`--compat-case auto-review` 或 `--compat-case compaction` 与 `--live-home` 一起使用，可验证一条会话路径。迁移测试创建测试专属 V3 历史，通过 V4 继续对话，并检查重启后前代字节、文件标识及修改时间不变。Auto review 仅在临时 profile 启用可选实验性组合包、确认风险弹窗，验证审查后的文件写入、进程崩溃及正常重启后恢复 Auto，以及显式卸载切换到 Read Only 后必须人工审批。拒绝该审批后目标文件仍不存在。压缩测试仅降低该 profile 中标准预设的阈值，要求不使用 `/compact` 即产生自动摘要/检查点事件，并检查重启后上下文记忆。这些选项接受 `--vsix` 和 `--fresh-shared` 以验证安装版共享模式；不能与 `--faults` 或 `--interactions` 组合。

活动 Auto 移除测试会等待 Host 确认 Agent 已挂载、空闲且使用 Auto 权限；历史记录恢复后显示权限标签不等于就绪。拒绝写入探针显式申请 `workspace-write` 提权，因为 Read Only 下的普通写入可能直接失败而不请求审批。测试会等待审批记录写入会话文件后再检查。失败诊断只包含已持久化的生命周期计数和可用性标志，不包含对话内容或工具参数；后台仍运行时，文件计数可能落后于已显示的审批卡。

另有两项真实模型场景在临时 alpha profile 验证限时反问和提醒：`--compat-case timed-question` 启用限时反问，让未回答的问题超时后继续工作，再提交晚到的回答，验证只持久化一次回复且不改写已完成的工具结果。`--compat-case reminder` 使用标准 Schedule 工具，要求显示提醒卡并实际触发后续轮次，检查重启不重复投递。两者均接受 `--vsix --fresh-shared`。最后一个原生租约释放后停止执行提醒；这些检查不验证无人值守服务或任务管理界面。

在扩展宿主冒烟测试中追加 `--ux`，可在真实 Webview 中检查原生键盘路由、输入法 Enter、多行草稿、会话列表、文件菜单点击命中及捕获焦点。此无密钥选项接受 `--vsix`，但不能与模型或故障选项组合。

追加 `--security` 可无密钥检查浏览器实际执行的 CSP/资源限制、子进程归属竞争及两个真实对等窗口。独立模式拒绝目录 junction 别名，不同工作区启动独立写入方。追加 `--fresh-shared` 时，两个对等窗口连接同一写入方；编辑器停止或重连保留 Desktop 租约，不兼容客户端不能创建第二个写入方，另有客户端连接时更新锁被拒绝。将 `--trust` 与 `--vsix` 一起使用，可验证安装扩展从受限模式到信任后启动，再回到受限模式的周期。追加 `--fresh-shared` 时，独立 Desktop 租约保持存活，信任前及撤销信任后编辑器没有租约，最后租约释放后写入方必须退出。独立模式要求撤销信任时所属子进程退出。该检查在临时用户数据、共享数据和扩展目录中操作原生 Workspace Trust 按钮。这些选项与 `--ux`、模型和故障检查分开运行。

## 已知限制

每个窗口接纳一个受信任的本地文件夹。拒绝 Remote SSH/WSL、虚拟和多根工作区。共享模式支持每个主目录的多个原生客户端；独立模式保留单写入器限制。后台崩溃后需要显式重新连接，不会重发输入。Windows 已在本机验证；macOS/Linux 共享宿主行为尚未验证。

底部工具栏提供显式选区/Problems 捕获；原生 API 配置使用 Agent 视图右上角的钥匙按钮。启动时显示会话列表，不恢复上次会话。尚未发送的草稿不共享。Auto review 仍属实验功能，默认禁用。

正常关闭会保留 Auto Session 的持久权限选择。运行时仍在活动时卸载 reviewer，会切换为需要人工审批的 Read Only；重新安装 reviewer 不会静默重新启用 Auto。运行中移除 reviewer 会取消活动 Auto 工作，并在降权前关闭其 agent 拥有的持久终端；用户自己的 VS Code 终端不受影响。旧预览可能已在关闭时记录 Full access：请显式检查这些 Session，因为日志无法区分该变更与用户主动选择。参见 [Auto review 生命周期](../../packages/experimental/auto-review/README.zh.md#understand-the-implementation)。

插件生命周期检查要求停用和启用布局插件时移除并重新挂载恰好一个 UI，而不替换 Webview。若恢复后已显示某个会话，重启检查先返回会话列表，再通过已启用的条目重新打开原会话，并完整比对用户消息。适配器测试覆盖分块 UTF-8 事件、流错误及 EOF 后重连、路由拒绝和关闭取消。开发计划记录活动轮次中的产物重载验收；该测试不验证源码编译。
