<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase, EDGE_FUNCTION_URL } from '@/lib/supabase'
import {
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Package,
  Loader2,
  Edit3,
  Clock,
} from 'lucide-vue-next'
import AuditPackageGeneratorModal from '@/components/billing/AuditPackageGeneratorModal.vue'

// ── Route ──────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()
const reportId = route.params.reportId as string

// ── Types ──────────────────────────────────────────────────────────────────────

interface StepData {
  step: number
  title: string
  status: 'pass' | 'review'
  statusLabel: string
  data: Record<string, unknown>
}

interface Amendment {
  id: string
  field_path: string
  table_name: string
  value_at_billing: unknown
  new_value: unknown
  amendment_reason: string
  created_at: string
}

interface AuditPackage {
  id: string
  generated_at: string
  package_type: string
  auditing_entity?: string
  audit_reference_number?: string
  zip_url?: string
  expires_at: string
}

interface DrillDownData {
  reportId: string
  clientId: string
  clientName: string
  billingMonth: string
  billingMonthLabel: string
  status: string
  attestedAt: string
  lockedAt: string
  isCorrection: boolean
  correctsReportId?: string
  pdfUrl?: string
  csvUrl?: string
  steps: StepData[]
  amendments: Amendment[]
  auditPackages: AuditPackage[]
  amendmentCount: number
  hasAmendments: boolean
}

// ── State ──────────────────────────────────────────────────────────────────────

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<DrillDownData | null>(null)
const expandedSteps = ref<Set<number>>(new Set())
const showPackageModal = ref(false)

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  error.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/audit-package/drill-down/${reportId}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!res.ok) {
      const err = await res.json() as { error: string }
      throw new Error(err.error ?? 'Failed to load drill-down')
    }
    data.value = await res.json() as DrillDownData
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Step helpers ──────────────────────────────────────────────────────────────

function toggleStep(stepNum: number) {
  if (expandedSteps.value.has(stepNum)) {
    expandedSteps.value.delete(stepNum)
  } else {
    expandedSteps.value.add(stepNum)
  }
}

function stepStatusClass(status: string): string {
  return status === 'pass'
    ? 'bg-teal-100 text-teal-700 border-teal-200'
    : 'bg-amber-100 text-amber-700 border-amber-200'
}

function formatFieldPath(fp: string): string {
  return fp.split('.').map(p => p.replace(/_/g, ' ')).join(' › ')
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

// ── Data render helpers ───────────────────────────────────────────────────────

function renderStepData(stepData: Record<string, unknown>): [string, unknown][] {
  const skip = new Set(['id', 'therapist_id', 'client_id', 'created_at', 'updated_at', 'retention_expires_at'])
  return Object.entries(stepData)
    .filter(([k]) => !skip.has(k) && stepData[k] !== null && stepData[k] !== undefined)
    .map(([k, v]) => [k.replace(/_/g, ' '), v])
}
</script>

<template>
  <AppLayout>
    <div class="px-8 py-8 max-w-4xl mx-auto">

      <!-- Back nav -->
      <button
        class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5 transition-colors"
        @click="router.push('/billing')"
      >
        <ChevronLeft :size="16" />
        Back to Billing Hub
      </button>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-24">
        <Loader2 class="animate-spin text-teal-600" :size="28" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p class="text-sm text-red-700">{{ error }}</p>
        <button class="mt-2 text-sm text-teal-600 underline" @click="load">Retry</button>
      </div>

      <template v-else-if="data">

        <!-- ── Header ────────────────────────────────────────────────────── -->
        <div class="flex items-start justify-between mb-6">
          <div>
            <h1 class="text-xl font-bold text-gray-900">Audit Drill-Down</h1>
            <p class="text-sm text-gray-500 mt-0.5">
              {{ data.clientName }} · {{ data.billingMonthLabel }}
            </p>
            <div class="flex items-center gap-2 mt-2">
              <span class="inline-block rounded-full bg-teal-100 text-teal-700 text-xs font-medium px-2.5 py-0.5">
                Locked & Attested
              </span>
              <span v-if="data.hasAmendments" class="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                <AlertTriangle :size="12" />
                {{ data.amendmentCount }} post-lock amendment{{ data.amendmentCount > 1 ? 's' : '' }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <a
              v-if="data.pdfUrl"
              :href="data.pdfUrl"
              target="_blank"
              class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download :size="14" />
              Download PDF
            </a>
            <button
              class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
              @click="showPackageModal = true"
            >
              <Package :size="14" />
              Generate Audit Package
            </button>
          </div>
        </div>

        <!-- ── 8-Step Drill-Down ──────────────────────────────────────────── -->
        <div class="space-y-3 mb-8">
          <div
            v-for="step in data.steps"
            :key="step.step"
            class="rounded-xl border overflow-hidden"
            :class="step.status === 'review' ? 'border-amber-200' : 'border-gray-200'"
          >
            <!-- Step header (always visible) -->
            <button
              class="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
              @click="toggleStep(step.step)"
            >
              <div class="flex items-center gap-3">
                <span class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                  :class="step.status === 'pass' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'"
                >
                  {{ step.step }}
                </span>
                <div>
                  <p class="text-sm font-semibold text-gray-900">{{ step.title }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  :class="stepStatusClass(step.status)"
                >
                  <CheckCircle2 v-if="step.status === 'pass'" :size="11" />
                  <AlertTriangle v-else :size="11" />
                  {{ step.statusLabel }}
                </span>
                <span class="text-gray-300 text-xs">{{ expandedSteps.has(step.step) ? '▲' : '▼' }}</span>
              </div>
            </button>

            <!-- Step detail (expandable) -->
            <div v-if="expandedSteps.has(step.step)" class="px-5 pb-4 pt-1 border-t border-gray-100 bg-gray-50">
              <div class="grid grid-cols-2 gap-x-6 gap-y-2">
                <template v-for="[label, value] in renderStepData(step.data)" :key="String(label)">
                  <div>
                    <p class="text-xs text-gray-500 capitalize">{{ String(label) }}</p>
                    <p class="text-sm text-gray-900 font-medium break-words">
                      {{ typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '—') }}
                    </p>
                  </div>
                </template>
              </div>
              <p v-if="renderStepData(step.data).length === 0" class="text-xs text-gray-400 italic">No data on file for this step at billing time.</p>
            </div>
          </div>
        </div>

        <!-- ── Post-Lock Amendments ───────────────────────────────────────── -->
        <section v-if="data.hasAmendments" class="mb-8">
          <h2 class="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Edit3 class="text-amber-500" :size="16" />
            Post-Lock Amendments
            <span class="text-sm font-normal text-gray-400">({{ data.amendments.length }})</span>
          </h2>
          <div class="rounded-xl border border-amber-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-amber-50 border-b border-amber-100">
                <tr>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">Field</th>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">Value at Billing</th>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">New Value</th>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">Reason</th>
                  <th class="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-amber-100">
                <tr v-for="amendment in data.amendments" :key="amendment.id" class="hover:bg-amber-50 transition-colors">
                  <td class="px-4 py-3 font-medium text-gray-700">{{ formatFieldPath(amendment.field_path) }}</td>
                  <td class="px-4 py-3 text-gray-600 font-mono text-xs max-w-[140px] truncate">{{ formatValue(amendment.value_at_billing) }}</td>
                  <td class="px-4 py-3 text-gray-600 font-mono text-xs max-w-[140px] truncate">{{ formatValue(amendment.new_value) }}</td>
                  <td class="px-4 py-3 text-gray-700 max-w-[180px]">{{ amendment.amendment_reason }}</td>
                  <td class="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {{ new Date(amendment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ── Prior Audit Packages ───────────────────────────────────────── -->
        <section v-if="data.auditPackages.length > 0" class="mb-8">
          <h2 class="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Package class="text-teal-500" :size="16" />
            Previously Generated Packages
            <span class="text-sm font-normal text-gray-400">({{ data.auditPackages.length }})</span>
          </h2>
          <div class="space-y-2">
            <div
              v-for="pkg in data.auditPackages"
              :key="pkg.id"
              class="rounded-xl border border-gray-200 bg-white px-5 py-3.5 flex items-center justify-between"
            >
              <div>
                <p class="text-sm font-medium text-gray-900">
                  {{ pkg.auditing_entity ?? 'Package' }}
                  <span v-if="pkg.audit_reference_number" class="text-gray-400 font-normal ml-1">#{{ pkg.audit_reference_number }}</span>
                </p>
                <p class="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                  <Clock :size="11" />
                  Generated {{ new Date(pkg.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                  · Expires {{ new Date(pkg.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 capitalize">{{ pkg.package_type.replace('_', ' ') }}</span>
                <a
                  v-if="pkg.zip_url"
                  :href="pkg.zip_url"
                  target="_blank"
                  class="flex items-center gap-1 text-xs text-teal-600 font-medium hover:text-teal-800 transition-colors"
                >
                  <Download :size="12" />
                  Download ZIP
                </a>
              </div>
            </div>
          </div>
        </section>

      </template>

    </div>

    <!-- Audit Package Generator Modal -->
    <AuditPackageGeneratorModal
      v-if="showPackageModal && data"
      :report-id="reportId"
      :client-name="data.clientName"
      :billing-month-label="data.billingMonthLabel"
      @close="showPackageModal = false"
      @generated="() => { showPackageModal = false; load() }"
    />
  </AppLayout>
</template>
