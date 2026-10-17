/** Copy owned by the editor conversation shell. */
export const en = {
  newSession: 'New conversation', actions: 'Conversation actions',
  historyLabel: 'Conversations in this workspace', allConversations: 'All conversations', empty: 'No conversations yet',
  loading: 'Opening workspace…', failed: 'Unable to open this workspace.', retry: 'Retry',
  backToList: 'Back to conversations',
  releaseChanged: 'The shared backend changed versions',
  releaseDescription: 'This page keeps its loaded plugins until you reload. Unsent drafts are retained; running tasks continue.',
  releaseLater: 'Not now', releaseReload: 'Reload DSH view',
  selection: 'Attach selection', problems: 'Attach Problems',
  contextChanged: 'The draft or conversation changed. Attach the context again.',
  commandCapturePosition: 'Place the composer caret after the command label, then attach the context again.',
  contextFailed: 'Context was not attached. Select text in a file inside this workspace, or reduce the capture size.',
} as const
/** Keys accepted by the editor shell. */
export type VscodeKey = keyof typeof en
/** Simplified Chinese dictionary with the same keys. */
export const zh: Record<VscodeKey, string> = {
  newSession: '新建对话', actions: '对话操作',
  historyLabel: '此工作区的对话', allConversations: '全部对话', empty: '暂无对话',
  loading: '正在打开工作区…', failed: '无法打开此工作区。', retry: '重试',
  backToList: '返回会话列表',
  releaseChanged: '共享后台版本已变化',
  releaseDescription: '重新加载前，此页面继续使用已加载的插件。未发送的草稿会保留，运行中的任务继续执行。',
  releaseLater: '暂不处理', releaseReload: '重新加载 DSH 视图',
  selection: '附加选区', problems: '附加 Problems',
  contextChanged: '草稿或对话已改变，请重新附加上下文。',
  commandCapturePosition: '请将输入光标移至命令标签之后，再附加上下文。',
  contextFailed: '未附加上下文。请在此工作区内的文件中选择文本，或减小捕获大小。',
}
