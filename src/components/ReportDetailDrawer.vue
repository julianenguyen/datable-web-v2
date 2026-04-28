<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, AlertTriangle, CheckCircle2, Plus, Download } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

interface TimeEntryJson {
  type: string
  description: string
  duration_minutes: number
  date: string
  source: 'system' | 'manual'
}

interface MilestoneAwarded {
  milestone_name: string
  domain_label: string
  clinical_description: string
  awarded_date: string
  therapist_note: string | null
}

interface ReportContent {
  patient: {
    name: string
    client_id: string
    insurance_provider: string | null
    billing_period: string
  }
  care_management_time: {
    calculated_minutes: number
    override_minutes: number | null
    final_minutes: number
    meets_threshold: boolean
    threshold_required: number
    warning_message: string | null
    time_entries: TimeEntryJson[]
  }
  clinical_activities: {
    sessions_held: number
    session_dates: string[]
    checkin_tasks_assigned: number
    checkin_tasks_completed: number
    checkin_completion_rate: number
    patient_log_days: number
    total_days_in_period: number
    log_engagement_rate: number
    presession_reflection_submitted: boolean
    presession_brief_generated: boolean
  }
  patient_engagement: {
    avg_mood_score: number | null
    avg_energy_score: number | null
    mood_trend: string
    flagged_entries: number
  }
  progress_toward_goals: {
    milestones_awarded: MilestoneAwarded[]
    total_milestones_to_date: number
  }
  cpt_recommendation: {
    code: string
    rationale: string
    is_first_month: boolean
  }
  generated_at: string
  generated_by: string
}

interface CcmTimeEntry {
  id: string
  entry_type: string
  source: 'system' | 'manual'
  duration_minutes: number
  description: string
  entry_date: string
}

interface CcmReport {
  id: string
  billing_period_start: string
  billing_period_end: string
  status: 'draft' | 'finalized'
  cpt_code: string | null
  calculated_time_minutes: number
  therapist_override_minutes: number | null
  final_time_minutes: number
  meets_threshold: boolean
  report_content: ReportContent
  finalized_at: string | null
  finalized_by: string | null
  pdf_url: string | null
  excel_url: string | null
}

interface NewTimeEntryForm {
  entry_type: string
  duration_minutes: string
  description: string
  entry_date: string
}

// ── Props / Emits ────────────────────────────────────────────────────────────

const props = defineProps<{
  reportId: string
  clientName: string
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  finalized: [reportId: string]
}>()

// ── State ────────────────────────────────────────────────────────────────────

const report = ref<CcmReport | null>(null)
const timeEntries = ref<CcmTimeEntry[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)

const isFinalizing = ref(false)
const finalizeError = ref<string | null>(null)
const showFinalizeModal = ref(false)

const addingEntry = ref(false)
const addEntryError = ref<string | null>(null)
const newTimeEntry = ref<NewTimeEntryForm>({
  entry_type: 'care_coordination',
  duration_minutes: '',
  description: '',
  entry_date: new Date().toISOString().split('T')[0],
})

const overrideMinutes = ref<string>('')
const applyingOverride = ref(false)
const overrideError = ref<string | null>(null)

const downloadingPdf = ref(false)
const downloadingExcel = ref(false)

// ── Computed ─────────────────────────────────────────────────────────────────

const isDraft = computed(() => report.value?.status === 'draft')

const displayMinutes = computed(() => {
  if (!report.value) return 0
  return report.value.therapist_override_minutes ?? report.value.calculated_time_minutes
})

const meetsThreshold = computed(() => {
  if (!report.value) return false
  const threshold = report.value.report_content.care_management_time.threshold_required
  return displayMinutes.value >= threshold
})

const thresholdRequired = computed(
  () => report.value?.report_content.care_management_time.threshold_required ?? 60
)

const billingPeriodLabel = computed(() => {
  if (!report.value) return ''
  return new Date(report.value.billing_period_start + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
  }
}

function formatDate(iso: string) {
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function entryTypeLabel(type: string) {
  const labels: Record<string, string> = {
    therapy_session: 'Therapy Session',
    presession_brief_review: 'Pre-Session Brief Review',
    checkin_review: 'Check-In Review',
    care_coordination: 'Care Coordination',
    documentation: 'Documentation',
    other: 'Other',
  }
  return labels[type] ?? type
}

function moodTrendLabel(trend: string) {
  const labels: Record<string, string> = {
    improving: 'Improving — scores trended upward',
    stable: 'Stable — scores remained consistent',
    declining: 'Declining — scores trended downward',
    insufficient_data: 'Insufficient data',
  }
  return labels[trend] ?? trend
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function loadReport() {
  isLoading.value = true
  loadError.value = null
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/ccm-reports/${props.reportId}`,
      { headers: await authHeaders() }
    )
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    report.value = data.report as CcmReport
    timeEntries.value = data.time_entries as CcmTimeEntry[]
    if (report.value.therapist_override_minutes) {
      overrideMinutes.value = String(report.value.therapist_override_minutes)
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load report'
  } finally {
    isLoading.value = false
  }
}

async function addTimeEntry() {
  if (!report.value) return
  const mins = parseInt(newTimeEntry.value.duration_minutes)
  if (!mins || mins <= 0) {
    addEntryError.value = 'Duration must be a positive number'
    return
  }
  if (!newTimeEntry.value.description.trim()) {
    addEntryError.value = 'Description is required'
    return
  }

  addingEntry.value = true
  addEntryError.value = null
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/ccm-reports/${props.reportId}/time-entries`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          entry_type: newTimeEntry.value.entry_type,
          duration_minutes: mins,
          description: newTimeEntry.value.description.trim(),
          entry_date: newTimeEntry.value.entry_date,
        }),
      }
    )
    if (!res.ok) throw new Error(await res.text())
    newTimeEntry.value = {
      entry_type: 'care_coordination',
      duration_minutes: '',
      description: '',
      entry_date: new Date().toISOString().split('T')[0],
    }
    await loadReport()
  } catch (e) {
    addEntryError.value = e instanceof Error ? e.message : 'Failed to add entry'
  } finally {
    addingEntry.value = false
  }
}

async function applyOverride() {
  const mins = parseInt(overrideMinutes.value)
  if (!mins || mins < 1 || mins > 480) {
    overrideError.value = 'Override must be between 1 and 480 minutes'
    return
  }

  applyingOverride.value = true
  overrideError.value = null
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/ccm-reports/${props.reportId}/override-time`,
      {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ override_minutes: mins }),
      }
    )
    if (!res.ok) throw new Error(await res.text())
    await loadReport()
  } catch (e) {
    overrideError.value = e instanceof Error ? e.message : 'Failed to apply override'
  } finally {
    applyingOverride.value = false
  }
}

async function finalizeReport() {
  if (!report.value) return
  isFinalizing.value = true
  finalizeError.value = null
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/ccm-reports/${props.reportId}/finalize`,
      { method: 'POST', headers: await authHeaders() }
    )
    if (!res.ok) throw new Error(await res.text())
    showFinalizeModal.value = false
    await loadReport()
    emit('finalized', props.reportId)
  } catch (e) {
    finalizeError.value = e instanceof Error ? e.message : 'Failed to finalize report'
  } finally {
    isFinalizing.value = false
  }
}

async function downloadFile(type: 'pdf' | 'excel') {
  if (type === 'pdf') downloadingPdf.value = true
  else downloadingExcel.value = true

  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/ccm-reports/${props.reportId}/generate-files`,
      { method: 'POST', headers: await authHeaders() }
    )
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    const url = type === 'pdf' ? data.pdf_url : data.excel_url
    if (url) window.open(url, '_blank')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to generate file'
  } finally {
    if (type === 'pdf') downloadingPdf.value = false
    else downloadingExcel.value = false
  }
}

// Load when drawer opens
watch(() => props.isOpen, (open) => {
  if (open) loadReport()
})
</script>

<template>
  <Teleport to="body">
    <template v-if="isOpen">
      <!-- Overlay -->
      <div class="fixed inset-0 z-40 bg-black/40" @click="emit('close')" />

      <!-- Drawer -->
      <div
        class="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl"
        style="width: min(640px, 100vw);"
      >
        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <h2 class="text-base font-semibold text-gray-900">
              Care Management Report — {{ billingPeriodLabel }}
            </h2>
            <p v-if="report" class="text-xs text-gray-500 mt-0.5">
              CPT {{ report.cpt_code ?? '—' }} · {{ displayMinutes }} minutes documented
            </p>
          </div>
          <button
            @click="emit('close')"
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 ml-4 shrink-0"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
          <svg class="animate-spin w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <!-- Error -->
        <div v-else-if="loadError" class="flex-1 flex items-center justify-center p-8">
          <p class="text-sm text-red-600">{{ loadError }}</p>
        </div>

        <!-- Body -->
        <div v-else-if="report" class="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <!-- ── Section A: CPT Code Recommendation ───────────────────────── -->
          <section
            class="rounded-lg p-4 border"
            style="background-color: #F0FDFA; border-color: #99F6E4;"
          >
            <p class="text-base font-bold text-teal-700 mb-1">
              Recommended Code: CPT {{ report.cpt_code ?? '—' }}
            </p>
            <p class="text-sm text-gray-600 mb-2 leading-relaxed">
              {{ report.report_content.cpt_recommendation.rationale }}
            </p>
            <p class="text-xs text-gray-500 mb-2">
              Required minimum: {{ thresholdRequired }} minutes
            </p>
            <div class="flex items-center gap-1.5" :class="meetsThreshold ? 'text-emerald-700' : 'text-amber-700'">
              <CheckCircle2 v-if="meetsThreshold" class="w-4 h-4 shrink-0" />
              <AlertTriangle v-else class="w-4 h-4 shrink-0" />
              <span class="text-sm font-medium">
                <template v-if="meetsThreshold">
                  {{ displayMinutes }} minutes documented — threshold met
                </template>
                <template v-else>
                  {{ displayMinutes }} minutes documented —
                  {{ thresholdRequired - displayMinutes }} more minutes needed.
                  Add time entries below or use the manual override.
                </template>
              </span>
            </div>
          </section>

          <!-- ── Section B: Care Management Time ─────────────────────────── -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Care Management Time</h3>

            <!-- Time entries table -->
            <div class="border border-gray-200 rounded-lg overflow-hidden mb-3">
              <table class="w-full text-xs">
                <thead class="bg-teal-50 text-teal-700">
                  <tr>
                    <th class="text-left px-3 py-2 font-semibold">Activity</th>
                    <th class="text-left px-3 py-2 font-semibold">Date</th>
                    <th class="text-left px-3 py-2 font-semibold">Duration</th>
                    <th class="text-left px-3 py-2 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr
                    v-for="entry in timeEntries"
                    :key="entry.id"
                    class="hover:bg-gray-50"
                  >
                    <td class="px-3 py-2 text-gray-800">{{ entryTypeLabel(entry.entry_type) }}</td>
                    <td class="px-3 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(entry.entry_date) }}</td>
                    <td class="px-3 py-2 text-gray-800 whitespace-nowrap">{{ entry.duration_minutes }} min</td>
                    <td class="px-3 py-2">
                      <span
                        class="px-1.5 py-0.5 rounded-full text-xs font-medium"
                        :class="entry.source === 'system' ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'"
                      >
                        {{ entry.source === 'system' ? 'System' : 'Manual' }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="timeEntries.length === 0">
                    <td colspan="4" class="px-3 py-4 text-center text-gray-400 italic">No time entries yet</td>
                  </tr>
                </tbody>
                <tfoot class="bg-gray-50">
                  <tr>
                    <td class="px-3 py-2 font-semibold text-gray-700 text-xs" colspan="2">Total</td>
                    <td
                      class="px-3 py-2 font-bold text-xs"
                      :class="meetsThreshold ? 'text-emerald-700' : 'text-amber-700'"
                    >
                      {{ displayMinutes }} min
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div v-if="report.therapist_override_minutes" class="text-xs text-teal-700 mb-3">
              Manual override applied: {{ report.therapist_override_minutes }} minutes used for billing
            </div>

            <!-- Add time entry form (draft only) -->
            <template v-if="isDraft">
              <div class="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
                <p class="text-xs font-semibold text-gray-600 mb-2">Add Manual Time Entry</p>
                <div class="grid grid-cols-2 gap-2 mb-2">
                  <select
                    v-model="newTimeEntry.entry_type"
                    class="text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                  >
                    <option value="therapy_session">Therapy Session</option>
                    <option value="presession_brief_review">Pre-Session Brief Review</option>
                    <option value="checkin_review">Check-In Review</option>
                    <option value="care_coordination">Care Coordination</option>
                    <option value="documentation">Documentation</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    v-model="newTimeEntry.entry_date"
                    type="date"
                    class="text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div class="flex gap-2 mb-2">
                  <input
                    v-model="newTimeEntry.description"
                    type="text"
                    placeholder="Description"
                    class="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <input
                    v-model="newTimeEntry.duration_minutes"
                    type="number"
                    placeholder="Min"
                    min="1"
                    class="w-20 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div v-if="addEntryError" class="text-xs text-red-600 mb-2">{{ addEntryError }}</div>
                <button
                  @click="addTimeEntry"
                  :disabled="addingEntry"
                  class="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus class="w-3 h-3" />
                  {{ addingEntry ? 'Adding…' : 'Add Time Entry' }}
                </button>
              </div>

              <!-- Manual override -->
              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p class="text-xs font-semibold text-gray-600 mb-1">Override total time (optional)</p>
                <p class="text-xs text-gray-400 mb-2 leading-relaxed">
                  Use this if you have additional time not captured above.
                  This value will be used for billing documentation.
                </p>
                <div class="flex gap-2 items-center">
                  <input
                    v-model="overrideMinutes"
                    type="number"
                    placeholder="Minutes"
                    min="1"
                    max="480"
                    class="w-28 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    @click="applyOverride"
                    :disabled="applyingOverride"
                    class="text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {{ applyingOverride ? 'Applying…' : 'Apply Override' }}
                  </button>
                </div>
                <div v-if="overrideError" class="text-xs text-red-600 mt-1">{{ overrideError }}</div>
              </div>
            </template>
          </section>

          <div class="border-t border-gray-100" />

          <!-- ── Section C: Clinical Activities ───────────────────────────── -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Clinical Activities</h3>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span class="text-xs text-gray-500">Sessions held</span>
                <p class="font-medium text-gray-900">
                  {{ report.report_content.clinical_activities.sessions_held }}
                </p>
                <p v-if="report.report_content.clinical_activities.session_dates.length > 0" class="text-xs text-gray-400">
                  {{ report.report_content.clinical_activities.session_dates.map(formatDate).join(', ') }}
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Check-in completion</span>
                <p class="font-medium text-gray-900">
                  {{ report.report_content.clinical_activities.checkin_completion_rate }}%
                  ({{ report.report_content.clinical_activities.checkin_tasks_completed }}
                  of {{ report.report_content.clinical_activities.checkin_tasks_assigned }} tasks)
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Patient log days</span>
                <p class="font-medium text-gray-900">
                  {{ report.report_content.clinical_activities.log_engagement_rate }}%
                  ({{ report.report_content.clinical_activities.patient_log_days }}
                  of {{ report.report_content.clinical_activities.total_days_in_period }} days)
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Pre-session reflection</span>
                <p
                  class="font-medium"
                  :class="report.report_content.clinical_activities.presession_reflection_submitted
                    ? 'text-emerald-700' : 'text-gray-500'"
                >
                  {{ report.report_content.clinical_activities.presession_reflection_submitted
                    ? 'Submitted' : 'Not submitted' }}
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Pre-session brief</span>
                <p
                  class="font-medium"
                  :class="report.report_content.clinical_activities.presession_brief_generated
                    ? 'text-emerald-700' : 'text-gray-500'"
                >
                  {{ report.report_content.clinical_activities.presession_brief_generated
                    ? 'Generated' : 'Not generated' }}
                </p>
              </div>
            </div>
          </section>

          <div class="border-t border-gray-100" />

          <!-- ── Section D: Patient Engagement ────────────────────────────── -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Patient Engagement</h3>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span class="text-xs text-gray-500">Average mood</span>
                <p class="font-medium text-gray-900">
                  {{ report.report_content.patient_engagement.avg_mood_score !== null
                    ? `${report.report_content.patient_engagement.avg_mood_score}/10`
                    : 'Insufficient data' }}
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Average energy</span>
                <p class="font-medium text-gray-900">
                  {{ report.report_content.patient_engagement.avg_energy_score !== null
                    ? `${report.report_content.patient_engagement.avg_energy_score}/10`
                    : 'Insufficient data' }}
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Mood trend</span>
                <p class="font-medium text-gray-900">
                  {{ moodTrendLabel(report.report_content.patient_engagement.mood_trend) }}
                </p>
              </div>
              <div>
                <span class="text-xs text-gray-500">Flagged entries</span>
                <p
                  class="font-medium"
                  :class="report.report_content.patient_engagement.flagged_entries > 0
                    ? 'text-red-600' : 'text-gray-900'"
                >
                  {{ report.report_content.patient_engagement.flagged_entries }}
                </p>
              </div>
            </div>
          </section>

          <div class="border-t border-gray-100" />

          <!-- ── Section E: Progress Toward Goals ─────────────────────────── -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Progress Toward Goals</h3>

            <div
              v-if="report.report_content.progress_toward_goals.milestones_awarded.length > 0"
              class="space-y-3"
            >
              <div
                v-for="m in report.report_content.progress_toward_goals.milestones_awarded"
                :key="m.milestone_name + m.awarded_date"
                class="border border-gray-100 rounded-lg p-3"
              >
                <p class="text-sm font-semibold text-gray-900 mb-0.5">{{ m.milestone_name }}</p>
                <p class="text-xs text-teal-600 mb-1">{{ m.domain_label }}</p>
                <p class="text-xs text-gray-600 leading-relaxed mb-1">{{ m.clinical_description }}</p>
                <p class="text-xs text-gray-400">Awarded {{ formatDate(m.awarded_date) }}</p>
                <p v-if="m.therapist_note" class="text-xs text-gray-500 italic mt-1">
                  "{{ m.therapist_note }}"
                </p>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 italic">
              No clinical milestones were awarded during this billing period.
            </p>
          </section>

          <div class="border-t border-gray-100" />

          <!-- ── Section F: Total Milestones ───────────────────────────────── -->
          <section>
            <p class="text-sm text-gray-700">
              <span class="font-semibold text-gray-900">
                {{ report.report_content.progress_toward_goals.total_milestones_to_date }}
              </span>
              total clinical milestones awarded across all time
            </p>
          </section>

        </div>

        <!-- ── Footer ──────────────────────────────────────────────────────── -->
        <div v-if="report" class="border-t border-gray-200 px-6 py-4 shrink-0 bg-gray-50 space-y-2">

          <!-- Draft footer -->
          <template v-if="isDraft">
            <button
              @click="showFinalizeModal = true"
              class="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              Finalize Report
            </button>
            <p class="text-xs text-gray-400 text-center leading-relaxed">
              Once finalized, this report cannot be edited.
              PDF and Excel exports will be generated automatically.
            </p>
          </template>

          <!-- Finalized footer -->
          <template v-else>
            <div class="flex gap-2">
              <button
                @click="downloadFile('pdf')"
                :disabled="downloadingPdf"
                class="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-teal-700 border border-teal-300 hover:bg-teal-50 disabled:opacity-60 py-2 rounded-lg transition-colors"
              >
                <Download class="w-4 h-4" />
                {{ downloadingPdf ? 'Generating…' : 'Download PDF' }}
              </button>
              <button
                @click="downloadFile('excel')"
                :disabled="downloadingExcel"
                class="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-teal-700 border border-teal-300 hover:bg-teal-50 disabled:opacity-60 py-2 rounded-lg transition-colors"
              >
                <Download class="w-4 h-4" />
                {{ downloadingExcel ? 'Generating…' : 'Download Excel' }}
              </button>
            </div>
            <p v-if="report.finalized_at" class="text-xs text-gray-400 text-center">
              Finalized on {{ formatDate(report.finalized_at) }}
            </p>
          </template>
        </div>
      </div>

      <!-- ── Finalize Confirmation Modal ─────────────────────────────────── -->
      <div
        v-if="showFinalizeModal"
        class="fixed inset-0 z-60 flex items-center justify-center p-4"
        @click.self="showFinalizeModal = false"
      >
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <h3 class="text-base font-semibold text-gray-900 mb-2">Finalize This Report?</h3>
          <p class="text-sm text-gray-600 mb-4 leading-relaxed">
            This action cannot be undone. The report will be locked and PDF/Excel exports
            will be generated. Finalized reports cannot be edited.
          </p>

          <!-- Below threshold warning -->
          <div
            v-if="!meetsThreshold"
            class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4"
          >
            <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p class="text-xs text-amber-800 leading-relaxed">
              This report documents {{ displayMinutes }} minutes, which is below the
              {{ thresholdRequired }}-minute minimum for CPT {{ report?.cpt_code }}.
              You can still finalize, but ensure you have documented all applicable time.
            </p>
          </div>

          <div v-if="finalizeError" class="text-xs text-red-600 mb-3">{{ finalizeError }}</div>

          <div class="flex gap-3">
            <button
              @click="showFinalizeModal = false"
              class="flex-1 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="finalizeReport"
              :disabled="isFinalizing"
              class="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              {{ isFinalizing ? 'Finalizing…' : 'Finalize Report' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>
