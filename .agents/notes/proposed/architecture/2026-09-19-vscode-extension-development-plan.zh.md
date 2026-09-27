# Agent Note: 基于共享 DSH 应用开发 Codex 风格的 VS Code 扩展

Status: proposed

[English](2026-09-19-vscode-extension-development-plan.md) | 中文

## 问题

此 fork 需要一个以编辑器为中心、具有 Codex 风格交互的 VS Code 扩展，包含对话、显式文件和选区上下文、工具进度、审批及变更审查。ProleCoder 提供已有的交互参考。DSH 必须继续负责 agent（智能体）执行、会话及权限，让扩展可以跟随上游发展，无需维护平行实现。

本提案跟随官方 `dsh-v0.1.7-rc.2` 基线。下列发现来自源码检查及上游决策记录。[VS Code 预览](../../../../apps/vscode/README.zh.md)已实现 P0–P4 的开发项；集成优先级区分此前预览证据与本次更新后所需的验收。

## 提案

开发轻量的 VS Code Extension Host、带编辑器专用布局的嵌入式 DSH Client，以及由共享配置文件运行器启动、独立管理的 DSH 进程。复用 Web 应用组合，并通过小型 VS Code 组合包覆盖平台专用配置项。提前验证打包后的运行时，首发支持 Windows 本地工作区。其他操作系统和远程工作区分别设立明确的验证里程碑。

### 上游发现与计划调整

集成基线为 2026-09-27 拉取的官方 `upstream/master`：`dsh-v0.1.7-rc.2`。相对 `dsh-v0.1.6-alpha.2` 基线新增 1,963 个可达提交；本地 `master` 与新基线一致。17 个扩展提交已 rebase，原分支顶端保留在 `backup/vscode-before-upstream-2026-09-27`。此操作不更新远端分支。

| 已检查的上游变化 | 对扩展的影响 |
|---|---|
| [会话写入器](../../../../packages/core/session/src/types.ts) 已为 V4，具有相邻迁移和不可变历史代际。 | 在隔离主目录中验证打开 V3 对话并写入 V4 后继。保留已录制的 V3 编辑器上下文夹具；写入器升级本身不授权重写该夹具，也不代表支持降级。 |
| [客户端会话展示](../../../../packages/client/ui-session/README.zh.md) 将视图绑定与 Agent scope 分离；[Conversation](../../../../packages/client/ui-conversation/README.zh.md) 增加分组和仅消息组合。 | 编辑器捕获适配当前 binding/input API。继续由 `conversation.content` 负责 UI，重新检查草稿保留、空会话启动、历史和窄栏布局。 |
| [Connection](../../../../packages/client/connection/src/client/index.ts)、[Gateway](../../../../packages/api/gateway/README.zh.md) 和[模块系统](../../../../packages/client/modules/README.zh.md) 包含相对路由、双向流、信任分类及服务端重启后的资源版本修复。 | 保留认证 Fetch/WebSocket 桥接和由库承载的插件事件。通过真实 Webview 重新验证字节传输、取消、动态资源、活动轮次重连和插件重建。 |
| [Agent 预设](../../../../packages/preset/agent-preset/README.zh.md) 改用 profile YAML；[Web 组合包](../../../../packages/bundle/web-app/package.json) 声明有序补丁文件。 | VS Code 层继续叠加在完整 Web 组合包之上。验证安装后的预设资源、新 profile 启动及已有 profile 协调；不向扩展复制旧预设清单。 |
| [审批](../../../../packages/client/ui-approval/README.zh.md) 增加本地化说明及自动审查修复；[压缩](../../../../packages/compaction/compaction-basic/README.zh.md) 预留模型输出容量和余量。 | 通过共享控件重跑人工审批、自动审查、取消和压缩验收。这些仍是 DSH 能力，不在扩展内重新实现。 |
| [带超时的用户提问](2026-09-19-timed-user-question-two-settlements.zh.md) 仍是提案；[ask-user](../../../../packages/interaction/tool-ask-user/README.zh.md) 仍等待回答或取消。发行 profile 默认禁用调度。 | 不宣称已支持非阻塞超时提问，也不隐式开启调度。它们不进入首发范围；普通反问和计划审查仍需回归覆盖。 |
| [审查 UI](../../../../packages/client/ui-deliverables/README.zh.md) 增加文件悬停预览、应用选择、语法高亮和滚动修复。 | 保留上游 Web/Sidebar 行为，并存可选 `ConversationEditor` 服务及有界捕获内容路由。原生 diff 仍为只读，受 Host 生命周期限制。 |
| [共享运行时准备](../../../../scripts/primary-runtime/prepare.ts) 替代 Desktop 专属辅助代码；工作区依赖采用精确 DSH 发行范围。 | 将开发时 pnpm 共享迁至共享运行时所有者，保留仅 Python 载荷支持，对齐扩展包版本和范围，重新生成生产依赖集合。VS Code 继续使用外部 Node。 |
| [快捷键](../../../../packages/client/shortcuts/README.zh.md)、插件设置及工具/进程分组改变了共享交互界面。 | 验收新产物前重新检查 VS Code 快捷键冲突、焦点、菜单、明暗/高对比度配色和 320/420 px 宽度。语音和自动化保持可选，不作为发行前提。 |

### 本次更新后的集成优先级

| 顺序 | 工作及所属阶段 | 完成证据 |
|---|---|---|
| R0 | Rebase 适配、生成式声明、依赖及构建（P0/P4）。 | 冲突正确解决；定向测试、类型/构建检查、生成目录及双语文档与新基线一致。 |
| R1 | 共享组合及桥接恢复（P0/P1）。 | 源码 Extension Host 启动、提交/取消、传输字节、流式输出期间重连及轮次内替换插件产物的重载均不重复输入或泄漏凭据。 |
| R2 | 会话及交互兼容（P1/P2/P3）。 | V3→V4 打开/写入保留前代；编辑器上下文回放、队列/steering、人工/自动审批、反问、压缩、重启和捕获的原生 diff 保持原有语义。 |
| R3 | Codex 风格编辑器 UX 回归（P4）。 | 窄栏回放和真实编辑器检查覆盖分组工具进度、输入框焦点、快捷键、主题、无障碍标签及原生文件/审查导航。ProleCoder 作为行为参考，不引入第二套状态模型。 |
| R4 | 新 Windows 产物验证（P4）。 | 从此确切基线重新构建 VSIX，在仓库外安装并重复源码交互/故障检查。记录实际大小和依赖集合；发行前完成 CSP 和 Workspace Trust 审查。 |

先完成 R0，再推进 R1–R4。本节记录 `0.1.7-rc.2` 的验收；后续 P0–P4 进度段落保留 `0.1.6-alpha.2` 预览的证据。受影响的检查须基于新构建重跑；仅有旧 VSIX 文件及被忽略的测试报告不构成当前证据。P5 继续延后。

2026-09-27 的集成证据覆盖共享应用完整构建、扩展构建及类型检查、lint、定向运行时/客户端/审查/文档测试，以及上下文捕获、窄栏布局、主题和不可变提交的无密钥浏览器检查。编辑器上下文场景新增 V4 后继并更新共享提示词/schema 预期；V3 代际保持不变。文档检查包含网站构建。重新构建的 VSIX 验收仍待完成。

R0 的 Windows 兼容检查已在此主机通过：NodeNext 通过临时目录 junction 验证 323 个包声明 API，Cordis 将 Git 索引标记的链接占位文件解析为工作树目标并验证 218 份配置。定向测试覆盖保留目标的清理、无效声明、普通 YAML 标量、链接链、循环、缺失目标及仓库外跳转；原生文件符号链接覆盖在 POSIX 上运行。

编辑器更新后，R1 的 Windows 源码检查通过：真实 Extension Host 启动、上下文提交/取消、二进制上传下载、队列/steering、人工审批、原生 diff、反问、重启、插件启用/停用及 shell 工具崩溃恢复均在当前构建上运行。付费模型检查复用选定的 Desktop 凭据，不复制其会话。`apps/vscode/scripts/test-active-faults.mjs` 中两项显式故障测试在模型文本开始流式输出后断开 Gateway 或替换临时客户端产物。两者均要求持久化输入恰好一份、草稿及选中会话保持不变、模型完成且页面不重载。插件重载还要求恰好一次替换挂载、收到重建事件并释放两代实例。这些测试验证产物监听，不覆盖源码编译。R2 源码验收也已通过：真实编辑器列出 V3 时不发布 V4，迁移后继续对话，重启后前代字节、文件标识及修改时间不变。隔离 Auto review 和自动压缩测试通过；已交付组合的同模型拒绝夹具按平台选择 shell，并保留被拒绝操作的目标文件。现有上下文回放和 R1 交互检查覆盖其余 R2 路径。R3 已通过 320/420 px 无密钥上下文及录制工具检查、四种编辑器主题、权限菜单边界与关闭、Enter 组合键及输入法保护和 Shift+Enter 验证。真实 Extension Host 检查相同键盘路由以及历史和捕获焦点；每次冒烟测试仍包含原生文件及只读 diff 检查。ProleCoder 提供 Enter/输入法/焦点行为参考，不复用代码。R4 产物验收仍待完成。

### 进程与数据归属

Webview 负责展示和临时编辑器 UI。Extension Host 负责 Workspace Trust、当前工作区绑定、进程监管、原生编辑器操作及凭据访问。DSH 负责 agent 状态、持久化输入、审批状态、模型选择及工具。隐藏的 Webview 可以释放 UI 资源，但不能静默取消活动轮次；工作区关闭、扩展退出及显式停止遵循明确的进程和任务生命周期。

优先实验路径是 Webview 经 `postMessage` 连接范围受限的 Extension Host 桥接层，再连接扩展持有的运行时现有的带身份验证 HTTP/WebSocket 端点。复用 Gateway 流分帧及 Connection 恢复机制，不创建新的业务消息。不能假定 VS Code 提供 Electron 的自定义协议或请求头拦截 API；必须验证 Webview 资源映射、CSP、cookie 和字节流。如果兼容性实验失败，可以考虑基于 `ClientConnectionRpc` 的传输，同时保留相同的 Host 服务及生成式 Remote API。

启动 token、身份验证 cookie 和模型提供方密钥不得进入页面 URL、Webview 状态或日志。代理请求仅能访问所持有的运行时及准许的路由。复用现有根路径 token 交换和浏览器信任检查；不能为连通 Webview 而弱化身份验证。原生操作使用限定在当前 Webview 和工作区内的类型化命令，并支持取消和资源释放。

开发时使用隔离的 Harness 主目录。在启用多窗口前，为每个窗口明确运行时及配置文件的归属策略；共享产品数据与共享可执行文件及插件安装是不同决策。复用上游凭据归属，仅在范围和生命周期适配时增加 SecretStorage 提供方；Webview 永远不接收原始密钥。

VS Code 组合包通过共享 system-prompt 注册表拥有模型可见的界面说明节，禁用独立 Web 界面说明、浏览器打开及 URL 打印。该节描述显式编辑器快照及原生只读审查，不暴露私有运行时 URL；组合后的提示词及工具 schema 由录制场景固定。

### 建议代码位置

| 位置 | 职责 |
|---|---|
| `apps/vscode/` | 扩展 manifest（元数据清单）、激活、进程监管、原生操作、Webview 入口与资源、VSIX 打包及 Extension Host 测试。 |
| `packages/bundle/vscode-app/` | 共享 Web 组合之上的小型补丁：VS Code 适配器及布局，并显式选择可选功能。 |
| `packages/client/ui-vscode/` | 根布局和编辑器交互，复用现有对话 Factory、声明式 slot、主题 token 及语言字典。 |
| Host 适配器，位置在验证阶段确定 | 仅针对必须调用编辑器操作的 Host 行为建立 Cordis 插件；通用 DSH 包不导入 `vscode`。 |

`apps/vscode/`、`packages/bundle/vscode-app/` 和 `packages/client/ui-vscode/` 包含源码仓库开发预览。组合包选择编辑器专用根布局，同时保留共享 Conversation 工厂和服务。扩展宿主通过私有启动握手提供工作区；客户端 Loader 配置项不会继承 Host 插件配置。Host/Client 编译面、依赖声明、slot 归属和本地化文案遵循当前[客户端规则](../../../../packages/client/AGENTS.md)。仅当两个产品都消费稳定职责时才从 Desktop 提取共享辅助代码；Electron 专用控件及更新器代码继续由 Desktop 持有。

### P0 进展与待定事项

Windows 扩展开发宿主已启动真实的共享 profile 应用、加载 Web 客户端和插件资源、发出 API 请求、建立 Gateway WebSocket、挂载编辑器专用单栏对话，并停止其管理的 Node 子进程。重启冒烟测试检查重新挂载及旧进程退出。工具栏提供新建对话、工作区历史、原生 SecretStorage 配置和符合条件的上次会话恢复；针对性测试覆盖导航及延迟启动结果的资源释放。源码开发和 Windows x64 VSIX 都使用外部兼容 Node。VSIX 安装到仓库外的隔离目录，并通过相同的原生编辑器及生命周期冒烟测试。P0 和 P1 验收仍未完成。

Webview 桥接将认证保留在 Extension Host，保持 Gateway 分帧。真实 Webview 检查覆盖模型完成和取消、二进制上传、文件下载字节、排队消息转 steering，以及运行时重启后的对话恢复。Windows 源码预览故障检查还覆盖空闲 Gateway 重连及 shell 工具运行期间终止运行时。插件事件通过 `eventsource` 库和带认证的 Fetch 传输，不使用指向 Webview 来源的原生连接；该库的解析和重试处理避免维护另一套 SSE 实现。无密钥编辑器检查验证了 Host 停用和启用会移除并重新挂载布局，而不替换 Webview。适配器测试覆盖流断开后重连与取消；当前活动轮次的证据记录在上方集成章节。Cordis 的浏览器配置 loader 需要 `unsafe-eval`；分发验证仍需要 CSP 决策及信任状态切换。尝试此部分实现时，以预览的[限制和启动步骤](../../../../apps/vscode/README.zh.md)为准。

### 交付顺序

P4 预览检查覆盖历史记录键盘焦点、明暗和高对比度模式的宿主颜色、Windows 运行时终止后的显式重启，以及已安装 VSIX 的启动。源码预览的 shell 工具崩溃检查观察到子进程退出、消息恢复且不重复运行工具，以及后续真实模型回复。诊断排除页面原始异常。打包将工作区依赖、必需的 peer 和 Client 注入依赖选入生产运行时，记录确切版本及锁文件摘要，并拒绝平台或版本不匹配。共享 Web 组合包含 Office 转换依赖，但不包含 Desktop 的 Electron/Python/skills 载荷，也不附带额外的 Node/pnpm 分发。其他工具类别、打包后的故障路径、完整交互验收、CSP 发行审查及 macOS/Linux 验证仍待完成。

P3 使用由 `ui-conversation` 定义、`ui-vscode` 提供、Chat 和交付视图消费的可选 `ConversationEditor` 服务。原生宿主校验文件准入；捕获 review 读取基于 `workspaceChanges.contents` 的固定认证路由，共用 recorder 的上限和生命周期。未挂载编辑器服务时，Web 和 Desktop 保留原有 Sidebar 导航。这是只读 review，不持久化历史捕获，也不提供回退。Windows 原生编辑器及后端测试覆盖确切版本、后续磁盘编辑、新建和删除、重命名、二进制和大小拒绝及过期。真实模型在只读权限下请求写入，“允许一次”放行后，改动卡片打开原生 diff，其中只读文档与捕获版本一致。同一流程回答 `ask_user_question` 选项，并等待模型完成。

P2 预览仅在显式请求时捕获文件、选区和 Problems，以草稿版本校验插入不可变引用 chip，并打开确切文本的只读预览。单元测试覆盖 UTF-8 上限、工作区和符号链接准入、取消及序列化；真实 Windows 扩展宿主检查未保存编辑器文本、版本、诊断和预览。真实 Webview 检查提交未保存选区、验证模型回复及持久化会话文本，并取消另一轮。已录制的 `vscode-editor-context` 场景无密钥回放共享输入框、不可变上下文提交、模型回复及持久化会话。文件和 Problems 捕获及取消继续由针对性的原生和 Client 测试覆盖。

| 阶段 | 交付内容 | 完成证据 |
|---|---|---|
| P0：架构及可执行验证 | 最小扩展、共享配置文件启动、本地回环代理实验、打包资源及当前传输钩子。 | 真实 Extension Development Host 完成一次模型轮次并取消另一次；会话列表、就绪及重连、一次上传下载、延迟资源加载和插件图刷新均在 CSP 下工作。关闭扩展后无所属进程残留。在确定最终传输前记录所有缺口。 |
| P1：首个可用闭环 | Activity Bar 入口、单列对话、会话切换及新建和恢复、工具卡片、审批及提问和计划、模型及权限、队列和 steering（中途引导）。加入首次配置、SecretStorage 集成、信任处理及有界诊断。 | Windows 本地工作区可安装 VSIX、配置提供方、经审批执行编辑、停止任务、重载并恢复，且不重复输入或泄漏凭据。原生运行时和模块解析冒烟测试在源码仓库之外运行。 |
| P2：编辑器上下文 | 当前文件、选中文本、显式上下文 chips、文件引用及 Problems 快照。 | 提交上下文与可见草稿一致，包含未保存文本及文件版本。路径指向正确的执行环境；实际接纳的模型输入可以从 DSH 日志回放。取消操作不会把上下文附到其他会话。 |
| P3：原生变更审查 | 文件链接跳转编辑器位置；使用上游变更摘要；提供有界的捕获文件版本，构造只读 `vscode.diff` 文档。 | 修改前后内容来自记录版本，而非当前磁盘内容或从部分 hunks 重建。创建及删除、重命名、重复编辑、二进制及超大文件、缺失捕获和轮次中的用户编辑都有明确行为。如实显示已失效的历史。 |
| P4：交互及发布验证 | 键盘导航、输入框行为、队列及 steering 控件、紧凑进度、主题及字号和无障碍、本地化、崩溃恢复及固定版本运行时打包。 | 针对性 UX 对比及可安装产物测试先覆盖 Windows，再覆盖 macOS/Linux。Remote SSH/WSL 和多根工作区仅在文件系统身份、进程位置、凭据及多窗口行为完成测试后发布。 |
| P5：独立增强 | 持久化历史审查、感知冲突的应用及撤销、更丰富的 subagent 视图、原生 Chat participant、Git 工作流、后台交接及可选 FIM。 | 每项增强明确数据归属和产品验收标准，不阻塞 P0–P4。 |

P0 包含分发可行性验证，因为 VS Code 内嵌的 Node 版本并不是 DSH 的运行时约定。将扩展、客户端资源和运行时固定为经过测试的版本组合。根据仓库 engines 和原生依赖验证所选独立 Node 或打包 DSH 路径；不能假定 Desktop 的 Electron RunAsNode 实现可直接用于 VS Code。可选的浏览器及计算机操作和 Office 能力按产品组合显式选择，避免意外继承整个 Desktop 依赖包。

### 复用与上游维护

Windows 预览已为 P0–P4 的各个开发领域提交实现，但不代表发行验收全部完成。不持久化的主题注册跟随编辑器配色；浏览器回放检查共享控件及 320/420 px 下的消息宽度。交付预览时保留上述待验证项目。

参考 ProleCoder 的 Workspace Trust、编辑器选区及诊断、进程恢复、原生 diff 导航和 VSIX 测试。agent 执行、RPC 业务方法、历史、压缩（compaction）和工具展示继续由 DSH 负责。直接复用代码前需要确定来源和许可；行为参考不依赖导入 ProleCoder 的实现。

本地 `master` 跟踪 `upstream/master`，不包含扩展提交。获取上游并快进 `master`；仅在用户要求时 rebase 开发分支，保留本地备份和已拉取的远端顶端。之后若获准推送重写历史，使用精确的 `--force-with-lease`，禁止 `--force`。同步 fork 远端的 `master` 是独立推送操作，获取 upstream 不代表已执行该推送。

## 考虑过的替代方案

**把全新无端口 IPC 后端作为首个里程碑。** 这会增加流、精确 Fetch 路由、字节传输、模块服务及恢复机制的维护职责。上游共享 Web 包装提供了偏离更少的可用参考。仅当实测 VS Code 限制阻止共享 Web 路径，或明确产品需求禁止监听端口时重新考虑。

**原样嵌入完整三栏 Web 页面。** 这能加快传输验证，但会重复编辑器的文件和预览区域，并挤压窄侧栏中的对话。它可以作为临时诊断视图；产品在编辑器专用布局中组合 `conversation.content`。

**基于 SDK 或 ACP（Agent Client Protocol）。** [当前 TypeScript SDK 的限制](../../../../packages/sdk/client/README.zh.md#known-limitations-and-deferred-work) 仍包括无法中途取消及缺少服务端到客户端请求。这些协议适合各自消费方，但不能替代此扩展所需的现有交互式 GUI API。

**复制 ProleCoder 的完整前后端。** 这会产生平行的会话、提供方及工具状态实现，同时失去 DSH 客户端演进带来的收益。保留编辑器集成行为，并围绕当前 DSH 接口实现适配器。

## 验收标准

- 首个版本完成编辑器工作流：选择上下文、发送、观察工具、审批、取消或 steering、检查变更，以及重载后恢复会话。
- P0 记录传输及打包运行时证据；P1 在扩展可选功能或操作系统支持前交付 Windows VSIX。
- 通过真实组合测试运行时取消、隐藏视图行为、崩溃、重启、工作区关闭及扩展资源释放。启动失败及不可用历史具有可见的恢复或限制状态。
- 上下文及收件箱改动保留模型输入日志和已发布格式迁移规则。原生审查绝不把部分 hunks 或可变的当前文件呈现为捕获的完整版本。
- 验证遵循[测试政策](../../../../docs/testing.zh.md)及[快照归属](../../../../snapshots/AGENTS.md)：录制会话案例位于 `snapshots/`，其他预期输出靠近其所属测试，并增加 Extension Host/VSIX 测试。GUI PR 按 [GIF 工作流](../../../skills/record-browser-gif/SKILL.md)附带真实服务器和模型证据。
- 共享 UI 改动运行相关 GUI 和浏览器回放检查；文档配对、本地化、发布产物及受影响行为运行各自检查。持久的架构决策附带 Agent Note，而不是每项局部 UI 调整都新增记录。

## 风险

Webview CSP 和来源规则可能阻止直接复用 Electron 的资源及身份验证适配器。P0 必须测试普通 Fetch 消费方和延迟分片，而不仅是 Connection RPC。任何桥接层都必须限制缓冲，并在重连前等待取消流完全结束。

当前变更记录器仅在会话存活时保留摘要及捕获字节，并发的用户或外部编辑可能进入轮次工作区比较。这是审查证据，不是 agent 独占修改的归因，也不是安全的回滚事务。持久化审查及应用和撤销需要独立的冲突与持久化设计。

上游 API 和插件组合尚未稳定。[LogicalSession 提案](2026-09-06-logical-session-storage-rebuild.zh.md) 是拟议工作，不是实现依赖。使用当前 Remote 及投影 API，固定经过验证的基线，并在每个里程碑前重新评估上游。引用的 Desktop、启动、流、Factory 和展示决策仍具有独立价值；此 VS Code 提案不取代它们。
