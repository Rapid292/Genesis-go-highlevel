<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { Unsubscribe } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import ChatPanel from '../components/workspace/ChatPanel.vue'
import EditorPanel from '../components/workspace/EditorPanel.vue'
import PreviewPanel from '../components/workspace/PreviewPanel.vue'
import SnapshotSheet from '../components/shared/SnapshotSheet.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const projectStore = useProjectStore()

const projectId = computed(() => String(route.params.projectId))

let unsubscribeProject: Unsubscribe | null = null

onMounted(() => {
  unsubscribeProject = projectStore.watchProject(projectId.value)
})

onUnmounted(() => {
  unsubscribeProject?.()
  unsubscribeProject = null
})
</script>

<template>
  <main class="flex h-screen flex-col overflow-hidden bg-background">
    <header class="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-4 py-2">
      <RouterLink class="text-sm text-muted-foreground transition hover:text-foreground" to="/dashboard">
        ← Dashboard
      </RouterLink>

      <h1 class="max-w-[42vw] truncate text-sm font-medium">
        {{ projectStore.currentProject?.name || 'Workspace' }}
      </h1>

      <div class="flex justify-end">
        <SnapshotSheet :project-id="projectId">
          <Button type="button" variant="outline" size="sm">History</Button>
        </SnapshotSheet>
      </div>
    </header>

    <ResizablePanelGroup direction="horizontal" class="min-h-0 flex-1">
      <ResizablePanel :default-size="25" :min-size="20">
        <ChatPanel :project-id="projectId" />
      </ResizablePanel>
      <ResizableHandle with-handle />
      <ResizablePanel :default-size="42" :min-size="25">
        <EditorPanel />
      </ResizablePanel>
      <ResizableHandle with-handle />
      <ResizablePanel :default-size="33" :min-size="20">
        <PreviewPanel :project-id="projectId" />
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</template>
