<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const onboarding = useOnboardingStore()

const error = ref('')

onMounted(async () => {
  const code = route.query.code as string | undefined

  if (!code) {
    error.value = 'Invalid confirmation link. Please try signing up again.'
    return
  }

  try {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) throw exchangeError
    if (!data.session?.user) throw new Error('No session returned.')

    auth.user = data.session.user as typeof auth.user

    await onboarding.loadProgress(data.session.user.id)

    const destination = onboarding.currentStepRoute
    router.replace(destination === '/' ? '/' : destination)
  } catch (e: unknown) {
    error.value = (e as { message?: string })?.message ?? 'Email confirmation failed. Please try signing up again.'
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-[440px] p-10 text-center">
      <div v-if="!error">
        <svg class="animate-spin w-8 h-8 text-teal-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p class="text-sm text-gray-500">Confirming your email…</p>
      </div>

      <div v-else>
        <div class="mx-auto mb-4 w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 class="text-base font-semibold text-gray-900 mb-2">Confirmation failed</h2>
        <p class="text-sm text-gray-500 mb-5">{{ error }}</p>
        <router-link
          to="/signup"
          class="text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          Back to sign up
        </router-link>
      </div>
    </div>
  </div>
</template>
