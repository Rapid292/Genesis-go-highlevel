import { ref } from 'vue'
import { defineStore } from 'pinia'
import { GENERATE_URL, getToken } from '@/lib/api'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  apisUsed?: string[]
}

type SSEEvent = {
  event: string
  data: string
}

function parseData(data: string) {
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

export const useGenerationStore = defineStore('generation', () => {
  const isGenerating = ref(false)
  const streamedOutput = ref('')
  const apisUsed = ref<string[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const lastSnapshotId = ref<string | null>(null)
  const error = ref('')

  function handleEvent(sseEvent: SSEEvent) {
    const data = parseData(sseEvent.data)

    if (sseEvent.event === 'token') {
      streamedOutput.value += typeof data === 'string' ? data : data.chunk || data.token || ''
      return
    }

    if (sseEvent.event === 'apis_used') {
      apisUsed.value = Array.isArray(data.apis) ? data.apis : []
      return
    }

    if (sseEvent.event === 'done') {
      if (typeof data === 'object' && data !== null && Array.isArray(data.apisUsed)) {
        apisUsed.value = data.apisUsed
      }

      chatMessages.value.push({
        role: 'assistant',
        content: streamedOutput.value,
        apisUsed: [...apisUsed.value],
      })
      lastSnapshotId.value = typeof data === 'object' && data !== null ? data.snapshotId || null : null
      isGenerating.value = false
      return
    }

    if (sseEvent.event === 'error') {
      error.value = typeof data === 'object' && data !== null ? data.message || 'Generation failed' : String(data)
      isGenerating.value = false
    }
  }

  function parseSSEBlock(block: string): SSEEvent | null {
    let event = 'message'
    const dataLines: string[] = []

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (!dataLines.length) {
      return null
    }

    return { event, data: dataLines.join('\n') }
  }

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

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split(/\n\n/)
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          const event = parseSSEBlock(block)

          if (event) {
            handleEvent(event)
          }
        }
      }

      buffer += decoder.decode()

      if (buffer.trim()) {
        const event = parseSSEBlock(buffer)

        if (event) {
          handleEvent(event)
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
