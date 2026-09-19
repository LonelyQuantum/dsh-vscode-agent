# Agent Note: 基于共享 DSH 应用开发 Codex 风格的 VS Code 扩展

Status: proposed

[English](2026-09-19-vscode-extension-development-plan.md) | 中文

## 问题

此 fork 需要一个以编辑器为中心、具有 Codex 风格交互的 VS Code 扩展，包含对话、显式文件和选区上下文、工具进度、审批及变更审查。ProleCoder 提供已有的交互参考。DSH 必须继续负责 agent（智能体）执行、会话及权限，让扩展可以跟随上游发展，无需维护平行实现。

本提案在检查从 `dsh-v0.1.1-rc.2` 到 `dsh-v0.1.6-alpha.2` 的上游更新后，替代最初仅存在于对话中的开发计划。下列发现来自源码检查及上游决策记录；本提案尚未实现或验证任何 VS Code 运行时或 UI。

## 提案

开发轻量的 VS Code Extension Host、带编辑器专用布局的嵌入式 DSH Client，以及由共享配置文件运行器启动、独立管理的 DSH 进程。复用 Web 应用组合，并通过小型 VS Code 组合包覆盖平台专用配置项。提前验证打包后的运行时，首发支持 Windows 本地工作区。其他操作系统和远程工作区分别设立明确的验证里程碑。

### 上游发现与计划调整

| 已检查的上游变化 | 对扩展的影响 |
|---|---|
| [Desktop 包装完整 Web 应用](../../implemented/architecture/2026-09-10-desktop-web-wrapper.zh.md)，对应 PR（Pull Request）#3981。业务通信使用带身份验证的 HTTP 和 WebSocket；IPC 承载生命周期和启动数据。 | 优先评估 Extension Host 到其持有的本地回环 Web 运行时的代理。无端口业务 IPC 传输仅在证实 Webview 有此需求后考虑，不再作为前置要求。 |
| [Connection 传输钩子](../../../../packages/client/connection/src/client/index.ts) 提供 `rpc`、`fetch`、`openStream`、`loadBundle`、`ownsHost` 和 `streamBaseUrl`；[Gateway](../../../../packages/api/gateway/README.zh.md) 负责多路复用流、就绪和恢复。 | 替换旧的 `createApiClient` 假设。通过当前接口保留单次请求取消、逻辑流取消、连接代际就绪及日志追赶行为。 |
| [客户端模块](../../../../packages/client/modules/README.zh.md) 支持动态插件组合、延迟分片、样式和图更新；PR #4189 引入动态组合。 | 传输验证必须覆盖动态资源、精确 Fetch 路由、上传下载和模块重载，以及文本请求。 |
| [组件 Factory](../../implemented/architecture/2026-09-10-component-factories-and-local-slots.zh.md) 已随 PR #4359 实现，包含 `conversation.content`。 | 在窄版 VS Code 布局中组合现有对话正文和输入框。保留其存储与会话作用域，通过声明的 slot 和回调实现编辑器专用控件。 |
| [客户端生成工具展示](../../implemented/architecture/2026-08-23-client-derived-tool-presentation.zh.md) 消费原始事件及持久化结果元数据。 | 继续由 `ui-tool` 负责卡片。不要预期 Session Remote 响应含有 Host 渲染意图，也不要向 Webview 导入 Host 工具实现。 |
| [工作区变更](../../../../packages/deliverables/workspace-changes/README.zh.md) 和[审查 UI](../../../../packages/client/ui-deliverables/README.zh.md) 捕获轮次比较；PR #4279 提供审查预览。 | 复用摘要及变更坐标。原生完整文件 diff 需要有界读取两个捕获版本：当前响应提供 hunks，而非完整文件。Host 重启后的历史审查仍需独立的持久化决策。 |
| [应用启动器](../../../../docs/architecture.zh.md) 要求使用配置文件；[app-boot](../../../../packages/boot/app-boot/README.zh.md) 负责 runtime/link 解析与插件安装。 | 使用应用持有的 `vscode` 配置文件及共享启动器。不要引入独立 agent 可执行文件，也不要复用 Desktop 保留的配置文件。 |
| [会话格式状态](../../../../docs/session-format-status.zh.md) 记录了已发布的格式 3；[相邻迁移](../../implemented/architecture/2026-08-31-released-session-format-migrations.zh.md) 保留不可变代际。[agent loop（智能体循环）](../../../../docs/architecture.zh.md) 负责持久化收件箱。 | 复用迁移、队列、回执及恢复行为。不要建立 Webview 自有的会话日志，也不要因产品处于预发布阶段就假定可以丢弃持久化数据。 |

### 进程与数据归属

Webview 负责展示和临时编辑器 UI。Extension Host 负责 Workspace Trust、当前工作区绑定、进程监管、原生编辑器操作及凭据访问。DSH 负责 agent 状态、持久化输入、审批状态、模型选择及工具。隐藏的 Webview 可以释放 UI 资源，但不能静默取消活动轮次；工作区关闭、扩展退出及显式停止遵循明确的进程和任务生命周期。

优先实验路径是 Webview 经 `postMessage` 连接范围受限的 Extension Host 桥接层，再连接扩展持有的运行时现有的带身份验证 HTTP/WebSocket 端点。复用 Gateway 流分帧及 Connection 恢复机制，不创建新的业务消息。不能假定 VS Code 提供 Electron 的自定义协议或请求头拦截 API；必须验证 Webview 资源映射、CSP、cookie 和字节流。如果兼容性实验失败，可以考虑基于 `ClientConnectionRpc` 的传输，同时保留相同的 Host 服务及生成式 Remote API。

启动 token、身份验证 cookie 和模型提供方密钥不得进入页面 URL、Webview 状态或日志。代理请求仅能访问所持有的运行时及准许的路由。复用现有根路径 token 交换和浏览器信任检查；不能为连通 Webview 而弱化身份验证。原生操作使用限定在当前 Webview 和工作区内的类型化命令，并支持取消和资源释放。

开发时使用隔离的 Harness 主目录。在启用多窗口前，为每个窗口明确运行时及配置文件的归属策略；共享产品数据与共享可执行文件及插件安装是不同决策。复用上游凭据归属，仅在范围和生命周期适配时增加 SecretStorage 提供方；Webview 永远不接收原始密钥。

### 建议代码位置

| 位置 | 职责 |
|---|---|
| `apps/vscode/` | 扩展 manifest（元数据清单）、激活、进程监管、原生操作、Webview 入口与资源、VSIX 打包及 Extension Host 测试。 |
| `packages/bundle/vscode-app/` | 共享 Web 组合之上的小型补丁：VS Code 适配器及布局，并显式选择可选功能。 |
| `packages/client/ui-vscode/` | 根布局和编辑器交互，复用现有对话 Factory、声明式 slot、主题 token 及语言字典。 |
| Host 适配器，位置在验证阶段确定 | 仅针对必须调用编辑器操作的 Host 行为建立 Cordis 插件；通用 DSH 包不导入 `vscode`。 |

这些是建议位置，并非现有包。Host/Client 编译面、依赖声明、slot 归属和本地化文案遵循当前[客户端规则](../../../../packages/client/AGENTS.md)。仅当两个产品都消费稳定职责时才从 Desktop 提取共享辅助代码；Electron 专用控件及更新器代码继续由 Desktop 持有。

### 交付顺序

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

参考 ProleCoder 的 Workspace Trust、编辑器选区及诊断、进程恢复、原生 diff 导航和 VSIX 测试。agent 执行、RPC 业务方法、历史、压缩（compaction）和工具展示继续由 DSH 负责。直接复用代码前需要确定来源和许可；行为参考不依赖导入 ProleCoder 的实现。

本地 `master` 跟踪 `upstream/master`，不包含扩展提交。获取上游并快进 `master`；将验证过的基线纳入开发分支，默认不重写已发布工作。产品修改在开发分支上进行。同步 fork 远端的 `master` 是独立的 Git 推送操作，获取 upstream 不代表已执行该推送。

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
