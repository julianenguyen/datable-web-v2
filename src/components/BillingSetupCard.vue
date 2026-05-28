<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Receipt, X } from 'lucide-vue-next'

const props = defineProps<{
  wizardStep?: number
}>()

const router = useRouter()

// Session-scoped dismissal: key is reset on next login since sessionStorage is cleared
const DISMISS_KEY = 'billing_setup_card_dismissed'
const isDismissed = ref(sessionStorage.getItem(DISMISS_KEY) === '1')

function dismiss() {
  sessionStorage.setItem(DISMISS_KEY, '1')
  isDismissed.value = true
}

function continueSetup() {
  router.push('/billing-setup')
}

const STEP_LABELS = [
  'Authorization',
  'NPI Verification',
  'License Details',
  'Billing Profile',
  'Payer Credentials',
]

// Current step (1-5) for the progress display — default to 1 if unknown
const displayStep = props.wizardStep && props.wizardStep >= 1 && props.wizardStep <= 5
  ? props.wizardStep
  : 1
</script>

<template>
  <div
    v-if="!isDismissed"
    class="bg-white rounded-xl border border-gray-200 border-l-4 border-l-teal-500 p-5 mb-6"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-start gap-3 flex-1">
        <div class="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
          <Receipt class="w-4 h-4 text-teal-600" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-semibold text-gray-900">Complete Your Billing Setup</h3>
          <p class="text-xs text-gray-500 mt-0.5 mb-3">
            Add your TIN, billing address, and payer credentials to enable insurance billing.
          </p>

          <!-- Step progress bar -->
          <div class="mb-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-500">
                Step {{ displayStep }} of {{ STEP_LABELS.length }}
                <span class="text-gray-400">— {{ STEP_LABELS[displayStep - 1] }}</span>
              </span>
              <span class="text-xs font-medium text-teal-600">
                {{ Math.round(((displayStep - 1) / STEP_LABELS.length) * 100) }}% complete
              </span>
            </div>
            <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-teal-500 rounded-full transition-all"
                :style="{ width: `${((displayStep - 1) / STEP_LABELS.length) * 100}%` }"
              />
            </div>
          </div>

          <button
            @click="continueSetup"
            class="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors"
          >
            {{ displayStep > 1 ? 'Continue Setup' : 'Start Setup' }}
          </button>
        </div>
      </div>

      <!-- Dismiss button -->
      <button
        @click="dismiss"
        class="text-gray-400 hover:text-gray-600 transition-colors shrink-0 mt-0.5"
        title="Dismiss until next login"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
