<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, EDGE_FUNCTION_URL } from '@/lib/supabase'
import {
  FileText,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
} from 'lucide-vue-next'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BillingReport {
  id: string
  client_id: string
  billing_month: string
  billing_month_label: string
  status: string
  attested_at: string | null
  locked_at: string | null
  skipped: boolean
  skip_reason?: string
  pdf_url?: string
  csv_url?: string
  is_correction: boolean
  corrects_report_id?: string
  amendmentCount: number
  clients: { name: string; insurance_plan?: string }
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ── State ──────────────────────────────────────────────────────────────────────

const router = useRouter()
const loading = ref(true)
const error = ref<string | null>(null)
const reports = ref<BillingReport[]>([])
const pagination = ref<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 })

// Filters
const statusFilter = ref('')
const hasAmendments = ref(false)
const fromMonth = ref('')
const toMonth = ref('')
const showFilters = ref(false)

// ── Load ──────────────────────────────────────────────────────────────────────

async function load(page = 1) {
  loading.value = true
  error.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const params = new URLSearchParams({ page: String(page), limit: '25' })
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (hasAmendments.value) params.set('has_amendments', 'true')
    if (fromMonth.value) params.set('from_month', fromMonth.value)
    if (toMonth.value) params.set('to_month', toMonth.value)

    const res = await fetch(`${EDGE_FUNCTION_URL}/billing-hub/history?${params}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!res.ok) throw new Error('Failed to load billing history')
    const json = await res.json() as { reports: BillingReport[]; pagination: Pagination }
    reports.value = json.reports
    pagination.value = json.pagination
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

onMounted(() => load(1))

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusClass(status: string, skipped: boolean): string {
  if (skipped) return 'bg-gray-100 text-gray-500'
  switch (status) {
    case 'locked': return 'bg-teal-100 text-teal-700'
    case 'attested': return 'bg-green-100 text-green-700'
    case 'draft': return 'bg-gray-100 text-gray-600'
    case 'correction': return 'bg-amber-100 text-amber-700'
    default: return 'bg-gray-100 text-gray-500'
  }
}

function statusLabel(status: string, skipped: boolean, isCorrection: boolean): string {
  if (skipped) return 'Skipped'
  if (isCorrection) return 'Correction'
  switch (status) {
    case 'locked': return 'Locked'
    case 'attested': return 'Attested'
    case 'draft': return 'Draft'
    default: return status
  }
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-')
  const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function applyFilters() {
  load(1)
}

function clearFilters() {
  statusFilter.value = ''
  hasAmendments.value = false
  fromMonth.value = ''
  toMonth.value = ''
  load(1)
}
</script>

<template>
  <div>
    <!-- ── Filter Bar ──────────────────────────────────────────────────────── -->
    <div class="mb-4 flex items-center gap-3">
      <button
        class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        @click="showFilters = !showFilters"
      >
        <Filter :size="14" />
        Filters
        <span v-if="statusFilter || hasAmendments || fromMonth || toMonth" class="ml-1 rounded-full bg-teal-600 text-white text-xs px-1.5 py-0.5">
          {{ [statusFilter, hasAmendments, fromMonth, toMonth].filter(Boolean).length }}
        </span>
      </button>

      <span class="text-sm text-gray-400">
        {{ pagination.total }} report{{ pagination.total !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Filter Panel -->
    <div v-if="showFilters" class="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
        <select
          v-model="statusFilter"
          class="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="attested">Attested</option>
          <option value="locked">Locked</option>
          <option value="correction">Correction</option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">From Month</label>
        <input
          v-model="fromMonth"
          type="month"
          class="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">To Month</label>
        <input
          v-model="toMonth"
          type="month"
          class="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      </div>

      <div class="flex flex-col justify-end gap-2">
        <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input v-model="hasAmendments" type="checkbox" class="rounded border-gray-300 text-teal-600 focus:ring-teal-400" />
          Has amendments
        </label>
        <div class="flex gap-2">
          <button
            class="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
            @click="applyFilters"
          >
            Apply
          </button>
          <button
            class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
            @click="clearFilters"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-16">
      <Loader2 class="animate-spin text-teal-600" :size="24" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-center">
      <p class="text-sm text-red-700">{{ error }}</p>
      <button class="mt-2 text-sm text-teal-600 underline" @click="load(1)">Retry</button>
    </div>

    <!-- Empty -->
    <div v-else-if="reports.length === 0" class="rounded-xl border border-gray-200 bg-gray-50 py-16 text-center">
      <FileText class="mx-auto mb-2 text-gray-300" :size="32" />
      <p class="text-sm text-gray-400">No billing reports found for the selected filters.</p>
    </div>

    <!-- Table -->
    <div v-else class="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amendments</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attested</th>
            <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr
            v-for="report in reports"
            :key="report.id"
            class="hover:bg-gray-50 transition-colors"
          >
            <td class="px-4 py-3 font-medium text-gray-900">
              {{ formatMonth(report.billing_month) }}
            </td>
            <td class="px-4 py-3">
              <p class="font-medium text-gray-900">{{ report.clients?.name ?? 'Unknown' }}</p>
              <p class="text-xs text-gray-400">{{ report.clients?.insurance_plan ?? '' }}</p>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="statusClass(report.status, report.skipped)"
              >
                {{ statusLabel(report.status, report.skipped, report.is_correction) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="report.amendmentCount > 0"
                class="inline-flex items-center gap-1 text-xs text-amber-700 font-medium"
              >
                <AlertTriangle :size="12" />
                {{ report.amendmentCount }} amendment{{ report.amendmentCount > 1 ? 's' : '' }}
              </span>
              <span v-else class="text-xs text-gray-300">—</span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-500">
              {{ report.attested_at ? new Date(report.attested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-3">
                <a
                  v-if="report.pdf_url"
                  :href="report.pdf_url"
                  target="_blank"
                  class="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  title="Download PDF"
                >
                  <Download :size="13" />
                  PDF
                </a>
                <button
                  v-if="report.status === 'locked'"
                  class="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-medium"
                  @click="$router.push(`/billing/audit-drill-down/${report.id}`)"
                >
                  <ExternalLink :size="12" />
                  Audit View
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div
        v-if="pagination.totalPages > 1"
        class="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50"
      >
        <span class="text-xs text-gray-500">
          Page {{ pagination.page }} of {{ pagination.totalPages }} · {{ pagination.total }} total
        </span>
        <div class="flex gap-1">
          <button
            class="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="pagination.page <= 1"
            @click="load(pagination.page - 1)"
          >
            <ChevronLeft :size="14" />
          </button>
          <button
            class="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :disabled="pagination.page >= pagination.totalPages"
            @click="load(pagination.page + 1)"
          >
            <ChevronRight :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
