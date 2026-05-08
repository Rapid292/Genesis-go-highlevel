<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const isSubmitting = ref(false)

async function submit() {
  if (!email.value || !password.value || isSubmitting.value) {
    return
  }

  isSubmitting.value = true

  try {
    if (isSignUp.value) {
      await authStore.signUp(email.value, password.value)
    } else {
      await authStore.signIn(email.value, password.value)
    }

    await router.push('/dashboard')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-2 text-center">
        <CardTitle class="text-3xl">Genesis</CardTitle>
        <CardDescription>AI-Powered HighLevel App Builder</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-5" @submit.prevent="submit">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              v-model="email"
              autocomplete="email"
              type="email"
              required
              @keyup.enter="submit"
            />
          </div>

          <div class="space-y-2">
            <Label for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              autocomplete="current-password"
              type="password"
              required
              @keyup.enter="submit"
            />
          </div>

          <p v-if="authStore.error" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ authStore.error }}
          </p>

          <Button class="w-full" type="submit" :disabled="isSubmitting || authStore.loading">
            {{ isSubmitting ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in' }}
          </Button>
        </form>

        <Button
          class="mt-4 w-full"
          type="button"
          variant="ghost"
          :disabled="isSubmitting"
          @click="isSignUp = !isSignUp"
        >
          {{ isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up' }}
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
