<script setup lang="ts">
/**
 * CarePlanMonthlyConfirmation
 * Low-friction modal for confirming the care plan is unchanged this billing month.
 * Shows a brief summary of the current plan's goals/diagnosis so the therapist
 * can meaningfully attest it's still accurate.
 */
import { ref, onMounted } from 'vue'
import { X, CheckCircle2, Loader2, AlertTriangle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

interface CarePlan {
  id: string
  icd10_primary: string
  icd10_description: string
  treatment_goals: Array<{ goal_text: string; measurable_target?: string | null; target_date?: string | null }>
  planned_interventions: Array<{ intervention_text: string; modality: string }>
  next_review_date: string
  version_number: number
}

const props = defineProps<{
  clientId: string
  clientName: string
}>()

const emit = defineEmits<{
  confirmed: []
  closed: []
}>()

const plan = ref<CarePlan | null>(null)
const isLoadingPlan = ref(true)
const loadError = ref<string | null>(null)

const isConfirming = ref(false)
const confirmError = ref<string | null>(null)
const confirmed = ref(false)

const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

async function loadPlan() {
  isLoadingPlan.value = true
  loadError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    const res = await fetch(`${EDGE_FUNCTION_URL}/care-plan/current/${props.clientId}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    })
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as { care_plan: CarePlan | null }
    plan.value = data.care_plan
    if (!data.care_plan) {
      loadError.value = 'No locked care plan found. Please create a care plan first.'
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load care plan'
  } finally {
    isLoadingPlan.value = false
  }
}

async function handleConfirm() {
  if (!plan.value) return
  isConfirming.value = true
  confirmError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    const res = await fetch(`${EDGE_FUNCTION_URL}/care-plan/confirm-monthly`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clientId: props.clientId }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? `Status ${res.status}`)
    }
    confirmed.value = true
    emit('confirmed')
  } catch (e) {
    confirmError.value = e instanceof Error ? e.message : 'Failed to confirm care plan'
  } finally {
    isConfirming.value = false
  }
}

onMounted(loadPlan)
</script>

<template>
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="emit('closed')"
  >
    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div>
          <h2 class="text-base font-semibold text-gray-900">Monthly Care Plan Confirmation</h2>
          <p class="text-xs text-gray-500 mt-0.5">{{ currentMonth }} · {{ clientName }}</p>
        </div>
        <button
          class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          @click="emit('closed')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        <!-- Loading plan -->
        <div v-if="isLoadingPlan" class="flex justify-center py-8">
          <Loader2 class="w-5 h-5 text-gray-400 animate-spin" />
        </div>

        <!-- Load error -->
        <div
          v-else-if="loadError"
          class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700"
        >
          {{ loadError }}
        </div>

        <!-- Success state -->
        <div
          v-else-if="confirmed"
          class="flex flex-col items-center gap-3 py-8 text-center"
        >
          <CheckCircle2 class="w-12 h-12 text-teal-500" />
          <p class="text-sm font-medium text-gray-800">Care plan confirmed for {{ currentMonth }}</p>
          <p class="text-xs text-gray-500">The CCM billing gate for this client is now satisfied.</p>
        </div>

        <!-- Plan review + confirm -->
        <template v-else-if="plan">
          <p class="text-sm text-gray-600">
            Review the current care plan below and confirm it is still accurate and unchanged
            for <strong>{{ currentMonth }}</strong>. This is required monthly for G0323 CCM billing.
          </p>

          <!-- Diagnosis -->
          <div class="bg-gray-50 rounded-lg p-4 space-y-1">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Diagnosis</p>
            <p class="text-sm font-mono text-gray-800">{{ plan.icd10_primary }}</p>
            <p class="text-sm text-gray-600">{{ plan.icd10_description }}</p>
          </div>

          <!-- Treatment Goals -->
          <div>
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Treatment Goals ({{ plan.treatment_goals.length }})
            </p>
            <ul class="space-y-2">
              <li
                v-for="(goal, i) in plan.treatment_goals"
                :key="i"
                class="flex gap-2 text-sm text-gray-700"
              >
                <span class="text-gray-400 shrink-0">{{ i + 1 }}.</span>
                <span>{{ goal.goal_text }}</span>
              </li>
            </ul>
          </div>

          <!-- Planned Interventions -->
          <div>
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Planned Interventions ({{ plan.planned_interventions.length }})
            </p>
            <ul class="space-y-2">
              <li
                v-for="(iv, i) in plan.planned_interventions"
                :key="i"
                class="flex gap-2 text-sm text-gray-700"
              >
                <span class="text-gray-400 shrink-0">{{ i + 1 }}.</span>
                <span>{{ iv.intervention_text }}
                  <span class="ml-1 text-xs text-gray-400">({{ iv.modality }})</span>
                </span>
              </li>
            </ul>
          </div>

          <!-- Next Review -->
          <div class="text-xs text-gray-500">
            Version {{ plan.version_number }} · Next review:
            {{ new Date(plan.next_review_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
          </div>

          <!-- Confirm error -->
          <div
            v-if="confirmError"
            class="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3"
          >
            <AlertTriangle class="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p class="text-xs text-red-700">{{ confirmError }}</p>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div
        v-if="!isLoadingPlan && !loadError && !confirmed && plan"
        class="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0"
      >
        <p class="text-xs text-gray-500 flex-1">
          By confirming, you attest that this care plan is current and accurate.
        </p>
        <div class="flex gap-2 shrink-0">
          <button
            class="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            @click="emit('closed')"
          >
            Cancel
          </button>
          <button
            :disabled="isConfirming"
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            @click="handleConfirm"
          >
            <Loader2 v-if="isConfirming" class="w-4 h-4 animate-spin" />
            Confirm Unchanged
          </button>
        </div>
      </div>

      <!-- Footer after confirmed -->
      <div
        v-else-if="confirmed"
        class="px-6 py-4 border-t border-gray-100 flex justify-end shrink-0"
      >
        <button
          class="px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
          @click="emit('closed')"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
