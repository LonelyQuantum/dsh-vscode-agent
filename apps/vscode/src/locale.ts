/** Extension-owned UI copy; provider and model responses are not translated. */
const en = {
  workspace: 'Open one trusted local folder. Remote and multi-root workspaces are not supported.',
  starting: 'Starting DSH…',
  stopped: 'DSH is stopped. Run DSH: Open Agent to start it.',
  failed: 'DSH could not start. Check the Node executable and repository build, then run DSH: Restart Agent Runtime.',
  apiKey: 'DeepSeek API key (stored in VS Code SecretStorage)',
  configured: 'API key saved. Restart DSH to use it.',
  removed: 'The extension-stored API key was removed. Restart DSH to apply the change.',
  previewFailed: 'The captured text could not be opened. Close unused snapshot tabs and try again.',
} as const
type Copy = { [K in keyof typeof en]: string }
const zh: Copy = {
  workspace: '请打开一个已信任的本地文件夹，暂不支持远程或多根工作区。',
  starting: '正在启动 DSH…',
  stopped: 'DSH 已停止。运行“DSH: 打开 Agent”可再次启动。',
  failed: 'DSH 无法启动。请检查 Node 可执行文件和仓库构建，然后运行“DSH: 重启 Agent 运行时”。',
  apiKey: 'DeepSeek API 密钥（存储在 VS Code SecretStorage 中）',
  configured: 'API 密钥已保存，重启 DSH 后生效。',
  removed: '已删除扩展保存的 API 密钥，重启 DSH 后生效。',
  previewFailed: '无法打开捕获的文本。请关闭不再使用的快照标签页，然后重试。',
}

/** Select extension copy without changing upstream locale ownership. @param language VS Code language. @returns Complete labels. */
export function extensionCopy(language: string): Copy { return language.toLowerCase().startsWith('zh') ? zh : en }
