<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Loader2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

interface OnboardingProgress {
  step_credentials_complete: boolean
  step_billing_complete: boolean
  step_patient_invited: boolean
  all_steps_complete: boolean
  dismissed_at: string | null
}

const props = defineProps<{
  progress: OnboardingProgress
}>()

const emit = defineEmits<{
  dismiss: []
  'open-add-patient': []
}>()

const router = useRouter()
const dismissing = ref(false)

const completedCount = computed(() => {
  let n = 0
  if (props.progress.step_credentials_complete) n++
  if (props.progress.step_billing_complete) n++
  if (props.progress.step_patient_invited) n++
  return n
})

const progressPercent = computed(() => Math.round((completedCount.value / 3) * 100))

const steps = computed(() => [
  {
    key: 'credentials',
    title: 'Complete credential setup',
    description: 'Verify your NPI and license to enable G0323 billing.',
    actionLabel: 'Set up credentials',
    complete: props.progress.step_credentials_complete,
    onAction: () => router.push('/settings/credentials'),
  },
  {
    key: 'billing',
    title: 'Complete billing setup',
    description: 'Add your TIN and billing profile to start submitting claims.',
    actionLabel: 'Set up billing',
    complete: props.progress.step_billing_complete,
    onAction: () => router.push('/billing-setup'),
  },
  {
    key: 'patient',
    title: 'Invite your first patient',
    description: 'Send an invitation so your patient can join Datable.',
    actionLabel: 'Invite a patient',
    complete: props.progress.step_patient_invited,
    onAction: () => emit('open-add-patient'),
  },
])

async function handleDismiss() {
  dismissing.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    await fetch(`${EDGE_FUNCTION_URL}/onboarding/dismiss`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    emit('dismiss')
  } catch (e) {
    console.error('[GettingStartedChecklist] dismiss failed:', e)
  } finally {
    dismissing.value = false
  }
}
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-lg p-6 mb-6">
    <!-- Header row -->
    <div class="flex items-center justify-between mb-3">
      <div>
        <template v-if="progress.all_steps_complete">
          <h2 class="text-base font-semibold text-teal-700">You're all set!</h2>
          <p class="text-sm text-gray-500 mt-0.5">You've completed the setup. You can dismiss this when you're ready.</p>
        </template>
        <template v-else>
          <h2 class="text-base font-semibold text-gray-900">Get started with Datable</h2>
        </template>
      </div>
      <div class="flex items-center gap-3 shrink-0 ml-4">
        <span class="text-sm text-gray-500">{{ completedCount }} of 3 complete</span>
        <button
          v-if="progress.all_steps_complete"
          @click="handleDismiss"
          :disabled="dismissing"
          class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
        >
          <Loader2 v-if="dismissing" class="animate-spin" :size="13" />
          {{ dismissing ? 'Dismissing…' : 'Dismiss' }}
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
      <div
        class="h-full bg-teal-600 rounded-full transition-all duration-500"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>

    <!-- Steps -->
    <div class="space-y-4">
      <div
        v-for="step in steps"
        :key="step.key"
        class="flex items-center gap-4"
      >
        <!-- Status icon -->
        <div class="shrink-0">
          <div
            v-if="step.complete"
            class="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center"
          >
            <Check class="text-white" :size="14" :stroke-width="3" />
          </div>
          <div
            v-else
            class="w-6 h-6 rounded-full border-2 border-gray-300"
          />
        </div>

        <!-- Text -->
        <div class="flex-1 min-w-0">
          <p
            class="text-sm font-medium"
            :class="step.complete ? 'text-gray-400 line-through' : 'text-gray-900'"
          >
            {{ step.title }}
          </p>
          <p class="text-xs text-gray-400 mt-0.5">{{ step.description }}</p>
        </div>

        <!-- Action -->
        <div class="shrink-0 ml-2">
          <span v-if="step.complete" class="text-sm text-gray-400">Done</span>
          <button
            v-else
            @click="step.onAction"
            class="text-sm font-medium text-teal-700 hover:text-teal-900 transition-colors"
          >
            {{ step.actionLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
