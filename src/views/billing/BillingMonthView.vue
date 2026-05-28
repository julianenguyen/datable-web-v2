<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase, EDGE_FUNCTION_URL } from '@/lib/supabase'
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  XCircle,
  SkipForward,
  ExternalLink,
} from 'lucide-vue-next'
import RatingScaleAdminModal from '@/components/billing/RatingScaleAdminModal.vue'
import BillingReportPreviewModal from '@/components/billing/BillingReportPreviewModal.vue'

// ── Props (optional — when embedded in BillingHubView) ────────────────────────

interface Props {
  year?: string
  month?: string
  embedded?: boolean  // when true, suppresses AppLayout wrapper and page chrome
}

const props = withDefaults(defineProps<Props>(), {
  year: undefined,
  month: undefined,
  embedded: false,
})

// ── Route ──────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

// Prefer props over route params — allows embedding in BillingHubView without route params
const resolvedYear = computed(() => props.year ?? (route.params.year as string) ?? String(new Date().getFullYear()))
const resolvedMonth = computed(() => props.month ?? (route.params.month as string) ?? String(new Date().getMonth() + 1).padStart(2, '0'))
const billingMonth = computed(() => `${resolvedYear.value}-${resolvedMonth.value}`)

// ── Types ──────────────────────────────────────────────────────────────────────

interface GateMap {
  visit: boolean
  consent: boolean
  care_plan: boolean
  clinical_time: boolean
  session_contact: boolean
  treatment_coordination: boolean
  rating_scale_90day: boolean
}

interface ReadyEntry {
  client_id: string
  client_name: string
  insurance_provider: string | null
  billing_month: string
  gates: GateMap
  failed_hard_gates: string[]
  draft_report_id: string | null
}

interface AlreadyGeneratedEntry {
  client_id: string
  client_name: string
  report_id: string
  status: string
}

interface SkippedEntry {
  client_id: string
  client_name: string
  report_id: string
  skip_reason: string
}

interface ReadyToBillResponse {
  billing_month: string
  billing_month_label: string
  ready_to_bill: ReadyEntry[]
  incomplete: ReadyEntry[]
  already_generated: AlreadyGeneratedEntry[]
  skipped: SkippedEntry[]
}

// ── State ──────────────────────────────────────────────────────────────────────

const loading = ref(true)
const loadError = ref<string | null>(null)
const reportData = ref<ReadyToBillResponse | null>(null)

const generatingFor = ref<string | null>(null)      // client_id being generated
const generatingError = ref<string | null>(null)

const showIncomplete = ref(false)
const showGenerated = ref(false)
const showSkipped = ref(false)

const scaleModalClientId = ref<string | null>(null)
const previewReportId = ref<string | null>(null)
const previewClientName = ref('')

const skipModalClientId = ref<string | null>(null)
const skipReason = ref('')
const skipLoading = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────

const billingMonthLabel = computed(() => reportData.value?.billing_month_label ?? billingMonth.value)

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/billing-report/ready-to-bill?billing_month=${billingMonth.value}`,
      { headers: { Authorization: `Bearer ${session?.access_token}` } }
    )
    if (!res.ok) {
      const err = await res.json() as { error: string }
      throw new Error(err.error ?? 'Failed to load billing readiness')
    }
    reportData.value = await res.json() as ReadyToBillResponse
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Generate Report ───────────────────────────────────────────────────────────

async function generateReport(entry: ReadyEntry) {
  generatingFor.value = entry.client_id
  generatingError.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()

    // Check 90-day rating scale
    const needsAck = !entry.gates.rating_scale_90day

    const res = await fetch(`${EDGE_FUNCTION_URL}/billing-report/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: entry.client_id,
        billing_month: billingMonth.value,
        rating_scale_90day_acknowledged: needsAck,
      }),
    })

    const json = await res.json() as { report_id?: string; error?: string; message?: string }
    if (!res.ok) {
      throw new Error(json.message ?? json.error ?? 'Failed to generate report')
    }

    // Open preview modal
    previewReportId.value = json.report_id!
    previewClientName.value = entry.client_name
  } catch (e: unknown) {
    generatingError.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    generatingFor.value = null
  }
}

async function openExistingReport(entry: AlreadyGeneratedEntry) {
  previewReportId.value = entry.report_id
  previewClientName.value = entry.client_name
}

// ── Skip ──────────────────────────────────────────────────────────────────────

function openSkipModal(clientId: string) {
  skipModalClientId.value = clientId
  skipReason.value = ''
}

async function confirmSkip() {
  if (!skipModalClientId.value || !skipReason.value.trim()) return
  skipLoading.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/billing-report/skip`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: skipModalClientId.value,
        billing_month: billingMonth.value,
        skip_reason: skipReason.value.trim(),
      }),
    })
    if (!res.ok) throw new Error('Skip failed')
    skipModalClientId.value = null
    await load()
  } catch {
    // Keep modal open on error
  } finally {
    skipLoading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gateLabel(gateKey: string): string {
  const labels: Record<string, string> = {
    initiating_visit_missing: 'No initiating visit',
    initiating_visit_expired: 'Initiating visit expired',
    consent_missing: 'Consent missing',
    no_care_plan: 'No care plan',
    monthly_confirmation_needed: 'Care plan confirmation needed',
    review_overdue: 'Care plan review overdue',
    no_entries: 'No clinical time logged',
    below_threshold: 'Clinical time below 20 min',
    no_session_contact: 'No session contact this month',
    no_treatment_coordination: 'No treatment coordination logged',
  }
  return labels[gateKey] ?? gateKey.replace(/_/g, ' ')
}

function onPreviewClose() {
  previewReportId.value = null
  previewClientName.value = ''
}

function onAttested(pdfUrl: string, _csvUrl: string) {
  previewReportId.value = null
  previewClientName.value = ''
  load()
  // Could trigger PDF download here:
  // window.open(pdfUrl, '_blank')
}
</script>

<template>
  <component :is="embedded ? 'div' : AppLayout">
    <div :class="embedded ? '' : 'px-8 py-8 max-w-5xl mx-auto'">

      <!-- Page header (standalone mode only) -->
      <div v-if="!embedded" class="mb-6 flex items-center justify-between">
        <div>
          <button
            class="text-xs text-gray-400 hover:text-gray-600 mb-1 flex items-center gap-1"
            @click="router.push('/billing')"
          >
            ← Back to Billing Hub
          </button>
          <h1 class="text-2xl font-bold text-gray-900">Billing — {{ billingMonthLabel }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">G0323 Monthly Billing Summary</p>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-24">
        <Loader2 class="animate-spin text-teal-600" :size="28" />
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <XCircle class="mx-auto mb-2 text-red-400" :size="24" />
        <p class="text-sm font-medium text-red-700">{{ loadError }}</p>
        <button class="mt-3 text-sm text-teal-600 underline" @click="load">Retry</button>
      </div>

      <template v-else-if="reportData">

        <!-- ── Ready to Bill ───────────────────────────────────────────────── -->
        <section class="mb-8">
          <div class="flex items-center gap-2 mb-3">
            <CheckCircle2 class="text-green-600" :size="18" />
            <h2 class="text-base font-semibold text-gray-900">
              Ready to Bill
              <span class="ml-1.5 text-sm font-normal text-gray-400">({{ reportData.ready_to_bill.length }})</span>
            </h2>
          </div>

          <div v-if="reportData.ready_to_bill.length === 0" class="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-400">
            No clients are ready to bill this month yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="entry in reportData.ready_to_bill"
              :key="entry.client_id"
              class="rounded-xl border border-green-200 bg-white shadow-sm overflow-hidden"
            >
              <div class="flex items-center justify-between px-5 py-4">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{{ entry.client_name }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ entry.insurance_provider ?? 'No insurance on file' }}</p>
                  <!-- Rating scale soft gate warning -->
                  <div v-if="!entry.gates.rating_scale_90day" class="flex items-center gap-1.5 mt-1.5">
                    <AlertTriangle class="text-amber-500" :size="13" />
                    <span class="text-xs text-amber-600">No rating scale in past 90 days — will be acknowledged automatically</span>
                    <button
                      class="text-xs text-teal-600 underline ml-1"
                      @click="scaleModalClientId = entry.client_id"
                    >
                      Administer now
                    </button>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    @click="openSkipModal(entry.client_id)"
                  >
                    <SkipForward :size="12" class="inline mr-1" />
                    Skip
                  </button>
                  <button
                    class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    :disabled="generatingFor === entry.client_id"
                    @click="generateReport(entry)"
                  >
                    <Loader2 v-if="generatingFor === entry.client_id" :size="12" class="animate-spin" />
                    <FileText v-else :size="12" />
                    {{ generatingFor === entry.client_id ? 'Generating…' : (entry.draft_report_id ? 'Preview Report' : 'Generate Report') }}
                  </button>
                </div>
              </div>
              <!-- Generate error -->
              <div v-if="generatingError && generatingFor === null && entry.client_id === previewReportId" class="px-5 pb-3 text-xs text-red-600">
                {{ generatingError }}
              </div>
            </div>

            <!-- Global generate error -->
            <div v-if="generatingError && generatingFor === null" class="text-xs text-red-600 px-1">
              {{ generatingError }}
            </div>
          </div>
        </section>

        <!-- ── Needs Attention ─────────────────────────────────────────────── -->
        <section class="mb-8">
          <button
            class="flex w-full items-center gap-2 mb-3 text-left"
            @click="showIncomplete = !showIncomplete"
          >
            <AlertTriangle class="text-amber-500" :size="18" />
            <h2 class="text-base font-semibold text-gray-900">
              Needs Attention
              <span class="ml-1.5 text-sm font-normal text-gray-400">({{ reportData.incomplete.length }})</span>
            </h2>
            <component :is="showIncomplete ? ChevronDown : ChevronRight" :size="16" class="ml-auto text-gray-400" />
          </button>

          <div v-if="showIncomplete && reportData.incomplete.length > 0" class="space-y-2">
            <div
              v-for="entry in reportData.incomplete"
              :key="entry.client_id"
              class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 flex items-start justify-between gap-4"
            >
              <div>
                <p class="text-sm font-semibold text-gray-900">{{ entry.client_name }}</p>
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  <span
                    v-for="gate in entry.failed_hard_gates"
                    :key="gate"
                    class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                  >
                    <XCircle :size="10" />
                    {{ gateLabel(gate) }}
                  </span>
                </div>
              </div>
              <button
                class="shrink-0 text-xs text-teal-600 underline"
                @click="router.push(`/clients/${entry.client_id}`)"
              >
                Go to client
              </button>
            </div>
          </div>
        </section>

        <!-- ── Already Generated ───────────────────────────────────────────── -->
        <section class="mb-8">
          <button
            class="flex w-full items-center gap-2 mb-3 text-left"
            @click="showGenerated = !showGenerated"
          >
            <CheckCircle2 class="text-gray-400" :size="18" />
            <h2 class="text-base font-semibold text-gray-500">
              Already Generated
              <span class="ml-1.5 text-sm font-normal text-gray-400">({{ reportData.already_generated.length }})</span>
            </h2>
            <component :is="showGenerated ? ChevronDown : ChevronRight" :size="16" class="ml-auto text-gray-400" />
          </button>

          <div v-if="showGenerated && reportData.already_generated.length > 0" class="space-y-2">
            <div
              v-for="entry in reportData.already_generated"
              :key="entry.report_id"
              class="rounded-xl border border-gray-200 bg-white px-5 py-3.5 flex items-center justify-between"
            >
              <div>
                <p class="text-sm font-semibold text-gray-900">{{ entry.client_name }}</p>
                <span
                  class="inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="entry.status === 'locked' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'"
                >
                  {{ entry.status === 'locked' ? 'Locked & Attested' : entry.status }}
                </span>
              </div>
              <div class="flex items-center gap-3">
                <button
                  v-if="entry.status === 'locked'"
                  class="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  @click="router.push(`/billing/audit-drill-down/${entry.report_id}`)"
                >
                  <ExternalLink :size="12" />
                  View Audit Response
                </button>
                <button
                  class="text-xs font-medium text-teal-600 underline"
                  @click="openExistingReport(entry)"
                >
                  View Report
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Skipped ─────────────────────────────────────────────────────── -->
        <section v-if="reportData.skipped.length > 0" class="mb-8">
          <button
            class="flex w-full items-center gap-2 mb-3 text-left"
            @click="showSkipped = !showSkipped"
          >
            <SkipForward class="text-gray-400" :size="18" />
            <h2 class="text-base font-semibold text-gray-500">
              Skipped
              <span class="ml-1.5 text-sm font-normal text-gray-400">({{ reportData.skipped.length }})</span>
            </h2>
            <component :is="showSkipped ? ChevronDown : ChevronRight" :size="16" class="ml-auto text-gray-400" />
          </button>

          <div v-if="showSkipped" class="space-y-2">
            <div
              v-for="entry in reportData.skipped"
              :key="entry.report_id"
              class="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3.5"
            >
              <p class="text-sm font-semibold text-gray-700">{{ entry.client_name }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ entry.skip_reason }}</p>
            </div>
          </div>
        </section>

      </template>
    </div>

    <!-- ── Rating Scale Admin Modal ──────────────────────────────────────────── -->
    <RatingScaleAdminModal
      v-if="scaleModalClientId"
      :client-id="scaleModalClientId"
      @close="scaleModalClientId = null"
      @completed="() => { scaleModalClientId = null; load() }"
    />

    <!-- ── Billing Report Preview Modal ─────────────────────────────────────── -->
    <BillingReportPreviewModal
      v-if="previewReportId"
      :report-id="previewReportId"
      :billing-month="billingMonth"
      :billing-month-label="billingMonthLabel"
      :client-name="previewClientName"
      @close="onPreviewClose"
      @attested="onAttested"
    />


    <!-- ── Skip Modal ────────────────────────────────────────────────────────── -->
    <div
      v-if="skipModalClientId"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      @click.self="skipModalClientId = null"
    >
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h3 class="text-base font-semibold text-gray-900 mb-1">Skip This Month</h3>
        <p class="text-sm text-gray-500 mb-4">
          Provide a reason for skipping billing for this client this month. This cannot be undone.
        </p>
        <textarea
          v-model="skipReason"
          rows="3"
          placeholder="e.g., Client on leave, no qualifying contact this month…"
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
        />
        <div class="flex justify-end gap-2 mt-4">
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            :disabled="skipLoading"
            @click="skipModalClientId = null"
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            :disabled="!skipReason.trim() || skipLoading"
            @click="confirmSkip"
          >
            <Loader2 v-if="skipLoading" :size="14" class="inline animate-spin mr-1" />
            Confirm Skip
          </button>
        </div>
      </div>
    </div>

  </component>
</template>
