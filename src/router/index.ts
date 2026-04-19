import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Auth
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthView.vue'),
      meta: { public: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/views/onboarding/SignupView.vue'),
      meta: { public: true },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/onboarding/VerifyEmailView.vue'),
      meta: { public: true },
    },

    // Onboarding (authenticated but incomplete)
    {
      path: '/onboarding/practice',
      name: 'onboarding-practice',
      component: () => import('@/views/onboarding/PracticeProfileView.vue'),
      meta: { onboarding: true },
    },
    {
      path: '/onboarding/clinician',
      name: 'onboarding-clinician',
      component: () => import('@/views/onboarding/ClinicianProfileView.vue'),
      meta: { onboarding: true },
    },
    {
      path: '/onboarding/insurance',
      name: 'onboarding-insurance',
      component: () => import('@/views/onboarding/InsuranceView.vue'),
      meta: { onboarding: true },
    },
    {
      path: '/onboarding/baa',
      name: 'onboarding-baa',
      component: () => import('@/views/onboarding/BaaView.vue'),
      meta: { onboarding: true },
    },
    {
      path: '/onboarding/billing',
      name: 'onboarding-billing',
      component: () => import('@/views/onboarding/BillingView.vue'),
      meta: { onboarding: true },
    },
    {
      path: '/onboarding/welcome',
      name: 'onboarding-welcome',
      component: () => import('@/views/onboarding/WelcomeView.vue'),
      meta: { onboarding: true },
    },

    // App (fully onboarded)
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
  const onboarding = useOnboardingStore()

  if (!auth.initialized) await auth.init()

  const publicRoute = to.meta.public
  const onboardingRoute = to.meta.onboarding

  // Not logged in → public routes only
  if (!auth.isAuthenticated) {
    if (!publicRoute) return { name: 'signup' }
    return
  }

  // Logged in + on public auth page → redirect based on onboarding state
  if (publicRoute && to.name !== 'verify-email') {
    if (!onboarding.progress) {
      await onboarding.loadProgress(auth.user!.id)
    }
    if (onboarding.isComplete) return { name: 'dashboard' }
    const step = onboarding.currentStepRoute
    if (step !== to.path) return { path: step }
    return
  }

  // Onboarding route — must be logged in (already checked) + not complete
  if (onboardingRoute) {
    if (!onboarding.progress) {
      await onboarding.loadProgress(auth.user!.id)
    }
    if (onboarding.isComplete) return { name: 'dashboard' }
    // Enforce linear order: redirect to first incomplete step
    const correctStep = onboarding.currentStepRoute
    if (correctStep !== to.path && correctStep !== '/') {
      return { path: correctStep }
    }
    return
  }

  // Protected app route — must be onboarded
  if (!onboarding.progress) {
    await onboarding.loadProgress(auth.user!.id)
  }

  // New user who hasn't completed onboarding
  if (onboarding.progress && !onboarding.isComplete) {
    return { path: onboarding.currentStepRoute }
  }

  // No onboarding record at all = old therapist account (backwards compat)
  // allow through
})

export default router
