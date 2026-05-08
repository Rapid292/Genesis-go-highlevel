import { ref } from 'vue'
import { defineStore } from 'pinia'
import { GENERATE_URL, getToken } from '@/lib/api'

type ChatMessage = {
  id?: number
  role: 'user' | 'assistant'
  content: string
  apisUsed?: string[]
}

export const useGenerationStore = defineStore('generation', () => {
  const isGenerating = ref(false)
  const streamedOutput = ref('')
  const apisUsed = ref<string[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const lastSnapshotId = ref<string | null>(null)
  const error = ref('')

  async function generate(projectId: string, prompt: string) {
    isGenerating.value = true
    streamedOutput.value = ''
    error.value = ''
    apisUsed.value = []
    chatMessages.value.push({ role: 'user', content: prompt })

    try {
      const token = await getToken()
      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          prompt,
          chatHistory: chatMessages.value.slice(-6),
        }),
      })

      if (!response.ok) {
        throw new Error(`Generation failed with status ${response.status}`)
      }

      if (!response.body) {
        throw new Error('Generation response did not include a stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '')

          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue

            try {
              const data = JSON.parse(raw)

              if (currentEvent === 'token') {
                streamedOutput.value += data.chunk || ''
              } else if (currentEvent === 'apis_used') {
                apisUsed.value = data.apis || []
              } else if (currentEvent === 'done') {
                lastSnapshotId.value = data.snapshotId
                chatMessages.value.push({
                  id: Date.now(),
                  role: 'assistant',
                  content: `Generated ${data.filesChanged} file(s).`,
                  apisUsed: data.apisUsed || [],
                })
                isGenerating.value = false
              } else if (currentEvent === 'error') {
                error.value = data.message || 'Generation failed'
                isGenerating.value = false
              }
            } catch (parseError) {
              console.warn('SSE parse error:', parseError, 'raw:', raw)
            }

            currentEvent = ''
          }
        }
      }

      buffer += decoder.decode()
      if (buffer.trim()) {
        const line = buffer.trim().replace(/\r$/, '')

        if (line.startsWith('data: ') && currentEvent) {
          const raw = line.slice(6).trim()

          try {
            const data = JSON.parse(raw)

            if (currentEvent === 'token') {
              streamedOutput.value += data.chunk || ''
            } else if (currentEvent === 'apis_used') {
              apisUsed.value = data.apis || []
            } else if (currentEvent === 'done') {
              lastSnapshotId.value = data.snapshotId
              chatMessages.value.push({
                id: Date.now(),
                role: 'assistant',
                content: `Generated ${data.filesChanged} file(s).`,
                apisUsed: data.apisUsed || [],
              })
              isGenerating.value = false
            } else if (currentEvent === 'error') {
              error.value = data.message || 'Generation failed'
              isGenerating.value = false
            }
          } catch (parseError) {
            console.warn('SSE parse error:', parseError, 'raw:', raw)
          }
        }
      }
    } catch (generationError) {
      error.value = generationError instanceof Error ? generationError.message : 'Generation failed'
    } finally {
      isGenerating.value = false
    }
  }

  return {
    isGenerating,
    streamedOutput,
    apisUsed,
    chatMessages,
    lastSnapshotId,
    error,
    generate,
  }
})
