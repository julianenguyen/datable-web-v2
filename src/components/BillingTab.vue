<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { FileText, AlertTriangle, Download, CheckCircle2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import ReportDetailDrawer from '@/components/ReportDetailDrawer.vue'

interface CcmReport {
  id: string
  billing_period_start: string
  billing_period_end: string
  billing_period_label: string
  status: 'draft' | 'finalized'
  cpt_code: string | null
  final_time_minutes: number
  meets_threshold: boolean
  finalized_at: string | null
  created_at: string
}

const props = defineProps<{
  clientId: string
  clientName: string
  insuranceStatus: 'insurance' | 'self_pay' | 'sliding_scale' | 'unknown'
}>()

const reports = ref<CcmReport[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const selectedReportId = ref<string | null>(null)
const isDrawerOpen = ref(false)
const generatingReportId = ref<string | null>(null)
const downloadingPdf = ref<string | null>(null)
const downloadingExcel = ref<string | null>(null)
const generatingManual = ref(false)

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
  }
}

async function loadReports() {
  isLoading.value = true
  error.value = null
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/clients/${props.clientId}/ccm-reports`,
      { headers: await authHeaders() }
    )
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    reports.value = data.reports ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load reports'
  } finally {
    isLoading.value = false
  }
}

async function generateManualReport() {
  generatingManual.value = true
  error.value = null
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/ccm-auto-draft`, {
      method: 'POST',
      headers: await authHeaders(),
    })
    if (!res.ok) throw new Error(await res.text())
    await loadReports()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to generate report'
  } finally {
    generatingManual.value = false
  }
}

async function downloadFile(reportId: string, type: 'pdf' | 'excel') {
  if (type === 'pdf') downloadingPdf.value = reportId
  else downloadingExcel.value = reportId

  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/ccm-reports/ccm-reports/${reportId}/generate-files`,
      { method: 'POST', headers: await authHeaders() }
    )
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    const url = type === 'pdf' ? data.pdf_url : data.excel_url
    if (url) window.open(url, '_blank')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to generate file'
  } finally {
    if (type === 'pdf') downloadingPdf.value = null
    else downloadingExcel.value = null
  }
}

function openDrawer(reportId: string) {
  selectedReportId.value = reportId
  isDrawerOpen.value = true
}

function onReportFinalized(reportId: string) {
  loadReports()
  const idx = reports.value.findIndex(r => r.id === reportId)
  if (idx !== -1) {
    reports.value[idx] = { ...reports.value[idx], status: 'finalized' }
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

onMounted(loadReports)
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center py-20 text-gray-400">
      <svg class="animate-spin w-5 h-5 mr-2 text-teal-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span class="text-sm">Loading billing reports…</span>
    </div>

    <template v-else>
      <!-- Error -->
      <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">
        {{ error }}
      </div>

      <!-- Empty state -->
      <div v-if="reports.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <FileText class="w-8 h-8 text-teal-500 mb-3" />
        <p class="text-sm font-medium text-gray-700 mb-1">No billing reports yet</p>
        <p class="text-xs text-gray-400 mb-5 max-w-xs leading-relaxed">
          Reports are automatically generated on the 28th of each month
          for clients with insurance billing enabled.
        </p>
        <button
          v-if="insuranceStatus === 'insurance'"
          @click="generateManualReport"
          :disabled="generatingManual"
          class="text-sm font-medium text-teal-700 border border-teal-300 hover:bg-teal-50 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors"
        >
          {{ generatingManual ? 'Generating…' : 'Generate Report for This Month' }}
        </button>
        <p v-else class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Set billing type to "Insurance" to enable monthly CCM reports.
        </p>
      </div>

      <!-- Report cards -->
      <div v-else class="space-y-3">
        <div
          v-for="report in reports"
          :key="report.id"
          class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
        >
          <div class="flex items-start justify-between mb-2">
            <div>
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-semibold text-gray-900">{{ report.billing_period_label }}</span>
                <!-- Status badge -->
                <span
                  class="text-xs font-medium px-2 py-0.5 rounded-full"
                  :class="report.status === 'finalized'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'"
                >
                  {{ report.status === 'finalized' ? 'Finalized' : 'Draft' }}
                </span>
              </div>
              <p class="text-xs text-gray-500">
                CPT {{ report.cpt_code ?? '—' }} · {{ report.final_time_minutes }} minutes documented
              </p>
            </div>
            <span class="text-xs text-gray-400 shrink-0 ml-4">
              {{ formatDate(report.created_at) }}
            </span>
          </div>

          <!-- Threshold status -->
          <div class="flex items-center gap-1.5 mb-3">
            <template v-if="report.meets_threshold">
              <CheckCircle2 class="w-3.5 h-3.5 text-green-500 shrink-0" />
              <span class="text-xs text-green-700">Meets 60-minute threshold</span>
            </template>
            <template v-else>
              <AlertTriangle class="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span class="text-xs text-amber-700 font-medium">
                Below minimum threshold — add time before finalizing
              </span>
            </template>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              @click="openDrawer(report.id)"
              class="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              :class="report.status === 'draft'
                ? 'bg-teal-600 hover:bg-teal-700 text-white'
                : 'text-teal-700 border border-teal-200 hover:bg-teal-50'"
            >
              {{ report.status === 'draft' ? 'Review & Finalize' : 'View Report' }}
            </button>

            <button
              @click="downloadFile(report.id, 'pdf')"
              :disabled="report.status !== 'finalized' || downloadingPdf === report.id"
              class="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
              :class="report.status === 'finalized'
                ? 'text-gray-700 border-gray-200 hover:bg-gray-50'
                : 'text-gray-300 border-gray-100 cursor-not-allowed'"
            >
              <Download class="w-3 h-3" />
              {{ downloadingPdf === report.id ? 'Generating…' : 'PDF' }}
            </button>

            <button
              @click="downloadFile(report.id, 'excel')"
              :disabled="report.status !== 'finalized' || downloadingExcel === report.id"
              class="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
              :class="report.status === 'finalized'
                ? 'text-gray-700 border-gray-200 hover:bg-gray-50'
                : 'text-gray-300 border-gray-100 cursor-not-allowed'"
            >
              <Download class="w-3 h-3" />
              {{ downloadingExcel === report.id ? 'Generating…' : 'Excel' }}
            </button>
          </div>
        </div>

        <!-- Generate button when reports exist but user wants a new one -->
        <div v-if="insuranceStatus === 'insurance'" class="pt-2">
          <button
            @click="generateManualReport"
            :disabled="generatingManual"
            class="text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
          >
            {{ generatingManual ? 'Generating…' : '+ Generate Report for This Month' }}
          </button>
        </div>
      </div>
    </template>

    <!-- Report Detail Drawer -->
    <ReportDetailDrawer
      v-if="selectedReportId"
      :report-id="selectedReportId"
      :client-name="clientName"
      :is-open="isDrawerOpen"
      @close="isDrawerOpen = false; selectedReportId = null"
      @finalized="onReportFinalized"
    />
  </div>
</template>
