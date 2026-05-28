<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { X, Shield, Loader2, Upload } from 'lucide-vue-next'

// ── Props / Emits ──────────────────────────────────────────────────────────────

interface AuditTracker {
  id: string
  audit_reference_number: string
  auditing_entity: string
  audit_type: string
  status: string
  billing_months_in_scope: string[]
  total_claims_in_scope: number
  total_amount_at_risk?: number
  audit_received_date: string
  response_deadline: string
  submitted_at?: string
  resolved_at?: string
  resolution_notes?: string
  amount_recovered?: number
  amount_repaid?: number
}

const props = defineProps<{
  tracker?: AuditTracker  // if provided, edit mode; otherwise create mode
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

// ── State ──────────────────────────────────────────────────────────────────────

const saving = ref(false)
const error = ref<string | null>(null)

// Form fields
const auditingEntity = ref(props.tracker?.auditing_entity ?? '')
const auditReferenceNumber = ref(props.tracker?.audit_reference_number ?? '')
const auditType = ref(props.tracker?.audit_type ?? 'medical_review')
const billingMonthsInput = ref((props.tracker?.billing_months_in_scope ?? []).join(', '))
const totalClaimsInScope = ref(props.tracker?.total_claims_in_scope ?? 0)
const totalAmountAtRisk = ref<number | ''>(props.tracker?.total_amount_at_risk ?? '')
const auditReceivedDate = ref(props.tracker?.audit_received_date ?? '')
const responseDeadline = ref(props.tracker?.response_deadline ?? '')
const status = ref(props.tracker?.status ?? 'received')
const submittedAt = ref(props.tracker?.submitted_at ?? '')
const resolvedAt = ref(props.tracker?.resolved_at ?? '')
const resolutionNotes = ref(props.tracker?.resolution_notes ?? '')
const amountRecovered = ref<number | ''>(props.tracker?.amount_recovered ?? '')
const amountRepaid = ref<number | ''>(props.tracker?.amount_repaid ?? '')

// Response letter upload
const letterFile = ref<File | null>(null)
const uploadingLetter = ref(false)

const isEditMode = computed(() => !!props.tracker)
const isResolved = computed(() => ['resolved_favorable', 'resolved_unfavorable', 'closed'].includes(status.value))

const AUDIT_TYPES = [
  { value: 'pre_payment', label: 'Pre-payment Review' },
  { value: 'post_payment', label: 'Post-payment Audit' },
  { value: 'medical_review', label: 'Medical Review' },
  { value: 'compliance', label: 'Compliance Review' },
  { value: 'targeted', label: 'Targeted Audit' },
  { value: 'random', label: 'Random Sample Audit' },
]

const STATUS_OPTIONS = [
  { value: 'received', label: 'Received' },
  { value: 'documentation_gathering', label: 'Documentation Gathering' },
  { value: 'package_submitted', label: 'Package Submitted' },
  { value: 'awaiting_decision', label: 'Awaiting Decision' },
  { value: 'resolved_favorable', label: 'Resolved — Favorable' },
  { value: 'resolved_unfavorable', label: 'Resolved — Unfavorable' },
  { value: 'appealed', label: 'Appealed' },
  { value: 'closed', label: 'Closed' },
]

// ── Submit ────────────────────────────────────────────────────────────────────

async function save() {
  saving.value = true
  error.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const billingMonths = billingMonthsInput.value
      .split(',')
      .map(m => m.trim())
      .filter(m => /^\d{4}-\d{2}$/.test(m))

    const body = {
      auditing_entity: auditingEntity.value.trim(),
      audit_reference_number: auditReferenceNumber.value.trim(),
      audit_type: auditType.value,
      billing_months_in_scope: billingMonths,
      total_claims_in_scope: totalClaimsInScope.value,
      total_amount_at_risk: totalAmountAtRisk.value !== '' ? Number(totalAmountAtRisk.value) : null,
      audit_received_date: auditReceivedDate.value,
      response_deadline: responseDeadline.value,
      status: isEditMode.value ? status.value : undefined,
      submitted_at: submittedAt.value || null,
      resolved_at: resolvedAt.value || null,
      resolution_notes: resolutionNotes.value.trim() || null,
      amount_recovered: amountRecovered.value !== '' ? Number(amountRecovered.value) : null,
      amount_repaid: amountRepaid.value !== '' ? Number(amountRepaid.value) : null,
    }

    let res: Response
    if (isEditMode.value) {
      res = await fetch(`${EDGE_FUNCTION_URL}/audit-tracker/tracker/${props.tracker!.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      res = await fetch(`${EDGE_FUNCTION_URL}/audit-tracker/tracker`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    const json = await res.json() as { id?: string; error?: string }
    if (!res.ok) throw new Error(json.error ?? 'Failed to save audit tracker')

    // Upload response letter if provided
    if (letterFile.value && isEditMode.value) {
      uploadingLetter.value = true
      const trackerId = props.tracker!.id
      const formData = new FormData()
      formData.append('file', letterFile.value)
      const letterRes = await fetch(
        `${EDGE_FUNCTION_URL}/audit-tracker/tracker/${trackerId}/upload-response-letter`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: formData,
        }
      )
      if (!letterRes.ok) {
        console.warn('Letter upload failed but tracker was saved')
      }
      uploadingLetter.value = false
    }

    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    saving.value = false
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  letterFile.value = input.files?.[0] ?? null
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" @click.self="emit('close')">
    <div class="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div class="flex items-center gap-2.5">
          <Shield class="text-teal-600" :size="18" />
          <h2 class="text-base font-semibold text-gray-900">{{ isEditMode ? 'Update Audit' : 'New Audit' }}</h2>
        </div>
        <button @click="emit('close')" class="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <X :size="16" />
        </button>
      </div>

      <!-- Form -->
      <div class="px-6 py-5 space-y-4">

        <!-- Auditing entity & ref -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Auditing Entity <span class="text-red-500">*</span></label>
            <input v-model="auditingEntity" type="text" placeholder="e.g., Medicaid, CMS" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Reference Number <span class="text-red-500">*</span></label>
            <input v-model="auditReferenceNumber" type="text" placeholder="AUD-2024-001" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
        </div>

        <!-- Audit type -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Audit Type</label>
          <select v-model="auditType" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option v-for="opt in AUDIT_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Received Date <span class="text-red-500">*</span></label>
            <input v-model="auditReceivedDate" type="date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Response Deadline <span class="text-red-500">*</span></label>
            <input v-model="responseDeadline" type="date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
        </div>

        <!-- Scope -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Billing Months in Scope</label>
          <input v-model="billingMonthsInput" type="text" placeholder="e.g., 2024-01, 2024-02, 2024-03" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <p class="text-xs text-gray-400 mt-1">Comma-separated YYYY-MM format</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Total Claims in Scope</label>
            <input v-model.number="totalClaimsInScope" type="number" min="0" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Amount at Risk ($)</label>
            <input v-model="totalAmountAtRisk" type="number" min="0" step="0.01" placeholder="0.00" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
        </div>

        <!-- Status (edit mode only) -->
        <div v-if="isEditMode">
          <label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select v-model="status" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <!-- Submitted date -->
        <div v-if="isEditMode && ['package_submitted', 'awaiting_decision', 'resolved_favorable', 'resolved_unfavorable', 'appealed', 'closed'].includes(status)">
          <label class="block text-xs font-medium text-gray-600 mb-1">Submitted Date</label>
          <input v-model="submittedAt" type="date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>

        <!-- Resolution fields -->
        <template v-if="isEditMode && isResolved">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Resolved Date</label>
            <input v-model="resolvedAt" type="date" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Resolution Notes</label>
            <textarea v-model="resolutionNotes" rows="3" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Amount Recovered ($)</label>
              <input v-model="amountRecovered" type="number" min="0" step="0.01" placeholder="0.00" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Amount Repaid ($)</label>
              <input v-model="amountRepaid" type="number" min="0" step="0.01" placeholder="0.00" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>
        </template>

        <!-- Response letter upload (edit mode) -->
        <div v-if="isEditMode">
          <label class="block text-xs font-medium text-gray-600 mb-1">Upload Response Letter <span class="text-gray-400">(PDF, JPEG, PNG — max 25MB)</span></label>
          <label class="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
            <Upload :size="14" class="text-gray-400 shrink-0" />
            <span class="text-sm text-gray-500">{{ letterFile ? letterFile.name : 'Click to upload response letter' }}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.tiff" class="hidden" @change="onFileChange" />
          </label>
        </div>

        <!-- Error -->
        <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ error }}
        </div>

      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 sticky bottom-0">
        <button
          class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          :disabled="saving || !auditingEntity.trim() || !auditReferenceNumber.trim() || !auditReceivedDate || !responseDeadline"
          @click="save"
        >
          <Loader2 v-if="saving || uploadingLetter" :size="14" class="animate-spin" />
          {{ saving || uploadingLetter ? 'Saving…' : (isEditMode ? 'Save Changes' : 'Create Audit') }}
        </button>
      </div>

    </div>
  </div>
</template>
