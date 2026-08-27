import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getConversationStats, getProjectUsage, type ConversationStats, type ProjectUsage } from '@/http/tokenUsage'

export const useTokenUsageStore = defineStore('tokenUsage', () => {
  const conversationId = ref<number | null>(null)
  const conversation = ref<ConversationStats | null>(null)
  const project = ref<ProjectUsage | null>(null)
  const isCompressing = ref(false)
  const usageEstimated = ref(false)
  const generationStatus = ref<'idle' | 'streaming' | 'cancelling' | 'completed' | 'cancelled' | 'failed'>('idle')
  const contextTokens = computed(() => conversation.value?.currentContextTokens ?? 0)
  const contextLimit = computed(() => conversation.value?.contextLimit ?? 0)
  const contextRatio = computed(() => contextLimit.value > 0 ? Math.min(contextTokens.value / contextLimit.value, 1) : 0)

  function setConversationId(id: number | null) { conversationId.value = id }
  function updateConversation(data: Partial<ConversationStats>) {
    conversation.value = { ...(conversation.value ?? { id: 0, projectId: 0, title: '', promptTokens: 0, completionTokens: 0, totalTokens: 0, currentContextTokens: 0, contextLimit: 0 }), ...data }
    if (typeof data.id === 'number') conversationId.value = data.id
  }
  function updateProject(data: ProjectUsage) { project.value = data }
  async function refreshConversation(params: { projectId?: number; title?: string } = {}) {
    try {
      const data = await getConversationStats({ conversationId: conversationId.value, ...params }) as unknown as ConversationStats
      if (data) updateConversation(data)
    } catch { /* errors are surfaced by the shared HTTP interceptor */ }
  }
  async function refreshProject(projectId: number) {
    if (!projectId) return
    try { updateProject(await getProjectUsage(projectId) as unknown as ProjectUsage) } catch { /* optional telemetry */ }
  }
  function resetConversation() { conversationId.value = null; conversation.value = null; isCompressing.value = false; usageEstimated.value = false }
  return { conversationId, conversation, project, isCompressing, usageEstimated, generationStatus, contextTokens, contextLimit, contextRatio, setConversationId, updateConversation, updateProject, refreshConversation, refreshProject, resetConversation }
})
