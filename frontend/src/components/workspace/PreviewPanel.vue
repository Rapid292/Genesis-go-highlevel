<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { auth } from '@/lib/firebase'
import { useGenerationStore } from '@/stores/generation'
import { useProjectStore } from '@/stores/project'

defineProps<{
  projectId: string
}>()

const projectStore = useProjectStore()
const generationStore = useGenerationStore()
const iframeSrcdoc = ref('')
const iframeKey = ref(0)
const previewError = ref('')
const scriptOpen = '<' + 'script>'
const scriptClose = '<' + '/script>'
const styleOpen = '<' + 'style>'
const styleClose = '<' + '/style>'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findHtmlFile(files: Record<string, string>) {
  if (files['index.html']) {
    return files['index.html']
  }

  const firstHtmlPath = Object.keys(files).find((path) => path.endsWith('.html'))
  return firstHtmlPath ? files[firstHtmlPath] : ''
}

function assetMatchPatterns(path: string) {
  const filename = path.split('/').pop() || path
  return Array.from(new Set([path, `./${path}`, `/${path}`, filename]))
}

function inlineScripts(html: string, files: Record<string, string>) {
  let nextHtml = html

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.js')) continue

    for (const pattern of assetMatchPatterns(path)) {
      const scriptPattern = new RegExp(
        '<' + `script\\b([^>]*?)\\bsrc=["']${escapeRegExp(pattern)}["']([^>]*)>\\s*` + scriptClose,
        'gi',
      )
      nextHtml = nextHtml.replace(scriptPattern, `${scriptOpen}${content}${scriptClose}`)
    }
  }

  return nextHtml
}

function inlineStyles(html: string, files: Record<string, string>) {
  let nextHtml = html

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith('.css')) continue

    for (const pattern of assetMatchPatterns(path)) {
      const linkPattern = new RegExp(
        `<link\\b([^>]*?)\\bhref=["']${escapeRegExp(pattern)}["']([^>]*?)>`,
        'gi',
      )
      nextHtml = nextHtml.replace(linkPattern, `${styleOpen}${content}${styleClose}`)
    }
  }

  return nextHtml
}

async function buildPreview() {
  previewError.value = ''
  const files = projectStore.currentFiles
  const html = findHtmlFile(files)

  if (!html) {
    iframeSrcdoc.value = ''
    iframeKey.value += 1
    return
  }

  const token = await auth.currentUser?.getIdToken(true)

  if (!token) {
    previewError.value = 'Sign in again to preview this app.'
    return
  }

  const locationId = projectStore.currentProject?.locationId || ''
  const configScript = `${scriptOpen}
window.__HL_CONFIG__ = {
  proxyUrl: '${import.meta.env.VITE_HL_PROXY_URL}',
  locationId: '${locationId}',
  firebaseToken: '${token}'
};
${scriptClose}`
  let fullHtml = inlineStyles(inlineScripts(html, files), files)

  if (fullHtml.includes('</head>')) {
    fullHtml = fullHtml.replace('</head>', configScript + '</head>')
  } else if (fullHtml.includes('</body>')) {
    fullHtml = fullHtml.replace('</body>', configScript + '</body>')
  } else {
    fullHtml = configScript + fullHtml
  }

  iframeSrcdoc.value = fullHtml
  iframeKey.value += 1
}

watch(
  () => generationStore.isGenerating,
  (isGenerating, wasGenerating) => {
    if (wasGenerating && !isGenerating) {
      void buildPreview()
    }
  },
)

watch(
  () => projectStore.currentFiles,
  (files) => {
    if (Object.keys(files).length) {
      void buildPreview()
    }
  },
  { deep: true, once: true },
)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col border-l bg-background">
    <header class="flex h-11 shrink-0 items-center justify-between border-b px-3">
      <span class="text-sm font-medium">Preview</span>
      <Button type="button" variant="ghost" size="sm" @click="buildPreview">Refresh</Button>
    </header>

    <div v-if="previewError" class="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {{ previewError }}
    </div>

    <div
      v-if="!iframeSrcdoc"
      class="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
    >
      Preview will appear after Genesis creates an HTML file.
    </div>

    <iframe
      v-else
      :key="iframeKey"
      class="w-full flex-1 border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms"
      :srcdoc="iframeSrcdoc"
    />
  </section>
</template>
