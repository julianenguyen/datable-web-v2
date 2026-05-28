<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { X, Download, Lock, FileText, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GateStatus {
  initiating_visit: boolean
  consent: boolean
  care_plan: boolean
  clinical_time: boolean
  session_contact: boolean
  treatment_coordination: boolean
  rating_scale_90day: boolean
  rating_scale_90day_acknowledged: boolean
}

interface PatientInfo {
  name: string
  insurance_provider: string | null
}

interface TherapistInfo {
  name: string
  license_type: string | null
  npi: string | null
}

interface CarePlanGoal {
  goal_text: string
  measurable_target?: string | null
}

interface CarePlanIntervention {
  intervention_text: string
  modality: string
}

interface CarePlan {
  icd10_primary: string
  icd10_description: string
  treatment_goals: CarePlanGoal[]
  planned_interventions: CarePlanIntervention[]
  version_number: number
  next_review_date: string
}

interface ClinicalTimeEntry {
  activity_date: string
  activity_type: string
  duration_minutes: number
  is_retroactive: boolean
  retroactive_explanation: string | null
  note: string | null
}

interface SessionContact {
  contact_date: string
  contact_type: string
  duration_minutes: number | null
}

interface CoordEntry {
  activity_type: string
  activity_date: string
  duration_minutes: number | null
  clinical_rationale: string | null
  is_retroactive_flag: boolean
  retroactive_explanation: string | null
  provider_name_snapshot: string | null
}

interface CareTeamMember {
  provider_name: string
  provider_role: string
  provider_specialty: string | null
  organization_name: string | null
}

interface ScaleAdmin {
  scale_name: string
  administered_at: string
  total_score: number | null
  severity_label: string | null
  score_change: number | null
  significant_change_flagged: boolean
  administration_mode: string
}

interface ReportData {
  patient: PatientInfo
  therapist: TherapistInfo
  gate_status: GateStatus
  care_plan: CarePlan | null
  clinical_time: { total_minutes: number; threshold_met: boolean; entries: ClinicalTimeEntry[] }
  session_contacts: SessionContact[]
  treatment_coordination: { entries: CoordEntry[]; total_activities: number; total_minutes: number }
  care_team: CareTeamMember[]
  rating_scales: { this_month: ScaleAdmin[]; has_recent_90day: boolean }
}

interface AttestResponse {
  pdf_url: string
  csv_url: string
}

// ── Props / emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  reportId: string
  billingMonth: string
  billingMonthLabel: string
  clientName: string
}>()

const emit = defineEmits<{
  close: []
  attested: [pdfUrl: string, csvUrl: string]
}>()

// ── State ─────────────────────────────────────────────────────────────────────

const loading = ref(true)
const error = ref<string | null>(null)
const reportData = ref<ReportData | null>(null)
const isLocked = ref(false)

const attestationStatement = ref(
  'I attest that the services documented in this report were personally rendered by me and that all information is accurate and complete to the best of my knowledge. This documentation supports the billing of G0323 for the indicated billing month.'
)
const hasScrolledToBottom = ref(false)
const attesting = ref(false)
const attestedPdfUrl = ref<string | null>(null)
const attestedCsvUrl = ref<string | null>(null)

const attestationSection = ref<HTMLElement | null>(null)
let intersectionObserver: IntersectionObserver | null = null

// ── Computed ──────────────────────────────────────────────────────────────────

const canAttest = computed(
  () => hasScrolledToBottom.value && attestationStatement.value.trim().length > 0 && !attesting.value
)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  return sessionData.session?.access_token ?? ''
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatActivityType(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const token = await getToken()
    const res = await fetch(`${EDGE_FUNCTION_URL}/billing-report/${props.reportId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) {
      const body = await res.json() as { error?: string }
      throw new Error(body.error ?? `Failed to load report (${res.status})`)
    }
    const body = await res.json() as { data: ReportData; status: string }
    reportData.value = body.data
    isLocked.value = body.status === 'locked'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An unexpected error occurred.'
  } finally {
    loading.value = false
  }
}

// ── Attestation ───────────────────────────────────────────────────────────────

async function handleAttest(): Promise<void> {
  if (!canAttest.value) return
  attesting.value = true
  error.value = null
  try {
    const token = await getToken()
    const res = await fetch(`${EDGE_FUNCTION_URL}/billing-report/attest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        report_id: props.reportId,
        attestation_statement: attestationStatement.value,
      }),
    })
    if (!res.ok) {
      const body = await res.json() as { error?: string }
      throw new Error(body.error ?? `Attestation failed (${res.status})`)
    }
    const body = await res.json() as AttestResponse
    attestedPdfUrl.value = body.pdf_url
    attestedCsvUrl.value = body.csv_url
    isLocked.value = true
    emit('attested', body.pdf_url, body.csv_url)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Attestation failed.'
  } finally {
    attesting.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await fetchReport()

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        hasScrolledToBottom.value = true
        intersectionObserver?.disconnect()
      }
    },
    { threshold: 0.5 }
  )
  if (attestationSection.value) {
    intersectionObserver.observe(attestationSection.value)
  }
})

onBeforeUnmount(() => {
  intersectionObserver?.disconnect()
})
</script>

<template>
  <div class="fixed inset-0 z-50 bg-white flex flex-col">

    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <div class="flex-none border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between shadow-sm">
      <div class="flex items-center gap-3 min-w-0">
        <FileText class="h-5 w-5 text-gray-400 flex-none" />
        <h1 class="text-base font-semibold text-gray-900 truncate">
          Billing Summary Report — {{ billingMonthLabel }} — {{ clientName }}
        </h1>
      </div>
      <div class="flex items-center gap-3 flex-none ml-4">
        <!-- Status pill -->
        <span
          v-if="!loading && !error"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          :class="isLocked
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700'"
        >
          <Lock v-if="isLocked" class="h-3 w-3" />
          {{ isLocked ? 'Locked' : 'Draft' }}
        </span>
        <!-- Close (only before locked) -->
        <button
          v-if="!isLocked"
          type="button"
          class="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close"
          @click="emit('close')"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- ── Loading skeleton ────────────────────────────────────────────────── -->
    <div v-if="loading" class="flex-1 overflow-y-auto p-8">
      <div class="max-w-4xl mx-auto space-y-6 animate-pulse">
        <div v-for="i in 6" :key="i" class="rounded-lg bg-gray-100 h-28" />
      </div>
    </div>

    <!-- ── Error state ─────────────────────────────────────────────────────── -->
    <div v-else-if="error && !reportData" class="flex-1 flex items-center justify-center p-8">
      <div class="text-center max-w-sm">
        <AlertTriangle class="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p class="text-sm font-medium text-gray-900 mb-1">Failed to load report</p>
        <p class="text-sm text-gray-500 mb-4">{{ error }}</p>
        <button
          type="button"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          @click="fetchReport"
        >
          Retry
        </button>
      </div>
    </div>

    <!-- ── Report body ─────────────────────────────────────────────────────── -->
    <div v-else-if="reportData" class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-6 py-8 space-y-8">

        <!-- 1. Patient & Provider Information -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Patient &amp; Provider Information</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-gray-500 mb-0.5">Patient Name</p>
              <p class="text-sm font-medium text-gray-900">{{ reportData.patient.name }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">Insurance Provider</p>
              <p class="text-sm font-medium text-gray-900">{{ reportData.patient.insurance_provider ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">Therapist</p>
              <p class="text-sm font-medium text-gray-900">{{ reportData.therapist.name }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">License Type</p>
              <p class="text-sm font-medium text-gray-900">{{ reportData.therapist.license_type ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">NPI</p>
              <p class="text-sm font-medium text-gray-900">{{ reportData.therapist.npi ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">Billing Month</p>
              <p class="text-sm font-medium text-gray-900">{{ billingMonthLabel }}</p>
            </div>
          </div>
        </section>

        <!-- 2. Billing Gate Status -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Billing Gate Status</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gate</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-100">
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Initiating Visit</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.initiating_visit" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                      <XCircle class="h-3 w-3" /> Not Met
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Patient Consent</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.consent" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                      <XCircle class="h-3 w-3" /> Not Met
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Individualized Care Plan</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.care_plan" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                      <XCircle class="h-3 w-3" /> Not Met
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Qualifying Clinical Time (≥20 min)</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.clinical_time" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                      <XCircle class="h-3 w-3" /> Not Met
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Monthly Session Contact</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.session_contact" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                      <XCircle class="h-3 w-3" /> Not Met
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Treatment Coordination</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.treatment_coordination" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                      <XCircle class="h-3 w-3" /> Not Met
                    </span>
                  </td>
                </tr>
                <tr>
                  <td class="px-4 py-3 text-sm text-gray-700">Rating Scale (90-day)</td>
                  <td class="px-4 py-3">
                    <span v-if="reportData.gate_status.rating_scale_90day" class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                      <CheckCircle2 class="h-3 w-3" /> Met
                    </span>
                    <span v-else-if="reportData.gate_status.rating_scale_90day_acknowledged" class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                      <AlertTriangle class="h-3 w-3" /> Soft gate — acknowledged
                    </span>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                      <AlertTriangle class="h-3 w-3" /> Soft gate — not met
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 3. Consent Status -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Consent Status</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              :class="reportData.gate_status.consent
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'"
            >
              <CheckCircle2 v-if="reportData.gate_status.consent" class="h-3.5 w-3.5" />
              <XCircle v-else class="h-3.5 w-3.5" />
              {{ reportData.gate_status.consent ? 'Consent on file' : 'Consent not obtained' }}
            </span>
          </div>
        </section>

        <!-- 4. Initiating Visit -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Initiating Visit</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              :class="reportData.gate_status.initiating_visit
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'"
            >
              <CheckCircle2 v-if="reportData.gate_status.initiating_visit" class="h-3.5 w-3.5" />
              <XCircle v-else class="h-3.5 w-3.5" />
              {{ reportData.gate_status.initiating_visit ? 'Qualifying 90791 visit on file' : 'No qualifying initiating visit found' }}
            </span>
          </div>
        </section>

        <!-- 5. Care Plan -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Individualized Care Plan</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4">
            <div v-if="reportData.care_plan" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p class="text-xs text-gray-500 mb-0.5">ICD-10 Code</p>
                  <p class="text-sm font-medium text-gray-900">{{ reportData.care_plan.icd10_primary }}</p>
                </div>
                <div class="sm:col-span-2">
                  <p class="text-xs text-gray-500 mb-0.5">Diagnosis</p>
                  <p class="text-sm font-medium text-gray-900">{{ reportData.care_plan.icd10_description }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500 mb-0.5">Version</p>
                  <p class="text-sm font-medium text-gray-900">v{{ reportData.care_plan.version_number }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500 mb-0.5">Next Review Date</p>
                  <p class="text-sm font-medium text-gray-900">{{ formatDate(reportData.care_plan.next_review_date) }}</p>
                </div>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Treatment Goals</p>
                <ul class="space-y-2">
                  <li
                    v-for="(goal, idx) in reportData.care_plan.treatment_goals"
                    :key="idx"
                    class="text-sm text-gray-800 border-l-2 border-indigo-300 pl-3"
                  >
                    {{ goal.goal_text }}
                    <span v-if="goal.measurable_target" class="block text-xs text-gray-500 mt-0.5">
                      Target: {{ goal.measurable_target }}
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Planned Interventions</p>
                <ul class="space-y-2">
                  <li
                    v-for="(intervention, idx) in reportData.care_plan.planned_interventions"
                    :key="idx"
                    class="text-sm text-gray-800 border-l-2 border-violet-300 pl-3"
                  >
                    {{ intervention.intervention_text }}
                    <span class="block text-xs text-gray-500 mt-0.5">Modality: {{ intervention.modality }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <p v-else class="text-sm text-gray-500 italic">No care plan on file for this billing period.</p>
          </div>
        </section>

        <!-- 6. Qualifying Clinical Time -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Qualifying Clinical Time</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4 space-y-4">
            <div class="flex items-center gap-3">
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
                :class="reportData.clinical_time.threshold_met
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'"
              >
                <CheckCircle2 v-if="reportData.clinical_time.threshold_met" class="h-4 w-4" />
                <AlertTriangle v-else class="h-4 w-4" />
                {{ reportData.clinical_time.total_minutes }} minutes total
              </span>
              <span class="text-xs text-gray-500">
                {{ reportData.clinical_time.threshold_met ? 'Threshold met (≥20 min)' : 'Below 20-minute threshold' }}
              </span>
            </div>
            <div v-if="reportData.clinical_time.entries.length > 0" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Minutes</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                  <tr v-for="(entry, idx) in reportData.clinical_time.entries" :key="idx">
                    <td class="px-3 py-2 text-gray-700 whitespace-nowrap">{{ formatDate(entry.activity_date) }}</td>
                    <td class="px-3 py-2 text-gray-700">
                      {{ formatActivityType(entry.activity_type) }}
                      <span v-if="entry.is_retroactive" class="ml-1 inline-flex items-center rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">Retroactive</span>
                    </td>
                    <td class="px-3 py-2 text-gray-700">{{ entry.duration_minutes }}</td>
                    <td class="px-3 py-2 text-gray-500 text-xs">
                      <span v-if="entry.note">{{ entry.note }}</span>
                      <span v-else-if="entry.retroactive_explanation">{{ entry.retroactive_explanation }}</span>
                      <span v-else>—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-500 italic">No clinical time entries for this billing period.</p>
          </div>
        </section>

        <!-- 7. Session Contacts -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Session Contacts</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4">
            <div v-if="reportData.session_contacts.length > 0" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                  <tr v-for="(contact, idx) in reportData.session_contacts" :key="idx">
                    <td class="px-3 py-2 text-gray-700 whitespace-nowrap">{{ formatDate(contact.contact_date) }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ formatActivityType(contact.contact_type) }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ contact.duration_minutes !== null ? `${contact.duration_minutes} min` : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-500 italic">No session contacts logged for this billing period.</p>
          </div>
        </section>

        <!-- 8. Treatment Coordination -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Treatment Coordination</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4 space-y-3">
            <div class="flex gap-4 text-sm">
              <span class="text-gray-500">Total activities: <strong class="text-gray-900">{{ reportData.treatment_coordination.total_activities }}</strong></span>
              <span class="text-gray-500">Total minutes: <strong class="text-gray-900">{{ reportData.treatment_coordination.total_minutes }}</strong></span>
            </div>
            <div v-if="reportData.treatment_coordination.entries.length > 0" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Minutes</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rationale</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                  <tr v-for="(entry, idx) in reportData.treatment_coordination.entries" :key="idx">
                    <td class="px-3 py-2 text-gray-700 whitespace-nowrap">{{ formatDate(entry.activity_date) }}</td>
                    <td class="px-3 py-2 text-gray-700">
                      {{ formatActivityType(entry.activity_type) }}
                      <span v-if="entry.is_retroactive_flag" class="ml-1 inline-flex items-center rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">Retroactive</span>
                    </td>
                    <td class="px-3 py-2 text-gray-700">{{ entry.duration_minutes !== null ? `${entry.duration_minutes} min` : '—' }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ entry.provider_name_snapshot ?? '—' }}</td>
                    <td class="px-3 py-2 text-gray-500 text-xs max-w-xs">
                      <span v-if="entry.clinical_rationale">{{ entry.clinical_rationale }}</span>
                      <span v-else-if="entry.retroactive_explanation">{{ entry.retroactive_explanation }}</span>
                      <span v-else>—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-500 italic">No coordination activities logged for this billing period.</p>
          </div>
        </section>

        <!-- 9. Care Team -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Care Team</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4">
            <div v-if="reportData.care_team.length > 0" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                  <tr v-for="(member, idx) in reportData.care_team" :key="idx">
                    <td class="px-3 py-2 text-gray-700 font-medium">{{ member.provider_name }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ member.provider_role }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ member.provider_specialty ?? '—' }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ member.organization_name ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-500 italic">No care team members on file.</p>
          </div>
        </section>

        <!-- 10. Rating Scales -->
        <section>
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Rating Scales</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4 space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-gray-500">90-day administration:</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="reportData.rating_scales.has_recent_90day
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'"
              >
                <CheckCircle2 v-if="reportData.rating_scales.has_recent_90day" class="h-3 w-3" />
                <AlertTriangle v-else class="h-3 w-3" />
                {{ reportData.rating_scales.has_recent_90day ? 'On file' : 'Not on file within 90 days' }}
              </span>
            </div>
            <div v-if="reportData.rating_scales.this_month.length > 0" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scale</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                  <tr v-for="(scale, idx) in reportData.rating_scales.this_month" :key="idx">
                    <td class="px-3 py-2 text-gray-700 font-medium">{{ scale.scale_name }}</td>
                    <td class="px-3 py-2 text-gray-700 whitespace-nowrap">{{ formatDate(scale.administered_at) }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ scale.total_score !== null ? scale.total_score : '—' }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ scale.severity_label ?? '—' }}</td>
                    <td class="px-3 py-2">
                      <span v-if="scale.score_change !== null" class="inline-flex items-center gap-0.5 text-sm">
                        <span :class="scale.score_change < 0 ? 'text-green-600' : scale.score_change > 0 ? 'text-red-600' : 'text-gray-500'">
                          {{ scale.score_change > 0 ? '+' : '' }}{{ scale.score_change }}
                        </span>
                        <AlertTriangle v-if="scale.significant_change_flagged" class="h-3 w-3 text-amber-500 ml-0.5" />
                      </span>
                      <span v-else class="text-gray-500">—</span>
                    </td>
                    <td class="px-3 py-2 text-gray-700">{{ formatActivityType(scale.administration_mode) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-500 italic">No rating scales administered this month.</p>
          </div>
        </section>

        <!-- 11. Billing Attestation (anchor for IntersectionObserver) -->
        <section ref="attestationSection">
          <div class="bg-gray-100 px-4 py-2 rounded-t-md">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Billing Attestation</span>
          </div>
          <div class="border border-gray-200 border-t-0 rounded-b-md p-4 space-y-3">
            <p class="text-xs text-gray-500">
              Review and sign the attestation statement below to lock this report for billing submission.
            </p>
            <div v-if="isLocked && (attestedPdfUrl || attestedCsvUrl)" class="flex items-center gap-3">
              <CheckCircle2 class="h-5 w-5 text-green-600 flex-none" />
              <span class="text-sm font-medium text-green-700">Report attested and locked.</span>
            </div>
            <div v-else-if="isLocked" class="flex items-center gap-3">
              <Lock class="h-5 w-5 text-gray-400 flex-none" />
              <span class="text-sm text-gray-500">This report has been locked and attested.</span>
            </div>
            <p v-if="!isLocked" class="text-xs text-amber-600">
              Scroll to this section and complete the attestation in the panel below to unlock the submission button.
            </p>
          </div>
        </section>

      </div>
    </div>

    <!-- ── Fixed footer ────────────────────────────────────────────────────── -->
    <div
      v-if="!loading && !error"
      class="flex-none border-t border-gray-200 bg-gray-50 px-6 py-4 space-y-3"
    >
      <!-- Error banner inside footer -->
      <div v-if="error" class="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
        <AlertTriangle class="h-4 w-4 text-red-500 flex-none" />
        <p class="text-sm text-red-700">{{ error }}</p>
      </div>

      <!-- Locked: download links -->
      <div v-if="isLocked" class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-1.5 text-sm text-green-700 font-medium">
          <Lock class="h-4 w-4" />
          Report locked and attested
        </div>
        <a
          v-if="attestedPdfUrl"
          :href="attestedPdfUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download class="h-4 w-4" />
          Download PDF
        </a>
        <a
          v-if="attestedCsvUrl"
          :href="attestedCsvUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md bg-white border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download class="h-4 w-4" />
          Download CSV
        </a>
      </div>

      <!-- Not locked: attestation form -->
      <template v-else>
        <div>
          <label for="attestation-statement" class="block text-xs font-medium text-gray-700 mb-1">
            Attestation Statement
          </label>
          <textarea
            id="attestation-statement"
            v-model="attestationStatement"
            rows="3"
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            placeholder="Enter attestation statement..."
          />
        </div>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <p class="text-xs text-gray-500">
            <span v-if="!hasScrolledToBottom" class="text-amber-600 font-medium">
              Scroll to the Billing Attestation section to enable signing.
            </span>
            <span v-else-if="!attestationStatement.trim()">
              Attestation statement cannot be empty.
            </span>
            <span v-else class="text-green-600">
              Ready to attest.
            </span>
          </p>
          <button
            type="button"
            :disabled="!canAttest"
            class="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
            :class="canAttest
              ? 'bg-amber-500 border border-amber-600 text-white hover:bg-amber-600 focus:ring-amber-500 shadow-sm'
              : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'"
            @click="handleAttest"
          >
            <Loader2 v-if="attesting" class="h-4 w-4 animate-spin" />
            <Lock v-else class="h-4 w-4" />
            {{ attesting ? 'Attesting…' : 'Attest and Lock Report' }}
          </button>
        </div>
      </template>
    </div>

  </div>
</template>
