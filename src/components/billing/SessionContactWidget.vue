<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Phone, CheckCircle2, AlertTriangle, XCircle, Loader2, Clock, Plus } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ContactSummary {
  id: string
  contact_date: string
  contact_type: 'phone_call' | 'video_call' | 'secure_message' | 'in_person'
  duration_minutes: number | null
  source: 'manual' | 'ehr_import' | 'auto_crossref'
  created_at: string
}

interface StatusData {
  billing_month: string
  has_contact_this_month: boolean
  contact_count: number
  consecutive_months: number
  patient_engagement: 'high' | 'medium' | 'low' | 'none'
  contacts_this_month: ContactSummary[]
}

type WidgetState = 'loading' | 'error' | 'met' | 'missing'

// ── Props / emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  billingMonth?: string  // YYYY-MM; if omitted, server uses current month
}>()

const emit = defineEmits<{
  statusLoaded: [hasContact: boolean]
  logContact: []  // user clicked "Log Contact" button
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const widgetState = ref<WidgetState>('loading')
const statusData = ref<StatusData | null>(null)
const loadError = ref<string | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────────
const contactTypeLabel = (type: ContactSummary['contact_type']) => ({
  phone_call: 'Phone Call',
  video_call: 'Video Call',
  secure_message: 'Secure Message',
  in_person: 'In-Person',
}[type] ?? type)

const sourceLabel = (source: ContactSummary['source']) => ({
  manual: '',
  ehr_import: 'EHR import',
  auto_crossref: 'Auto-logged',
}[source] ?? '')

const engagementLabel = computed(() => {
  switch (statusData.value?.patient_engagement) {
    case 'high': return { text: 'High engagement', color: 'text-green-700' }
    case 'medium': return { text: 'Growing streak', color: 'text-teal-700' }
    case 'low': return { text: 'Engagement gap', color: 'text-amber-700' }
    default: return null
  }
})

// ── API ────────────────────────────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: supabaseAnonKey,
  }
}

async function reload() {
  widgetState.value = 'loading'
  loadError.value = null
  try {
    const params = props.billingMonth ? `?month=${props.billingMonth}` : ''
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/session-contacts/status/${props.clientId}${params}`,
      { headers: await authHeaders() }
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as StatusData
    statusData.value = data
    widgetState.value = data.has_contact_this_month ? 'met' : 'missing'
    emit('statusLoaded', data.has_contact_this_month)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load contact status'
    widgetState.value = 'error'
    emit('statusLoaded', false)
  }
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(reload)
watch(() => props.clientId, reload)

defineExpose({ reload })
</script>

<template>
  <div class="session-contact-widget space-y-3">
    <!-- Header row -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Phone :size="16" class="text-gray-500" />
        <span class="text-sm font-medium text-gray-700">Monthly Care Team Contact</span>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="widgetState === 'loading'" class="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 :size="14" class="animate-spin" />
      Loading contact status…
    </div>

    <!-- Error -->
    <div v-else-if="widgetState === 'error'"
      class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <AlertTriangle :size="16" class="mt-0.5 shrink-0 text-amber-600" />
      <p class="text-sm text-amber-800">Unable to load contact data. Please refresh.</p>
    </div>

    <!-- Loaded states -->
    <template v-else-if="statusData">
      <!-- Status badge -->
      <div class="flex items-center gap-2">
        <!-- Met -->
        <template v-if="widgetState === 'met'">
          <CheckCircle2 :size="16" class="text-green-600 shrink-0" />
          <span class="text-sm text-green-800 font-medium">
            {{ statusData.contact_count }} contact{{ statusData.contact_count === 1 ? '' : 's' }} logged — threshold met
          </span>
        </template>

        <!-- Missing -->
        <template v-else>
          <AlertTriangle :size="16" class="text-amber-600 shrink-0" />
          <span class="text-sm text-amber-800">
            No contact logged for {{ statusData.billing_month }}
          </span>
        </template>
      </div>

      <!-- Consecutive months + engagement (if > 1 month streak) -->
      <div v-if="statusData.consecutive_months >= 2 || engagementLabel"
        class="flex items-center gap-1.5 text-xs">
        <Clock :size="12" class="text-gray-400 shrink-0" />
        <span :class="engagementLabel?.color ?? 'text-gray-500'">
          {{ statusData.consecutive_months }} consecutive month{{ statusData.consecutive_months === 1 ? '' : 's' }} with contact
          <span v-if="engagementLabel"> · {{ engagementLabel.text }}</span>
        </span>
      </div>

      <!-- Contact list (current month only) -->
      <ul v-if="statusData.contacts_this_month.length > 0" class="space-y-1.5">
        <li
          v-for="contact in statusData.contacts_this_month"
          :key="contact.id"
          class="flex items-center justify-between text-xs text-gray-600 rounded-md bg-gray-50 px-2.5 py-1.5"
        >
          <div class="flex items-center gap-1.5">
            <Phone :size="11" class="text-gray-400 shrink-0" />
            <span class="font-medium">{{ contactTypeLabel(contact.contact_type) }}</span>
            <span class="text-gray-400">{{ formatDate(contact.contact_date) }}</span>
            <span v-if="contact.duration_minutes" class="text-gray-400">
              · {{ contact.duration_minutes }} min
            </span>
          </div>
          <span v-if="sourceLabel(contact.source)"
            class="ml-2 text-gray-400 shrink-0">
            {{ sourceLabel(contact.source) }}
          </span>
        </li>
      </ul>

      <!-- Patient engagement footnote -->
      <p v-if="statusData.patient_engagement === 'none' && widgetState === 'missing'"
        class="text-xs text-gray-400 leading-relaxed">
        * Qualifying contacts: phone call, video call, secure message, or in-person visit.
        Log one to satisfy the G0323 monthly contact requirement.
      </p>
    </template>

    <!-- Action button -->
    <div v-if="widgetState !== 'loading'" class="flex items-center gap-2 pt-1">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-teal-600 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 transition-colors"
        @click="emit('logContact')"
      >
        <Plus :size="12" />
        Log Contact
      </button>
    </div>
  </div>
</template>
