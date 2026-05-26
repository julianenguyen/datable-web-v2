<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { CheckCircle2, AlertTriangle, XCircle, FileText, Loader2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// Status type returned from /care-plan/billing-gate/:clientId
type CarePlanBillingReason =
  | 'no_care_plan'
  | 'monthly_confirmation_needed'
  | 'review_overdue'
  | null

interface CarePlanGateStatus {
  canBill: boolean
  reason: CarePlanBillingReason
  care_plan_id?: string
  next_review_date?: string
  billing_month?: string
}

type BadgeState = 'loading' | 'no_care_plan' | 'monthly_confirmation_needed' | 'review_overdue' | 'current'

const props = defineProps<{
  clientId: string
  /** When true renders a compact chip instead of the full card */
  compact?: boolean
  /** Called when the badge action button is clicked */
  onAction?: () => void
}>()

const emit = defineEmits<{
  statusLoaded: [status: CarePlanGateStatus]
}>()

defineExpose({ reload })

const state = ref<BadgeState>('loading')
const gateData = ref<CarePlanGateStatus | null>(null)
const loadError = ref<string | null>(null)

async function reload() {
  state.value = 'loading'
  loadError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(
      `${EDGE_FUNCTION_URL}/care-plan/billing-gate/${props.clientId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      }
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as CarePlanGateStatus
    gateData.value = data
    emit('statusLoaded', data)

    if (data.canBill) {
      state.value = 'current'
    } else if (data.reason === 'no_care_plan') {
      state.value = 'no_care_plan'
    } else if (data.reason === 'monthly_confirmation_needed') {
      state.value = 'monthly_confirmation_needed'
    } else if (data.reason === 'review_overdue') {
      state.value = 'review_overdue'
    } else {
      state.value = 'no_care_plan'
    }
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load care plan status'
    state.value = 'no_care_plan'
  }
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(reload)
</script>

<template>
  <!-- ── Compact chip (for roster rows) ───────────────────────────────────────── -->
  <template v-if="compact">
    <span
      v-if="state === 'loading'"
      class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400"
    >
      <Loader2 class="w-3 h-3 animate-spin" /> Care Plan
    </span>
    <span
      v-else-if="state === 'current'"
      class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700"
      title="Care plan current"
    >
      <CheckCircle2 class="w-3 h-3" /> Care Plan ✓
    </span>
    <button
      v-else-if="state === 'monthly_confirmation_needed'"
      class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
      title="Monthly care plan confirmation needed"
      @click="onAction?.()"
    >
      <AlertTriangle class="w-3 h-3" /> Confirm Plan
    </button>
    <button
      v-else-if="state === 'review_overdue'"
      class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors cursor-pointer"
      title="Care plan review overdue"
      @click="onAction?.()"
    >
      <AlertTriangle class="w-3 h-3" /> Plan Overdue
    </button>
    <button
      v-else
      class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors cursor-pointer"
      title="No care plan on file"
      @click="onAction?.()"
    >
      <FileText class="w-3 h-3" /> No Plan
    </button>
  </template>

  <!-- ── Full card (for client detail billing tab) ─────────────────────────── -->
  <template v-else>
    <!-- Loading -->
    <div v-if="state === 'loading'" class="flex items-center gap-2 py-3 text-sm text-gray-400">
      <Loader2 class="w-4 h-4 animate-spin" />
      Loading care plan status…
    </div>

    <!-- Current (canBill) -->
    <div
      v-else-if="state === 'current'"
      class="flex items-start gap-3 p-4 bg-teal-50 border border-teal-200 rounded-lg"
    >
      <CheckCircle2 class="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-teal-800">Care Plan Current</p>
        <p class="text-xs text-teal-600 mt-0.5">
          Monthly confirmation complete. Care plan is billable for CCM this month.
        </p>
      </div>
    </div>

    <!-- Monthly confirmation needed -->
    <div
      v-else-if="state === 'monthly_confirmation_needed'"
      class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg"
    >
      <AlertTriangle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-amber-800">Monthly Confirmation Required</p>
        <p class="text-xs text-amber-700 mt-0.5">
          Confirm the care plan is unchanged for
          {{ gateData?.billing_month ? formatMonth(gateData.billing_month) : 'this month' }}
          to enable CCM billing.
        </p>
      </div>
      <button
        v-if="onAction"
        class="text-xs font-medium text-amber-700 underline shrink-0"
        @click="onAction()"
      >
        Confirm
      </button>
    </div>

    <!-- Review overdue -->
    <div
      v-else-if="state === 'review_overdue'"
      class="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg"
    >
      <AlertTriangle class="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-orange-800">Care Plan Review Overdue</p>
        <p class="text-xs text-orange-700 mt-0.5">
          Review was due
          {{ gateData?.next_review_date ? formatDate(gateData.next_review_date) : '' }}.
          Create a new care plan version to restore billing eligibility.
        </p>
      </div>
      <button
        v-if="onAction"
        class="text-xs font-medium text-orange-700 underline shrink-0"
        @click="onAction()"
      >
        Update Plan
      </button>
    </div>

    <!-- No care plan -->
    <div
      v-else
      class="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg"
    >
      <XCircle class="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-700">No Care Plan on File</p>
        <p class="text-xs text-gray-500 mt-0.5">
          A G0323 individualized care plan is required for CCM billing.
        </p>
      </div>
      <button
        v-if="onAction"
        class="text-xs font-medium text-teal-600 underline shrink-0"
        @click="onAction()"
      >
        Create Plan
      </button>
    </div>
  </template>
</template>
