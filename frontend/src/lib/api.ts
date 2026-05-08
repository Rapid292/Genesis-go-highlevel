import { auth } from './firebase'

const PROJECTS_URL = import.meta.env.VITE_PROJECTS_API_URL
const SNAPSHOTS_URL = import.meta.env.VITE_SNAPSHOTS_API_URL
export const GENERATE_URL = import.meta.env.VITE_GENERATE_URL
export const HL_PROXY_URL = import.meta.env.VITE_HL_PROXY_URL

type FetchOptions = RequestInit & {
  headers?: HeadersInit
}

export async function getToken(): Promise<string> {
  const user = auth.currentUser

  if (!user) {
    throw new Error('User is not authenticated')
  }

  return user.getIdToken()
}

export async function apiFetch<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const token = await getToken()
  const headers = new Headers(options.headers)

  headers.set('Authorization', `Bearer ${token}`)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const data = await response.json()
      message = data.error || data.message || message
    } catch {
      const text = await response.text()
      message = text || message
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const api = {
  getProjects() {
    return apiFetch(PROJECTS_URL)
  },

  createProject(data: { name: string; description?: string }) {
    return apiFetch(PROJECTS_URL, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateProject(id: string, data: Record<string, unknown>) {
    return apiFetch(`${PROJECTS_URL}?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deleteProject(id: string) {
    return apiFetch(`${PROJECTS_URL}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  getSnapshots(projectId: string) {
    return apiFetch(`${SNAPSHOTS_URL}?projectId=${encodeURIComponent(projectId)}`)
  },

  restoreSnapshot(projectId: string, snapshotId: string) {
    return apiFetch(`${SNAPSHOTS_URL}?projectId=${encodeURIComponent(projectId)}&action=restore`, {
      method: 'POST',
      body: JSON.stringify({ snapshotId }),
    })
  },

  getHLAuthUrl(uid: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: import.meta.env.VITE_HL_CLIENT_ID,
      redirect_uri: import.meta.env.VITE_REDIRECT_URI,
      scope:
        'contacts.readonly contacts.write conversations.readonly conversations.write calendars.readonly locations.readonly',
      state: uid,
    })

    return `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`
  },
}
