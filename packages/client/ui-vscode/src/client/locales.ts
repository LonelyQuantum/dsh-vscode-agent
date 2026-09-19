/** Copy owned by the editor conversation shell. */
export const en = {
  newSession: 'New conversation', history: 'History', settings: 'API key',
  historyLabel: 'Conversations in this workspace', empty: 'No conversations yet',
  loading: 'Opening workspace…', failed: 'Unable to open this workspace.', retry: 'Retry',
  title: 'DSH Agent', closeHistory: 'Back to conversation',
} as const
/** Keys accepted by the editor shell. */
export type VscodeKey = keyof typeof en
/** Simplified Chinese dictionary with the same keys. */
export const zh: Record<VscodeKey, string> = {
  newSession: '新建对话', history: '历史记录', settings: 'API 密钥',
  historyLabel: '此工作区的对话', empty: '暂无对话',
  loading: '正在打开工作区…', failed: '无法打开此工作区。', retry: '重试',
  title: 'DSH Agent', closeHistory: '返回对话',
}
