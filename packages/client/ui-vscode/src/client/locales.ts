/** Copy owned by the editor conversation shell. */
export const en = {
  newSession: 'New conversation', history: 'History', settings: 'API key',
  historyLabel: 'Conversations in this workspace', empty: 'No conversations yet',
  loading: 'Opening workspace…', failed: 'Unable to open this workspace.', retry: 'Retry',
  title: 'DSH Agent', closeHistory: 'Back to conversation',
  file: 'Attach file', selection: 'Attach selection', problems: 'Attach Problems',
  contextChanged: 'The draft or conversation changed. Attach the context again.',
  contextFailed: 'Context was not attached. Select text in a file inside this workspace, or reduce the capture size.',
} as const
/** Keys accepted by the editor shell. */
export type VscodeKey = keyof typeof en
/** Simplified Chinese dictionary with the same keys. */
export const zh: Record<VscodeKey, string> = {
  newSession: '新建对话', history: '历史记录', settings: 'API 密钥',
  historyLabel: '此工作区的对话', empty: '暂无对话',
  loading: '正在打开工作区…', failed: '无法打开此工作区。', retry: '重试',
  title: 'DSH Agent', closeHistory: '返回对话',
  file: '附加文件', selection: '附加选区', problems: '附加 Problems',
  contextChanged: '草稿或对话已改变，请重新附加上下文。',
  contextFailed: '未附加上下文。请在此工作区内的文件中选择文本，或减小捕获大小。',
}
