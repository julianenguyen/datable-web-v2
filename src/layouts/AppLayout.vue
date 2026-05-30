<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { useRouter } from 'vue-router'
import { LogOut, LayoutDashboard, Receipt } from 'lucide-vue-next'
import BillingStatusBanner from '@/components/BillingStatusBanner.vue'
import ExpirationWarningBanner from '@/components/ExpirationWarningBanner.vue'
import OnboardingWizard from '@/components/OnboardingWizard.vue'

const auth = useAuthStore()
const onboarding = useOnboardingStore()
const router = useRouter()

function handleWizardComplete() {
  // Store flag in Pinia so it survives per-view AppLayout remounts
  onboarding.credentialWizardDone = true
}

async function handleSignOut() {
  await auth.signOut()
  router.push('/auth')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex">
    <!-- Sidebar -->
    <aside class="w-56 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-10">
      <!-- Logo -->
      <div class="h-14 flex items-center px-5 border-b border-gray-100">
        <img src="/logo-teal.png" alt="Datable Health" class="h-7" />
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-0.5">
        <router-link
          to="/"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="$route.path === '/'
            ? 'bg-teal-50 text-teal-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
        >
          <LayoutDashboard class="w-4 h-4 shrink-0" />
          Client Roster
        </router-link>

        <router-link
          to="/billing"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="$route.path.startsWith('/billing')
            ? 'bg-teal-50 text-teal-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
        >
          <Receipt class="w-4 h-4 shrink-0" />
          Billing
        </router-link>
      </nav>

      <!-- Footer -->
      <div class="px-3 py-4 border-t border-gray-100">
        <router-link
          to="/settings"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1 transition-colors hover:bg-gray-50 group"
          :class="$route.path === '/settings' ? 'bg-teal-50' : ''"
        >
          <div class="w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold shrink-0">
            {{ (auth.profile?.name || (auth.user?.user_metadata?.name as string) || auth.user?.email || '?')[0].toUpperCase() }}
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium text-gray-900 truncate group-hover:text-teal-700 transition-colors">{{ auth.profile?.name || (auth.user?.user_metadata?.name as string) || auth.user?.email }}</p>
            <p class="text-xs text-gray-400 truncate">{{ ('practice_name' in (auth.profile ?? {})) ? (auth.profile as { practice_name: string | null }).practice_name ?? 'Provider' : 'Provider' }}</p>
          </div>
        </router-link>
        <button
          @click="handleSignOut"
          class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <LogOut class="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <div class="ml-56 flex-1 flex flex-col min-h-screen">
      <BillingStatusBanner />
      <ExpirationWarningBanner />
      <slot />
    </div>
  </div>

  <!-- Phase 1 credential wizard — shown as full-screen overlay until complete -->
  <OnboardingWizard v-if="!onboarding.credentialWizardDone" @complete="handleWizardComplete" />
</template>
