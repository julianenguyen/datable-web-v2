<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import OnboardingLayout from './OnboardingLayout.vue'

const router = useRouter()
const auth = useAuthStore()
</script>

<template>
  <OnboardingLayout
    :current-step="1"
    title="Account created"
    subtitle="Your provider account is set up and verified."
  >
    <div class="space-y-5">
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Full name</p>
          <p class="text-sm text-gray-900 font-medium">{{ auth.user?.user_metadata?.name || '—' }}</p>
        </div>
        <div class="border-t border-gray-100 pt-3">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
          <p class="text-sm text-gray-900">{{ auth.user?.email || '—' }}</p>
        </div>
        <div class="border-t border-gray-100 pt-3 flex items-center gap-2">
          <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p class="text-xs text-green-600 font-medium">Email verified</p>
        </div>
      </div>

      <p class="text-xs text-gray-400 text-center">
        To change your email or password, visit account settings after completing onboarding.
      </p>

      <button
        @click="router.push('/onboarding/practice')"
        class="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        Continue to Practice Profile →
      </button>
    </div>
  </OnboardingLayout>
</template>
