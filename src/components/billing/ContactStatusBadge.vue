<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { CheckCircle2, AlertTriangle, XCircle, Phone, Loader2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type BadgeState = 'loading' | 'met' | 'missing' | 'no_visit' | 'error'

// ── Props / emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  /** 'compact' = single chip for roster; 'full' = detailed card for billing tab */
  variant?: 'compact' | 'full'
}>()

const emit = defineEmits<{
  /** Fires once data is loaded; callers can use this for gate evaluation */
  statusLoaded: [hasContact: boolean]
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const state = ref<BadgeState>('loading')
const contactCount = ref(0)
const consecutiveMonths = ref(0)
const billingMonth = ref('')
const loadError = ref<string | null>(null)

const variant = props.variant ?? 'compact'

// ── API ────────────────────────────────────────────────────────────────────────
async function load() {
  state.value = 'loading'
  loadError.value = null
  try {
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token ?? ''
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/session-contacts/status/${props.clientId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      }
    )
    if (res.status === 404) {
      state.value = 'no_visit'
      emit('statusLoaded', false)
      return
    }
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as {
      billing_month: string
      has_contact_this_month: boolean
      contact_count: number
      consecutive_months: number
    }
    billingMonth.value = data.billing_month
    contactCount.value = data.contact_count
    consecutiveMonths.value = data.consecutive_months

    state.value = data.has_contact_this_month ? 'met' : 'missing'
    emit('statusLoaded', data.has_contact_this_month)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load'
    state.value = 'error'
    emit('statusLoaded', false)
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(load)
watch(() => props.clientId, load)

// Expose reload for parent
defineExpose({ reload: load })
</script>

<template>
  <!-- ── Compact variant (roster chip) ──────────────────────────────────────── -->
  <template v-if="variant === 'compact'">
    <!-- Loading -->
    <span v-if="state === 'loading'"
      class="inline-flex items-center gap-1 text-xs text-gray-400">
      <Loader2 :size="11" class="animate-spin" />
    </span>

    <!-- Met -->
    <span v-else-if="state === 'met'"
      class="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5"
      title="Monthly contact logged"
    >
      <Phone :size="10" />
      Contact ✓
    </span>

    <!-- Missing -->
    <span v-else-if="state === 'missing'"
      class="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5"
      title="No contact logged this month"
    >
      <AlertTriangle :size="10" />
      No contact
    </span>

    <!-- No visit / error — silent in compact mode -->
    <span v-else class="inline-flex items-center gap-1 text-xs text-gray-300">
      <Phone :size="10" />
      —
    </span>
  </template>

  <!-- ── Full variant (billing tab card) ────────────────────────────────────── -->
  <template v-else>
    <!-- Loading -->
    <div v-if="state === 'loading'" class="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 :size="14" class="animate-spin text-teal-600" />
      Checking contact status…
    </div>

    <!-- Error -->
    <div v-else-if="state === 'error'"
      class="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
      <XCircle :size="15" class="mt-0.5 shrink-0 text-red-500" />
      <p class="text-sm text-red-700">Unable to load contact status. Please refresh.</p>
    </div>

    <!-- No visit -->
    <div v-else-if="state === 'no_visit'"
      class="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <AlertTriangle :size="15" class="mt-0.5 shrink-0 text-gray-400" />
      <p class="text-sm text-gray-500">
        No active initiating visit on file — contact tracking requires a documented initiating visit (CPT 90791).
      </p>
    </div>

    <!-- Met -->
    <div v-else-if="state === 'met'"
      class="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
      <CheckCircle2 :size="15" class="mt-0.5 shrink-0 text-green-600" />
      <div>
        <p class="text-sm font-medium text-green-800">
          {{ contactCount }} contact{{ contactCount === 1 ? '' : 's' }} logged this month
        </p>
        <p v-if="consecutiveMonths > 1" class="text-xs text-green-700 mt-0.5">
          {{ consecutiveMonths }} consecutive months with contact — great patient engagement.
        </p>
      </div>
    </div>

    <!-- Missing -->
    <div v-else-if="state === 'missing'"
      class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <AlertTriangle :size="15" class="mt-0.5 shrink-0 text-amber-600" />
      <div>
        <p class="text-sm font-medium text-amber-800">No contact logged for {{ billingMonth }}</p>
        <p class="text-xs text-amber-700 mt-0.5">
          At least one qualifying contact (phone, video, secure message, or in-person) is required
          before this month's G0323 report can be finalized.
        </p>
      </div>
    </div>
  </template>
</template>
