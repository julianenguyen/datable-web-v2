import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/clients/:clientId',
      name: 'client-detail',
      component: () => import('@/views/ClientDetailView.vue'),
    },
    {
      path: '/clients/:clientId/session-summary',
      name: 'session-summary',
      component: () => import('@/views/SessionSummaryView.vue'),
    },
    {
      path: '/clients/:clientId/checkin-approval',
      name: 'checkin-approval',
      component: () => import('@/views/CheckinApprovalView.vue'),
    },
    {
      path: '/clients/:clientId/brief',
      name: 'presession-brief',
      component: () => import('@/views/PresessionBriefView.vue'),
    },
    {
      path: '/invite',
      name: 'invite-client',
      component: () => import('@/views/InviteClientView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.init()
  }

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'auth' }
  }

  if (to.name === 'auth' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
