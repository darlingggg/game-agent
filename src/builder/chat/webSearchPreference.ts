type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function webSearchPreferenceKey(account: string, projectId: number, conversationId: number | null) {
  if (!account || projectId <= 0) return null
  const conversation = conversationId && conversationId > 0 ? conversationId : 'draft'
  return `gameagent:web-search:${encodeURIComponent(account)}:${projectId}:${conversation}`
}

/** 内存回退保证浏览器禁用存储时开关仍可使用。 */
export function createWebSearchPreferences(storage: () => PreferenceStorage) {
  const memory = new Map<string, boolean>()
  function get(key: string | null) {
    if (!key) return false
    if (memory.has(key)) return memory.get(key)!
    try {
      return storage().getItem(key) === 'true'
    } catch {
      return false
    }
  }
  function set(key: string | null, enabled: boolean) {
    if (!key) return
    memory.set(key, enabled)
    try {
      storage().setItem(key, String(enabled))
    } catch {
      /* 保留当前页面的设置。 */
    }
  }
  function move(from: string | null, to: string | null, enabled: boolean) {
    set(to, enabled)
    if (!from || from === to) return
    memory.delete(from)
    try {
      storage().removeItem(from)
    } catch {
      /* 存储不可用时仍可继续对话。 */
    }
  }
  return { get, set, move }
}
