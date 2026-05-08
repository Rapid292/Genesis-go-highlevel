<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useGenerationStore } from '@/stores/generation'

defineProps<{
  projectId: string
}>()

const generationStore = useGenerationStore()
const prompt = ref('')
const messagesEl = ref<HTMLElement | null>(null)

function apiLabel(apiName: string) {
  const normalized = apiName.toLowerCase()

  if (normalized.includes('contact')) return 'Contacts'
  if (normalized.includes('conversation')) return 'Conversations'
  if (normalized.includes('calendar')) return 'Calendars'
  return apiName
}

async function scrollToBottom() {
  await nextTick()

  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

async function send(projectId: string) {
  const nextPrompt = prompt.value.trim()

  if (!nextPrompt || generationStore.isGenerating) {
    return
  }

  prompt.value = ''
  await generationStore.generate(projectId, nextPrompt)
}

function handleKeydown(event: KeyboardEvent, projectId: string) {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) {
    return
  }

  event.preventDefault()
  void send(projectId)
}

watch(
  () => [generationStore.chatMessages.length, generationStore.streamedOutput, generationStore.isGenerating],
  () => {
    void scrollToBottom()
  },
  { flush: 'post' },
)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col border-r bg-background">
    <header class="flex h-11 shrink-0 items-center justify-between border-b px-3">
      <span class="text-sm font-medium">Chat</span>
      <span v-if="generationStore.isGenerating" class="text-xs text-muted-foreground">Streaming</span>
    </header>

    <div ref="messagesEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div
        v-if="!generationStore.chatMessages.length && !generationStore.isGenerating"
        class="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
      >
        Describe the HighLevel app you want to build. Generated files will stream into the editor.
      </div>

      <div
        v-for="(message, index) in generationStore.chatMessages"
        :key="`${message.role}-${index}`"
        class="flex"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[88%] rounded-lg p-3 text-sm leading-6"
          :class="message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'"
        >
          <p class="whitespace-pre-wrap">{{ message.content }}</p>
          <div v-if="message.role === 'assistant' && message.apisUsed?.length" class="mt-3 flex flex-wrap gap-1.5">
            <Badge
              v-for="apiName in message.apisUsed"
              :key="apiName"
              variant="outline"
              class="bg-background/60"
            >
              {{ apiLabel(apiName) }}
            </Badge>
          </div>
        </div>
      </div>

      <div v-if="generationStore.isGenerating" class="flex justify-start">
        <div class="flex items-center gap-1 rounded-lg bg-muted px-3 py-3">
          <span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
          <span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
          <span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
        </div>
      </div>

      <div
        v-if="generationStore.error"
        class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {{ generationStore.error }}
      </div>
    </div>

    <div class="shrink-0 border-t p-3">
      <div class="flex flex-col gap-2">
        <textarea
          v-model="prompt"
          class="min-h-16 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Ask Genesis to build or revise this app..."
          :disabled="generationStore.isGenerating"
          @keydown="handleKeydown($event, projectId)"
        />
        <Button
          class="self-end"
          type="button"
          :disabled="generationStore.isGenerating || !prompt.trim()"
          @click="send(projectId)"
        >
          Send
        </Button>
      </div>
    </div>
  </section>
</template>
