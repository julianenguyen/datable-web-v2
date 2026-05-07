<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useOnboardingStore } from '@/stores/onboarding'
import OnboardingLayout from './OnboardingLayout.vue'

const router = useRouter()
const onboarding = useOnboardingStore()

const loading = ref(false)
const error = ref('')

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined
const stripeConfigured = computed(() => !!STRIPE_KEY)

const trialEndDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
})

async function handleSkip() {
  if (!onboarding.practiceId) return
  error.value = ''
  loading.value = true
  try {
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 30)

    const { error: practiceErr } = await supabase
      .from('practices')
      .update({
        trial_ends_at: trialEndsAt.toISOString(),
        subscription_status: 'trialing',
      })
      .eq('id', onboarding.practiceId)

    if (practiceErr) throw practiceErr

    await onboarding.markStep('step_trial_activated')
    // Do NOT call complete() here — WelcomeView calls it.
    // Calling it here sets completed_at before navigation, causing the router
    // guard to redirect away from /onboarding/welcome (since currentStepRoute
    // becomes '/') and the welcome screen is never shown.
    router.push('/onboarding/welcome')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <OnboardingLayout
    :current-step="6"
    title="Start your free trial"
    subtitle="30 days free — no charge today."
  >
    <template #back>
      <router-link
        to="/onboarding/baa"
        class="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5 -mt-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </router-link>
    </template>

    <div class="space-y-5">
      <!-- Plan summary (full width when Stripe not configured) -->
      <div :class="stripeConfigured ? 'grid grid-cols-1 md:grid-cols-2 gap-5' : ''">
        <!-- Stripe payment form (only when configured) -->
        <div v-if="stripeConfigured" class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-800">Payment details</h3>
          <p class="text-xs text-gray-500">Payment processing via Stripe — enter your card details below</p>
          <!-- Stripe Elements mount point would go here -->
        </div>

        <!-- Plan summary -->
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Plan summary</p>
            <p class="text-sm font-semibold text-gray-900">Datable Health — Professional</p>
          </div>

          <div class="space-y-2.5">
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-600">Free trial period</span>
              <span class="text-gray-900 font-medium">30 days</span>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-600">Trial ends</span>
              <span class="text-gray-900 font-medium">{{ trialEndDate }}</span>
            </div>
            <div class="flex justify-between items-center text-sm border-t border-gray-200 pt-2.5 mt-2">
              <span class="text-gray-700 font-medium">Due today</span>
              <span class="text-gray-900 font-semibold">$0.00</span>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-600">After trial</span>
              <span class="text-gray-900 font-medium">$149 / month</span>
            </div>
          </div>

          <div class="border-t border-gray-200 pt-4">
            <p class="text-xs font-semibold text-gray-500 mb-2">Included:</p>
            <ul class="space-y-1.5">
              <li class="flex items-start gap-2 text-xs text-gray-600">
                <svg class="w-3.5 h-3.5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                AI-powered pre-session briefs
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-600">
                <svg class="w-3.5 h-3.5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Post-session documentation
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-600">
                <svg class="w-3.5 h-3.5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Daily patient check-ins
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-600">
                <svg class="w-3.5 h-3.5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                CPT code documentation support
              </li>
            </ul>
          </div>

          <p class="text-xs text-gray-400 italic">
            Cancel anytime before {{ trialEndDate }} at no cost.
          </p>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {{ error }}
      </div>

      <!-- Start trial CTA -->
      <div class="border-t border-gray-100 pt-4">
        <button
          @click="handleSkip"
          :disabled="loading"
          class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg v-if="loading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ loading ? 'Activating your trial…' : 'Start Free Trial →' }}
        </button>
        <p class="text-center text-xs text-gray-400 mt-2">
          No credit card required today. You'll be charged $149/month after your trial ends.
        </p>
      </div>
    </div>
  </OnboardingLayout>
</template>
