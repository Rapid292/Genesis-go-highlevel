import { ref } from 'vue'
import { defineStore } from 'pinia'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { api } from '@/lib/api'
import { db } from '@/lib/firebase'

export type Project = {
  id: string
  name: string
  description?: string
  locationId?: string
  files?: Record<string, string>
  createdAt?: { seconds: number; nanoseconds: number } | string
  updatedAt?: { seconds: number; nanoseconds: number } | string
}

type ProjectListResponse = {
  projects?: Project[]
}

type CreateProjectResponse = {
  id?: string
  project?: Project
}

function isProject(value: unknown): value is Project {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const currentFiles = ref<Record<string, string>>({})
  const activeFile = ref<string | null>(null)
  const loading = ref(false)

  async function loadProjects() {
    loading.value = true

    try {
      const response = (await api.getProjects()) as ProjectListResponse | Project[]
      projects.value = Array.isArray(response) ? response : response.projects || []
    } finally {
      loading.value = false
    }
  }

  async function createProject(name: string, description: string) {
    loading.value = true

    try {
      const response = (await api.createProject({ name, description })) as CreateProjectResponse | Project
      const project = 'project' in response ? response.project : isProject(response) ? response : undefined
      const id = response.id || project?.id

      if (!id) {
        throw new Error('Project was created without an id')
      }

      if (project && !projects.value.some((item) => item.id === id)) {
        projects.value.unshift({ ...project, id })
      }

      return id
    } finally {
      loading.value = false
    }
  }

  async function deleteProject(id: string) {
    await api.deleteProject(id)
    projects.value = projects.value.filter((project) => project.id !== id)
  }

  function watchProject(projectId: string): Unsubscribe {
    return onSnapshot(doc(db, 'projects', projectId), (snapshot) => {
      if (!snapshot.exists()) {
        currentProject.value = null
        currentFiles.value = {}
        activeFile.value = null
        return
      }

      const project = { id: snapshot.id, ...snapshot.data() } as Project
      const files = project.files || {}

      currentProject.value = project
      currentFiles.value = files

      if (!activeFile.value || !files[activeFile.value]) {
        activeFile.value = Object.keys(files)[0] || null
      }
    })
  }

  return {
    projects,
    currentProject,
    currentFiles,
    activeFile,
    loading,
    loadProjects,
    createProject,
    deleteProject,
    watchProject,
  }
})
