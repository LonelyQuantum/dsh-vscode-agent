/** Copy owned by the editor conversation shell. */
export const en = {
  newSession: 'New conversation', settings: 'API settings', actions: 'Conversation actions',
  historyLabel: 'Conversations in this workspace', allConversations: 'All conversations', empty: 'No conversations yet',
  loading: 'Opening workspace…', failed: 'Unable to open this workspace.', retry: 'Retry',
  backToList: 'Back to conversations',
  selection: 'Attach selection', problems: 'Attach Problems',
  contextChanged: 'The draft or conversation changed. Attach the context again.',
  contextFailed: 'Context was not attached. Select text in a file inside this workspace, or reduce the capture size.',
} as const
/** Keys accepted by the editor shell. */
export type VscodeKey = keyof typeof en
/** Simplified Chinese dictionary with the same keys. */
export const zh: Record<VscodeKey, string> = {
  newSession: '新建对话', settings: 'API 配置', actions: '对话操作',
  historyLabel: '此工作区的对话', allConversations: '全部对话', empty: '暂无对话',
  loading: '正在打开工作区…', failed: '无法打开此工作区。', retry: '重试',
  backToList: '返回会话列表',
  selection: '附加选区', problems: '附加 Problems',
  contextChanged: '草稿或对话已改变，请重新附加上下文。',
  contextFailed: '未附加上下文。请在此工作区内的文件中选择文本，或减小捕获大小。',
}
