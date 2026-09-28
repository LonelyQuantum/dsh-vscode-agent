# Agent Note: 在释放资源时保留受审查的权限

Status: implemented

[English](2026-09-28-auto-review-safe-teardown.md) | 中文

## 问题

移除 reviewer 不得授予未经审查的 Full access。根上下文关闭也会释放 reviewer，因此卸载时改写权限可能改变正常重启后恢复的模式。

## 决策

运行中移除 reviewer 会关闭工具准入、中止 review、取消各 Auto agent 并等待空闲。独占 agent 维护先关闭其持久终端，再通过既有权限 writer 将其 Session 切换到配置的 `read-only` preset。终端后端会拒绝在终端仍存在时切换沙箱，因此清理先于每次权限写入。激活要求该 preset 使用 sandbox `read-only` 和 approval `ask`，防止错误的回退配置公布 Auto。根上下文关闭保留持久 Auto 选择，仅关闭 review admission 并等待操作结清。缺少 integration 仍会阻止打开持久 Auto Session。

此决策只替换 [Auto review 决策](../feature/2026-08-28-auto-review.zh.md)中释放资源时回退到 Full access 的部分。Reviewer 策略、权限来源规则、取消与子会话身份决策仍然有效。不改变事件类型或 Session 格式。

## 考虑过的替代方案

**运行中移除后保留 Auto 标签。**这会宣称不可用的审查功能。

**切换到 Full access。**这会静默取消审批要求。

**改写历史 Full access 选择。**这会覆盖用户显式决定。

## 影响

运行中移除后，后续写入需要人工审批；重装 reviewer 不会重新选择 Auto。移除会终止受影响 agent 拥有的终端；其他终端继续存活。清理失败会保留关闭的工具准入，不授予未经审查的访问权限。已持久化的 Full access 选择保持不变，因为日志无法区分资源释放与用户显式选择。运行时关闭由根 Cordis fiber 状态识别，不使用载体专属标记或猜测的超时。
