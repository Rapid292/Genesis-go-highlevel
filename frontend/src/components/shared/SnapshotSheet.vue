<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useGenerationStore } from '@/stores/generation'

const props = defineProps<{
  projectId: string
}>()

type TimestampLike = {
  seconds?: number
  nanoseconds?: number
  _seconds?: number
  _nanoseconds?: number
}

type Snapshot = {
  id: string
  prompt?: string
  createdAt?: TimestampLike | string
  apisUsed?: string[]
}

type SnapshotsResponse = {
  snapshots?: Snapshot[]
}

const open = ref(false)
const snapshots = ref<Snapshot[]>([])
const loading = ref(false)
const restoringId = ref<string | null>(null)
const error = ref('')
const generationStore = useGenerationStore()

function formatDate(ts: Snapshot['createdAt']): string {
  if (!ts) return 'Unknown date'

  if (typeof ts === 'object' && ts._seconds) {
    return new Date(ts._seconds * 1000).toLocaleString()
  }

  if (typeof ts === 'object' && ts.seconds) {
    return new Date(ts.seconds * 1000).toLocaleString()
  }

  const date = new Date(ts as string)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

async function loadSnapshots() {
  loading.value = true
  error.value = ''

  try {
    const response = (await api.getSnapshots(props.projectId)) as SnapshotsResponse | Snapshot[]
    snapshots.value = Array.isArray(response) ? response : response.snapshots || []
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load snapshots'
  } finally {
    loading.value = false
  }
}

async function restore(snapshot: Snapshot) {
  if (!window.confirm('Restore this version? Current files will be replaced.')) {
    return
  }

  restoringId.value = snapshot.id
  error.value = ''

  try {
    await api.restoreSnapshot(props.projectId, snapshot.id)
    generationStore.chatMessages.push({
      id: Date.now(),
      role: 'assistant',
      content: `Restored snapshot from ${formatDate(snapshot.createdAt)}. Prompt was: "${snapshot.prompt}"`,
      apisUsed: snapshot.apisUsed || [],
    })
    open.value = false
  } catch (restoreError) {
    error.value = restoreError instanceof Error ? restoreError.message : 'Unable to restore snapshot'
  } finally {
    restoringId.value = null
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    void loadSnapshots()
  }
})
</script>

<template>
  <Sheet v-model:open="open">
    <SheetTrigger as-child>
      <slot>
        <Button type="button" variant="outline" size="sm">History</Button>
      </slot>
    </SheetTrigger>
    <SheetContent class="w-full sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Version History</SheetTitle>
      </SheetHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p
          v-if="error"
          class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {{ error }}
        </p>

        <div v-if="loading" class="mt-4 space-y-3">
          <Skeleton v-for="index in 3" :key="index" class="h-28 rounded-lg" />
        </div>

        <p v-else-if="!snapshots.length" class="mt-4 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No snapshots yet.
        </p>

        <div v-else class="mt-4 space-y-3">
          <Card v-for="snapshot in snapshots" :key="snapshot.id" class="p-3">
            <div class="space-y-3">
              <p class="text-sm font-medium">{{ formatDate(snapshot.createdAt) }}</p>
              <p class="line-clamp-2 text-sm text-muted-foreground">
                {{ snapshot.prompt || 'No prompt recorded.' }}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="restoringId === snapshot.id"
                @click="restore(snapshot)"
              >
                {{ restoringId === snapshot.id ? 'Restoring...' : 'Restore' }}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
