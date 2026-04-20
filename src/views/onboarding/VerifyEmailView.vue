<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useOnboardingStore } from '@/stores/onboarding'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const onboarding = useOnboardingStore()
const auth = useAuthStore()

const email = ref((route.query.email as string) || '')
const resendLoading = ref(false)
const resendSuccess = ref(false)
const resendCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null
// Guard against double-redirect: onMounted and onAuthStateChange can both fire
// if the user lands on this page with an existing session.
let redirecting = false

async function resendEmail() {
  if (resendCooldown.value > 0 || !email.value) return
  resendLoading.value = true
  resendSuccess.value = false
  try {
    await supabase.auth.resend({ type: 'signup', email: email.value })
    resendSuccess.value = true
    resendCooldown.value = 60
    cooldownTimer = setInterval(() => {
      resendCooldown.value--
      if (resendCooldown.value <= 0) {
        clearInterval(cooldownTimer!)
        cooldownTimer = null
      }
    }, 1000)
  } catch {
    // Silently fail — Supabase rate-limits resend anyway
  } finally {
    resendLoading.value = false
  }
}

// Listen for email verification → redirect to onboarding.
// Guard with `redirecting` so onMounted and this listener don't both fire a
// loadProgress + push when the user lands here with an existing session.
const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
  if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
    if (redirecting) return
    redirecting = true
    auth.user = session.user as typeof auth.user
    await onboarding.loadProgress(session.user.id)
    router.push('/onboarding/practice')
  }
})

onUnmounted(() => {
  subscription.unsubscribe()
  if (cooldownTimer) clearInterval(cooldownTimer)
})

onMounted(() => {
  // If already authenticated when this page mounts (e.g. browser refresh after
  // confirming email), redirect immediately — onAuthStateChange won't fire SIGNED_IN.
  if (auth.isAuthenticated && auth.user) {
    if (redirecting) return
    redirecting = true
    onboarding.loadProgress(auth.user.id).then(() => {
      router.push('/onboarding/practice')
    })
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-[440px] p-10 text-center">
      <!-- Mail icon -->
      <div class="mx-auto mb-5 w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>

      <h1 class="text-xl font-semibold text-gray-900 mb-2">Check your inbox</h1>
      <p class="text-sm text-gray-500 leading-relaxed">
        We sent a verification link to
        <span class="font-medium text-gray-700">{{ email || 'your email address' }}</span>.
        Click the link to continue setting up your account.
      </p>

      <div class="mt-6 pt-6 border-t border-gray-100">
        <p class="text-xs text-gray-400 mb-3">Didn't receive it? Check your spam folder first.</p>

        <div v-if="resendSuccess" class="text-sm text-teal-600 font-medium mb-3">
          Sent! Check your inbox.
        </div>

        <button
          @click="resendEmail"
          :disabled="resendCooldown > 0 || resendLoading"
          class="text-sm font-medium text-teal-600 hover:text-teal-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="resendLoading">Sending…</span>
          <span v-else-if="resendCooldown > 0">Resend in {{ resendCooldown }}s</span>
          <span v-else>Resend verification email</span>
        </button>
      </div>

      <p class="mt-6 text-xs text-gray-400">
        Wrong email?
        <router-link to="/signup" class="text-teal-600 hover:text-teal-700">Start over</router-link>
      </p>
    </div>
  </div>
</template>
