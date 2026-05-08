import { createRouter, createWebHistory } from 'vue-router'
import { auth, waitForUser } from '@/lib/firebase'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/workspace/:projectId',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const user = auth.currentUser || (await waitForUser())

  if (to.meta.requiresAuth && !user) {
    return '/auth'
  }

  if (user && to.path === '/auth') {
    return '/dashboard'
  }
})

export default router
