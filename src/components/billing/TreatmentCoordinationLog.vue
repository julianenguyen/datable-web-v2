<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  ClipboardList, Plus, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronRight, X
} from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
interface CoordinationEntry {
  id: string
  billing_month: string
  activity_type: string
  activity_date: string
  duration_minutes: number | null
  clinical_rationale: string | null
  is_retroactive_flag: boolean
  retroactive_explanation: string | null
  provider_name_snapshot: string | null
  care_team_member_id: string | null
  attested_at: string
  created_at: string
}

interface HistoryGroup {
  billing_month: string
  entries: CoordinationEntry[]
  count: number
}

interface CareTeamMember {
  id: string
  provider_name: string
  provider_role: string
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  treatment_decision: 'Treatment Decision',
  specialist_referral: 'Specialist Referral',
  coordination_call: 'Coordination Call',
  care_conference: 'Care Conference',
  medication_reconciliation: 'Medication Reconciliation',
  transition_planning: 'Transition Planning',
  other: 'Other',
}

const CLINICAL_RATIONALE_MIN = 100

// ── Props / emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
}>()

const emit = defineEmits<{
  statusLoaded: [hasCoordination: boolean]
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const history = ref<HistoryGroup[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const expandedMonths = ref<Set<string>>(new Set())
const showModal = ref(false)
const careTeamMembers = ref<CareTeamMember[]>([])
const careTeamLoading = ref(false)

// ── Form state ─────────────────────────────────────────────────────────────────
const form = ref({
  activity_type: '',
  activity_date: new Date().toISOString().split('T')[0],
  duration_minutes: '' as string | number,
  clinical_rationale: '',
  retroactive_explanation: '',
  care_team_member_id: '',
})
const saving = ref(false)
const saveError = ref<string | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────────
const currentMonth = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
})

const isRetroactive = computed(() => {
  if (!form.value.activity_date) return false
  const activityEnd = new Date(form.value.activity_date + 'T23:59:59Z').getTime()
  return (Date.now() - activityEnd) / 3600000 > 48
})

const isTreatmentDecision = computed(() => form.value.activity_type === 'treatment_decision')

const rationaleLength = computed(() => form.value.clinical_rationale.trim().length)
const rationaleValid = computed(() =>
  isTreatmentDecision.value ? rationaleLength.value >= CLINICAL_RATIONALE_MIN : true,
)

const canSubmit = computed(() => {
  if (!form.value.activity_type || !form.value.activity_date) return false
  if (isTreatmentDecision.value && !rationaleValid.value) return false
  if (isRetroactive.value && !form.value.retroactive_explanation.trim()) return false
  return true
})

// ── API helpers ────────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  return session.session?.access_token ?? ''
}

async function loadHistory() {
  loading.value = true
  loadError.value = null
  try {
    const token = await getToken()
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/treatment-coordination/history/${props.clientId}`,
      { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } },
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as { history: HistoryGroup[] }
    history.value = data.history

    // Auto-expand current month
    const thisMonth = currentMonth.value
    if (data.history.some((g) => g.billing_month === thisMonth)) {
      expandedMonths.value.add(thisMonth)
    }

    // Report gate status based on current month
    const hasThisMonth = data.history.some((g) => g.billing_month === thisMonth && g.count > 0)
    emit('statusLoaded', hasThisMonth)
  } catch (err) {
    loadError.value = 'Failed to load treatment coordination history.'
    emit('statusLoaded', false)
    console.error('[TreatmentCoordinationLog] load error:', err)
  } finally {
    loading.value = false
  }
}

async function loadCareTeam() {
  careTeamLoading.value = true
  try {
    const token = await getToken()
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/treatment-coordination/care-team/${props.clientId}`,
      { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } },
    )
    if (!res.ok) return
    const data = await res.json() as { members: CareTeamMember[] }
    careTeamMembers.value = data.members
  } catch {
    // Non-fatal; care team might be empty
  } finally {
    careTeamLoading.value = false
  }
}

async function submitLog() {
  if (!canSubmit.value) return
  saving.value = true
  saveError.value = null
  try {
    const token = await getToken()
    const body: Record<string, unknown> = {
      client_id: props.clientId,
      activity_type: form.value.activity_type,
      activity_date: form.value.activity_date,
    }
    if (form.value.duration_minutes !== '' && form.value.duration_minutes !== null) {
      body.duration_minutes = Number(form.value.duration_minutes)
    }
    if (isTreatmentDecision.value) {
      body.clinical_rationale = form.value.clinical_rationale.trim()
    }
    if (isRetroactive.value) {
      body.retroactive_explanation = form.value.retroactive_explanation.trim()
    }
    if (form.value.care_team_member_id) {
      body.care_team_member_id = form.value.care_team_member_id
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/treatment-coordination/log`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Status ${res.status}` }))
      throw new Error(err.message ?? err.error ?? `Status ${res.status}`)
    }

    closeModal()
    await loadHistory()
  } catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : 'Failed to log activity.'
  } finally {
    saving.value = false
  }
}

// ── Modal helpers ──────────────────────────────────────────────────────────────
function openModal() {
  form.value = {
    activity_type: '',
    activity_date: new Date().toISOString().split('T')[0],
    duration_minutes: '',
    clinical_rationale: '',
    retroactive_explanation: '',
    care_team_member_id: '',
  }
  saveError.value = null
  showModal.value = true
  loadCareTeam()
}

function closeModal() {
  showModal.value = false
}

function toggleMonth(month: string) {
  if (expandedMonths.value.has(month)) {
    expandedMonths.value.delete(month)
  } else {
    expandedMonths.value.add(month)
  }
}

function formatMonth(ym: string) {
  return new Date(ym + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(loadHistory)
watch(() => props.clientId, loadHistory)

defineExpose({ reload: loadHistory })
</script>

<template>
  <div class="treatment-coordination-log rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <ClipboardList :size="16" class="text-teal-600" />
        <h3 class="text-sm font-semibold text-gray-900">Treatment Coordination</h3>
      </div>
      <button
        @click="openModal"
        class="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus :size="13" />
        Log Activity
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-10 text-gray-400">
      <Loader2 :size="18" class="animate-spin mr-2 text-teal-600" />
      <span class="text-sm">Loading…</span>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="px-5 py-4 text-sm text-red-600 bg-red-50">
      <AlertTriangle :size="14" class="inline mr-1" />{{ loadError }}
    </div>

    <!-- History -->
    <div v-else>
      <div v-if="history.length === 0" class="px-5 py-10 text-center text-gray-400">
        <ClipboardList :size="28" class="mx-auto mb-2 opacity-40" />
        <p class="text-sm font-medium">No coordination activities yet</p>
        <p class="text-xs mt-0.5">Log treatment decisions, referrals, and care conferences here.</p>
      </div>

      <div v-else class="divide-y divide-gray-100">
        <div v-for="group in history" :key="group.billing_month">
          <!-- Month header -->
          <button
            class="w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 transition-colors"
            @click="toggleMonth(group.billing_month)"
          >
            <div class="flex items-center gap-2">
              <span class="font-semibold text-gray-800">{{ formatMonth(group.billing_month) }}</span>
              <span
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="group.billing_month === currentMonth
                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                  : 'bg-gray-100 text-gray-500'"
              >
                {{ group.count }} activit{{ group.count !== 1 ? 'ies' : 'y' }}
              </span>
              <span
                v-if="group.billing_month === currentMonth && group.count > 0"
                class="flex items-center gap-0.5 text-xs text-teal-600 font-medium"
              >
                <CheckCircle2 :size="12" />Gate met
              </span>
              <span
                v-if="group.billing_month === currentMonth && group.count === 0"
                class="flex items-center gap-0.5 text-xs text-red-500 font-medium"
              >
                <AlertTriangle :size="12" />No activity
              </span>
            </div>
            <component
              :is="expandedMonths.has(group.billing_month) ? ChevronDown : ChevronRight"
              :size="16"
              class="text-gray-400 transition-transform duration-150"
            />
          </button>

          <!-- Entries -->
          <div v-if="expandedMonths.has(group.billing_month)" class="divide-y divide-gray-50">
            <div
              v-for="entry in group.entries"
              :key="entry.id"
              class="px-5 py-3 bg-gray-50"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm font-semibold text-gray-800">
                      {{ ACTIVITY_TYPE_LABELS[entry.activity_type] ?? entry.activity_type }}
                    </span>
                    <span
                      v-if="entry.is_retroactive_flag"
                      class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium"
                    >
                      Retroactive
                    </span>
                  </div>
                  <p class="text-xs text-gray-500">
                    {{ formatDate(entry.activity_date) }}
                    <span v-if="entry.duration_minutes"> · {{ entry.duration_minutes }} min</span>
                    <span v-if="entry.provider_name_snapshot"> · {{ entry.provider_name_snapshot }}</span>
                  </p>
                  <!-- Clinical rationale (treatment_decision only) -->
                  <div
                    v-if="entry.clinical_rationale"
                    class="mt-2 px-3 py-2 bg-white border border-gray-200 rounded-lg"
                  >
                    <p class="text-xs font-medium text-gray-600 mb-1">Clinical Rationale</p>
                    <p class="text-xs text-gray-700 leading-relaxed">{{ entry.clinical_rationale }}</p>
                  </div>
                  <!-- Retroactive explanation -->
                  <p v-if="entry.retroactive_explanation" class="mt-1 text-xs text-amber-600 italic">
                    Retroactive: {{ entry.retroactive_explanation }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Log Activity Modal ──────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <!-- Modal header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <ClipboardList :size="18" class="text-teal-600" />
            <h2 class="text-base font-semibold text-gray-900">Log Coordination Activity</h2>
          </div>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600 transition-colors">
            <X :size="18" />
          </button>
        </div>

        <!-- Modal body -->
        <div class="px-6 py-5 space-y-4">

          <!-- Activity type -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Activity Type *</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="(label, type) in ACTIVITY_TYPE_LABELS"
                :key="type"
                type="button"
                @click="form.activity_type = type; if (type !== 'treatment_decision') form.clinical_rationale = ''"
                class="text-left px-3 py-2 rounded-lg border text-sm transition-colors"
                :class="form.activity_type === type
                  ? 'border-teal-500 bg-teal-50 text-teal-800 font-medium'
                  : 'border-gray-200 text-gray-700 hover:border-teal-200 hover:bg-teal-50/50'"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <!-- Activity date -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Activity Date *</label>
            <input
              v-model="form.activity_date"
              type="date"
              :max="new Date().toISOString().split('T')[0]"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p v-if="isRetroactive" class="mt-1 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle :size="12" />
              This date is more than 48 hours ago — a retroactive explanation is required.
            </p>
          </div>

          <!-- Duration (optional) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Duration (minutes)</label>
            <input
              v-model="form.duration_minutes"
              type="number"
              min="1"
              max="480"
              placeholder="Optional"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <!-- Care team member (optional) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Care Team Provider</label>
            <select
              v-model="form.care_team_member_id"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">No specific provider</option>
              <option v-for="m in careTeamMembers" :key="m.id" :value="m.id">
                {{ m.provider_name }}
              </option>
            </select>
            <p v-if="careTeamLoading" class="mt-1 text-xs text-gray-400">Loading care team…</p>
            <p v-else-if="careTeamMembers.length === 0" class="mt-1 text-xs text-gray-400">
              No providers on care team yet — add them in the Care Team Directory.
            </p>
          </div>

          <!-- Clinical rationale (treatment_decision only) -->
          <div v-if="isTreatmentDecision" class="rounded-lg border border-teal-200 bg-teal-50 p-4">
            <label class="block text-sm font-semibold text-teal-800 mb-1.5">
              Clinical Rationale *
              <span class="text-xs font-normal text-teal-600 ml-1">(minimum {{ CLINICAL_RATIONALE_MIN }} characters)</span>
            </label>
            <textarea
              v-model="form.clinical_rationale"
              rows="4"
              placeholder="Document the clinical basis for this treatment decision, including patient presentation, options considered, and rationale for the chosen approach…"
              class="w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
              :class="rationaleValid ? 'border-teal-300 bg-white' : 'border-amber-300 bg-amber-50'"
            />
            <div class="flex items-center justify-between mt-1">
              <span
                class="text-xs"
                :class="rationaleValid ? 'text-teal-600' : 'text-amber-600'"
              >
                {{ rationaleLength }} / {{ CLINICAL_RATIONALE_MIN }} characters minimum
              </span>
              <CheckCircle2 v-if="rationaleValid" :size="13" class="text-teal-600" />
            </div>
          </div>

          <!-- Retroactive explanation -->
          <div v-if="isRetroactive" class="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <label class="block text-sm font-semibold text-amber-800 mb-1.5">
              Retroactive Documentation Explanation *
            </label>
            <textarea
              v-model="form.retroactive_explanation"
              rows="3"
              placeholder="Explain why this coordination activity was not documented at the time it occurred…"
              class="w-full px-3 py-2 text-sm border border-amber-300 bg-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <!-- Attestation -->
          <div v-if="form.activity_type" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p class="text-xs font-semibold text-gray-600 mb-1">Attestation Statement</p>
            <p class="text-xs text-gray-500 leading-relaxed">
              By submitting this form, I attest that I performed the selected treatment coordination activity
              on {{ form.activity_date ? new Date(form.activity_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'the selected date' }}
              as part of the G0323 Chronic Care Management program for this patient.
              <span v-if="isRetroactive"> This entry is retroactive and the explanation above accurately describes the reason for the delay in documentation.</span>
            </p>
          </div>

          <!-- Error -->
          <div v-if="saveError" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle :size="14" class="inline mr-1" />{{ saveError }}
          </div>
        </div>

        <!-- Modal footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button @click="closeModal" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            @click="submitLog"
            :disabled="!canSubmit || saving"
            class="flex items-center gap-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="saving" :size="14" class="animate-spin" />
            <CheckCircle2 v-else :size="14" />
            {{ saving ? 'Logging…' : 'Log Activity' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
