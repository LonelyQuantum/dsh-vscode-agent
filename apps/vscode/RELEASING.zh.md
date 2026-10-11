# 社区预览发布清单

[English](RELEASING.md) | 中文

本参考文档介绍由此社区 fork 维护的 Windows x64 VSIX，不涉及上游 npm 或 Desktop 发行。打包和校验不会发布、创建标签或上传凭据。公开分发需要维护者另行决定。

## 版本策略

打包的运行时记录包含 DSH 版本、官方发行标签、源码分支、依赖版本及锁文件校验值。打包要求该标签是源码分支的祖先；alpha 和 RC 产物分别验证。

扩展版本由 `extension.manifest.json` 定义；工作区 `package.json` 的版本独立跟随 DSH。首次公开发布前，扩展保持 `0.0.1`。普通提交和本地构建不递增版本号；改动统一累积在[更新记录](CHANGELOG.zh.md)的“未发布”部分。

公开发布时，先选定发布版本，更新扩展清单、更新记录及带版本号的示例，并在打标签前提交这些改动。构建并验证该提交后，再为其创建 `vscode-v<version>` 标签，以区分扩展发行和上游 DSH 发行。首次发布后，每次后续公开发行（包括预览版）都使用新版本号，不得以同一版本号替换为内容不同的产物。

## 构建与检查

在仓库根目录使用 `pnpm.cmd run build` 构建仓库，再运行 `pnpm.cmd run package:vscode`。开始安装版编辑器或已构建运行时检查前，应完成所有写入 Host 产物的构建，包括 `doc-typecheck`。打包命令包含面向社区用户的文档、保留许可声明、将 VSIX 标记为预发行版，并创建 `.vsix.sha256` 校验文件。`pnpm.cmd run verify:vscode-release` 检查暂存的元数据和 vsce 实际选中的文件列表；它不能替代安装产物测试或安全审计。

请将 VSIX 和校验文件一同保留，共享产物前校验 SHA-256 值。包内文档链接指向此 fork 中执行打包的分支：分发前请推送相应源代码，不要从临时私有分支打包。构建不会向任何注册表发送密钥。

## 安装产物验收

使用现有[产物冒烟测试](README.zh.md#windows-vsix)，分别附加 `--fresh-shared --onboarding` 和 `--fresh-shared --ux`，验证没有 Desktop 的全新主目录中的原生配置及日常使用。对同一 VSIX 分别运行 `--fresh-shared --security` 和 `--fresh-shared --trust`，再运行已记录的共享模式真实模型交互与故障检查，保留独立模式定向回归。使用临时主目录和脱敏数据；验证密钥、模型与历史共享、两种启动顺序、崩溃恢复及最终进程退出。打包命令成功不代表编辑器验收通过。

请将准确的产物校验值与实际检查结果一同记录在[开发计划](../../.agents/notes/proposed/architecture/2026-09-19-vscode-extension-development-plan.zh.md)中。原生配置只保存设置，不测试连接；模拟验收不证明真实提供方密钥或地址有效。不要仅根据打包、单元测试、旧产物或独立模式检查，把共享模式交互、安全、信任或生命周期验收标记为完成。Auto 审查器移除超时的原因未查清时，即使重试通过，仍属于未完成验收项。

## 分发决策

- 社区作者名及预定 publisher ID 均为 `LonelyQuantum`。上传前需确认已注册并拥有该 Marketplace 发布者；本地元数据检查无法验证账号。使用 `dsh-local` 预览版的用户应先按[扩展身份迁移指南](../../docs/upgrade-guide/v0.2.0-rc.2/vscode-publisher-identity/guide.zh.md)操作，再安装新身份的扩展。
- 建立由社区维护者负责的私密漏洞报告渠道，不要将私密报告转交给无关的上游维护者。
- 检查打包依赖的许可证、上游声明及对应源代码义务，保留上游版权信息。仓库级声明并不证明社区分发者已经获得全部必要许可。
- 面向预期用户确认提供方初始化、隐私披露及反馈共享行为。自定义插件可能改变默认数据处理方式。
- 明确选择 GitHub VSIX 预览、Marketplace 或 Open VSX。不要发布不受支持的平台产物，也不要声称已经通过未验证的注册表验收。

[VS Code 官方发布指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)是当前发布者注册及认证要求的依据。请勿将发布凭据放入仓库或聊天。本仓库没有无人值守的发布流程，此清单也不授权上传产物。
