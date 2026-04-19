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
    await onboarding.complete()
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
      <!-- Stripe not configured banner -->
      <div class="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <svg class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p class="text-xs text-amber-700 leading-relaxed">
          Payment processing requires Stripe setup. Add <code class="font-mono bg-amber-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> to your <code class="font-mono bg-amber-100 px-1 rounded">.env</code> file to enable card collection.
        </p>
      </div>

      <!-- Two-column layout -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- Left: Payment form (placeholder) -->
        <div class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-800">Payment details</h3>
          <p class="text-xs text-gray-500">Payment processing via Stripe — enter your card details below</p>

          <div class="space-y-3 opacity-50 pointer-events-none select-none">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Card number</label>
              <div class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-400">
                •••• •••• •••• ••••
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Expiry</label>
                <div class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-400">
                  MM / YY
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">CVC</label>
                <div class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-400">
                  •••
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Billing ZIP</label>
              <div class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-400">
                •••••
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled
            class="w-full bg-teal-600 opacity-40 cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg"
          >
            Start Free Trial
          </button>

          <p class="text-xs text-gray-400 text-center">
            Add <code class="font-mono">VITE_STRIPE_PUBLISHABLE_KEY</code> to enable payments
          </p>
        </div>

        <!-- Right: Plan summary -->
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

      <!-- Dev mode skip -->
      <div class="border-t border-gray-100 pt-4">
        <button
          @click="handleSkip"
          :disabled="loading"
          class="w-full border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="loading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ loading ? 'Activating trial…' : 'Skip billing for now (dev mode)' }}
        </button>
        <p class="text-center text-xs text-gray-400 mt-2">
          Trial is activated automatically. Stripe required before going live.
        </p>
      </div>
    </div>
  </OnboardingLayout>
</template>
