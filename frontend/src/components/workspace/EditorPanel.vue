<script setup lang="ts">
import { computed } from 'vue'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { useGenerationStore } from '@/stores/generation'
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()
const generationStore = useGenerationStore()

const fileNames = computed(() => Object.keys(projectStore.currentFiles))
const activeFileContent = computed(() => {
  if (generationStore.isGenerating) {
    return generationStore.streamedOutput
  }

  return projectStore.activeFile ? projectStore.currentFiles[projectStore.activeFile] || '' : ''
})

const editorLanguage = computed(() => {
  const fileName = projectStore.activeFile || ''

  if (fileName.endsWith('.html')) return 'html'
  if (fileName.endsWith('.js')) return 'javascript'
  if (fileName.endsWith('.css')) return 'css'
  if (fileName.endsWith('.ts')) return 'typescript'
  if (fileName.endsWith('.json')) return 'json'
  return 'plaintext'
})

const editorOptions = computed(() => ({
  readOnly: generationStore.isGenerating,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on',
  wordWrap: 'on',
  scrollBeyondLastLine: false,
}))

function displayName(path: string) {
  return path.split('/').pop() || path
}

function updateActiveFile(value: string) {
  if (generationStore.isGenerating || !projectStore.activeFile) {
    return
  }

  projectStore.currentFiles[projectStore.activeFile] = value
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-muted/20">
    <div class="flex h-11 shrink-0 overflow-x-auto border-b bg-muted/40">
      <button
        v-for="fileName in fileNames"
        :key="fileName"
        type="button"
        class="shrink-0 border-r px-3 text-xs transition"
        :class="
          projectStore.activeFile === fileName
            ? 'bg-background text-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground'
        "
        @click="projectStore.activeFile = fileName"
      >
        {{ displayName(fileName) }}
      </button>
    </div>

    <div
      v-if="!fileNames.length"
      class="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
    >
      No files yet. Send a prompt.
    </div>

    <VueMonacoEditor
      v-else
      class="min-h-0 flex-1"
      height="100%"
      width="100%"
      theme="vs-dark"
      :value="activeFileContent"
      :path="projectStore.activeFile || undefined"
      :language="editorLanguage"
      :options="editorOptions"
      @change="updateActiveFile"
    />
  </section>
</template>
