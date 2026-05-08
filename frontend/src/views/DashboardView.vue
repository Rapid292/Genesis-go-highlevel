<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { auth, waitForUser } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore, type Project } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const projectStore = useProjectStore()

const name = ref('')
const description = ref('')
const statusMessage = ref('')
const statusType = ref<'success' | 'error' | ''>('')
const isCreating = ref(false)
const isConnectingHL = ref(false)
const isSigningOut = ref(false)

const canCreate = computed(() => !!name.value.trim() && !isCreating.value)

function formatDate(value: Project['createdAt']) {
  if (!value) {
    return 'No date'
  }

  const date =
    typeof value === 'string'
      ? new Date(value)
      : new Date(value.seconds * 1000 + Math.floor(value.nanoseconds / 1_000_000))

  if (Number.isNaN(date.getTime())) {
    return 'No date'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

async function connectHighLevel() {
  isConnectingHL.value = true
  statusMessage.value = ''
  statusType.value = ''

  const firebaseUser = authStore.user || auth.currentUser || (await waitForUser())

  if (!firebaseUser) {
    isConnectingHL.value = false
    statusMessage.value = 'Sign in again before connecting HighLevel.'
    statusType.value = 'error'
    return
  }

  window.location.assign(api.getHLAuthUrl(firebaseUser.uid))
}

async function createProject() {
  if (!canCreate.value) {
    return
  }

  isCreating.value = true

  try {
    const id = await projectStore.createProject(name.value.trim(), description.value.trim())
    await router.push(`/workspace/${id}`)
  } finally {
    isCreating.value = false
  }
}

async function deleteProject(project: Project) {
  if (!window.confirm(`Delete "${project.name}"?`)) {
    return
  }

  await projectStore.deleteProject(project.id)
}

async function handleSignOut() {
  isSigningOut.value = true
  statusMessage.value = ''
  statusType.value = ''

  try {
    await authStore.logOut()
    await router.replace('/auth')
  } catch (signOutError) {
    statusMessage.value = signOutError instanceof Error ? signOutError.message : 'Unable to sign out'
    statusType.value = 'error'
  } finally {
    isSigningOut.value = false
  }
}

onMounted(async () => {
  if (route.query.hl_connected === 'true') {
    await authStore.reloadHLStatus()
    statusMessage.value = 'HighLevel connected.'
    statusType.value = 'success'
  }

  if (route.query.hl_error === 'true') {
    statusMessage.value = 'HighLevel connection failed.'
    statusType.value = 'error'
  }

  if (route.query.hl_connected || route.query.hl_error) {
    window.history.replaceState({}, document.title, '/dashboard')
  }

  await projectStore.loadProjects()
})
</script>

<template>
  <main class="min-h-screen bg-muted/20">
    <header class="border-b bg-background">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <h1 class="text-2xl font-semibold tracking-normal">Genesis</h1>

        <div class="flex items-center gap-3">
          <Badge v-if="authStore.hlConnected" variant="secondary">
            {{ `✓ ${authStore.hlLocationName || 'HighLevel'}` }}
          </Badge>
          <Button v-else type="button" variant="outline" :disabled="isConnectingHL" @click="connectHighLevel">
            {{ isConnectingHL ? 'Connecting...' : 'Connect HighLevel' }}
          </Button>
          <Button type="button" variant="ghost" :disabled="isSigningOut" @click="handleSignOut">
            {{ isSigningOut ? 'Signing out...' : 'Sign out' }}
          </Button>
        </div>
      </div>
    </header>

    <section class="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <p
        v-if="statusMessage"
        class="rounded-md border px-4 py-3 text-sm"
        :class="statusType === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-destructive/30 bg-destructive/10 text-destructive'"
      >
        {{ statusMessage }}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>Create a workspace for a new HighLevel app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="grid gap-4 md:grid-cols-[1fr_1fr_auto]" @submit.prevent="createProject">
            <div class="space-y-2">
              <Label for="project-name">Name</Label>
              <Input id="project-name" v-model="name" required placeholder="Lead follow-up dashboard" />
            </div>

            <div class="space-y-2">
              <Label for="project-description">Description</Label>
              <Input id="project-description" v-model="description" placeholder="Optional context" />
            </div>

            <div class="flex items-end">
              <Button class="w-full md:w-auto" type="submit" :disabled="!canCreate">
                {{ isCreating ? 'Creating...' : 'Create' }}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold">Projects</h2>
          <p class="text-sm text-muted-foreground">Open an existing generated app workspace.</p>
        </div>

        <div v-if="projectStore.loading" class="grid gap-4 md:grid-cols-3">
          <Skeleton v-for="index in 3" :key="index" class="h-36 rounded-lg" />
        </div>

        <p v-else-if="!projectStore.projects.length" class="rounded-lg border border-dashed bg-background px-4 py-10 text-center text-sm text-muted-foreground">
          No projects yet.
        </p>

        <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card
            v-for="project in projectStore.projects"
            :key="project.id"
            class="cursor-pointer transition hover:border-primary/40 hover:shadow-sm"
            @click="router.push(`/workspace/${project.id}`)"
          >
            <CardHeader>
              <CardTitle class="text-base">{{ project.name }}</CardTitle>
              <CardDescription>{{ project.description || 'No description' }}</CardDescription>
            </CardHeader>
            <CardContent class="flex items-center justify-between gap-3">
              <span class="text-sm text-muted-foreground">{{ formatDate(project.createdAt) }}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                @click.stop="deleteProject(project)"
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  </main>
</template>
