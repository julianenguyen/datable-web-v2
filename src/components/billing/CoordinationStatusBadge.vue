<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type BadgeState = 'loading' | 'met' | 'missing' | 'error'

// ── Props / emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  /** 'compact' = single chip for roster; 'full' = detailed card for billing tab */
  variant?: 'compact' | 'full'
}>()

const emit = defineEmits<{
  /** Fires once data is loaded; callers use this for gate evaluation */
  statusLoaded: [hasCoordination: boolean]
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const state = ref<BadgeState>('loading')
const entryCount = ref(0)
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
      `${EDGE_FUNCTION_URL}/treatment-coordination/status/${props.clientId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      },
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as {
      billing_month: string
      has_coordination_this_month: boolean
      entry_count_this_month: number
      consecutive_months: number
    }
    billingMonth.value = data.billing_month
    entryCount.value = data.entry_count_this_month
    consecutiveMonths.value = data.consecutive_months
    state.value = data.has_coordination_this_month ? 'met' : 'missing'
    emit('statusLoaded', data.has_coordination_this_month)
  } catch (err) {
    state.value = 'error'
    loadError.value = 'Failed to load coordination status.'
    emit('statusLoaded', false)
    console.error('[CoordinationStatusBadge] load error:', err)
  }
}

onMounted(load)
watch(() => props.clientId, load)

defineExpose({ reload: load })
</script>

<template>
  <!-- ── Compact variant (roster chip) ─────────────────────────────────── -->
  <template v-if="variant === 'compact'">
    <div v-if="state === 'loading'" class="flex items-center gap-1 text-xs text-gray-400 px-2 py-0.5 rounded-full border border-gray-200 bg-white">
      <Loader2 :size="10" class="animate-spin" />
      <span>Coord…</span>
    </div>
    <div v-else-if="state === 'met'" class="flex items-center gap-1 text-xs font-medium text-teal-700 px-2 py-0.5 rounded-full border border-teal-200 bg-teal-50">
      <CheckCircle2 :size="11" />
      <span>Coord</span>
    </div>
    <div v-else-if="state === 'missing'" class="flex items-center gap-1 text-xs font-medium text-red-600 px-2 py-0.5 rounded-full border border-red-200 bg-red-50">
      <XCircle :size="11" />
      <span>No Coord</span>
    </div>
    <div v-else class="flex items-center gap-1 text-xs text-gray-400 px-2 py-0.5 rounded-full border border-gray-200 bg-white">
      <AlertTriangle :size="10" />
    </div>
  </template>

  <!-- ── Full variant (billing tab card) ──────────────────────────────── -->
  <template v-else>
    <div class="rounded-xl border bg-white shadow-sm overflow-hidden"
      :class="state === 'met' ? 'border-teal-200' : state === 'missing' ? 'border-red-200' : 'border-gray-200'">
      <!-- Header chip -->
      <div class="px-4 py-3 border-b flex items-center justify-between"
        :class="state === 'met' ? 'border-teal-100 bg-teal-50' : state === 'missing' ? 'border-red-100 bg-red-50' : 'border-gray-100 bg-gray-50'">
        <span class="text-xs font-semibold"
          :class="state === 'met' ? 'text-teal-800' : state === 'missing' ? 'text-red-700' : 'text-gray-600'">
          Treatment Coordination
        </span>
        <div v-if="state === 'loading'" class="flex items-center gap-1 text-xs text-gray-400">
          <Loader2 :size="11" class="animate-spin" />Checking…
        </div>
        <div v-else-if="state === 'met'" class="flex items-center gap-1 text-xs font-medium text-teal-700">
          <CheckCircle2 :size="12" />Documented
        </div>
        <div v-else-if="state === 'missing'" class="flex items-center gap-1 text-xs font-medium text-red-600">
          <XCircle :size="12" />Not logged this month
        </div>
        <div v-else class="flex items-center gap-1 text-xs text-gray-400">
          <AlertTriangle :size="11" />Error
        </div>
      </div>

      <!-- Body stats (only when loaded) -->
      <div v-if="state !== 'loading' && state !== 'error'" class="px-4 py-3">
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p class="text-gray-500 font-medium">This month</p>
            <p class="text-gray-900 font-semibold">
              {{ entryCount }} activit{{ entryCount !== 1 ? 'ies' : 'y' }}
            </p>
          </div>
          <div>
            <p class="text-gray-500 font-medium">Streak</p>
            <p class="text-gray-900 font-semibold">
              {{ consecutiveMonths }} month{{ consecutiveMonths !== 1 ? 's' : '' }}
            </p>
          </div>
        </div>
        <p v-if="state === 'missing'" class="mt-2 text-xs text-red-500">
          No treatment coordination has been documented for {{ billingMonth ? new Date(billingMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'this month' }}.
        </p>
      </div>

      <!-- Error body -->
      <div v-if="state === 'error'" class="px-4 py-3 text-xs text-red-500">
        {{ loadError }}
      </div>
    </div>
  </template>
</template>
