<script setup lang="ts">
import { ref, computed } from 'vue'
import { supabase, EDGE_FUNCTION_URL } from '@/lib/supabase'
import {
  X,
  Package,
  Loader2,
  CheckCircle2,
  Download,
  FileText,
  Shield,
} from 'lucide-vue-next'

// ── Props / Emits ──────────────────────────────────────────────────────────────

interface Props {
  reportId: string
  clientName: string
  billingMonthLabel: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'generated', payload: { zipUrl: string; logId: string }): void
}>()

// ── State ──────────────────────────────────────────────────────────────────────

const step = ref(1)  // 1-5
const generating = ref(false)
const error = ref<string | null>(null)

// Step 1 — Audit info
const auditingEntity = ref('')
const auditReferenceNumber = ref('')
const auditType = ref<'pre_payment' | 'post_payment' | 'medical_review' | 'compliance' | 'targeted' | 'random'>('medical_review')

// Step 2 — Package scope (for this modal, always single report)
const packageType = ref<'full' | 'partial' | 'eligibility_only'>('full')

// Step 3 — Additional context
const additionalContext = ref('')

// Step 4 — Confirmation
const confirmed = ref(false)

// Step 5 — Result
const result = ref<{
  logId: string
  zipUrl: string
  eligibilityUrl: string
  indexUrl: string
  coverUrl: string
  csvUrl: string
  generatedAt: string
} | null>(null)

// ── Validation ────────────────────────────────────────────────────────────────

const step1Valid = computed(() => auditingEntity.value.trim().length >= 2 && auditReferenceNumber.value.trim().length >= 2)
const step3Valid = computed(() => additionalContext.value.length <= 500)
const contextCharsRemaining = computed(() => 500 - additionalContext.value.length)

// ── Generate ──────────────────────────────────────────────────────────────────

async function generate() {
  if (!confirmed.value) return
  generating.value = true
  error.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/audit-package/generate-package`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        report_ids: [props.reportId],
        audit_reference_number: auditReferenceNumber.value.trim(),
        auditing_entity: auditingEntity.value.trim(),
        additional_context: additionalContext.value.trim() || undefined,
        package_type: packageType.value,
      }),
    })
    const json = await res.json() as {
      logId?: string; zipUrl?: string; eligibilityUrl?: string;
      indexUrl?: string; coverUrl?: string; csvUrl?: string;
      generatedAt?: string; error?: string
    }
    if (!res.ok) throw new Error(json.error ?? 'Package generation failed')
    result.value = {
      logId: json.logId!,
      zipUrl: json.zipUrl!,
      eligibilityUrl: json.eligibilityUrl!,
      indexUrl: json.indexUrl!,
      coverUrl: json.coverUrl!,
      csvUrl: json.csvUrl!,
      generatedAt: json.generatedAt!,
    }
    step.value = 5
    emit('generated', { zipUrl: json.zipUrl!, logId: json.logId! })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    generating.value = false
  }
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  pre_payment: 'Pre-payment Review',
  post_payment: 'Post-payment Audit',
  medical_review: 'Medical Review',
  compliance: 'Compliance Review',
  targeted: 'Targeted Audit',
  random: 'Random Sample Audit',
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div class="flex items-center gap-2.5">
          <Package class="text-teal-600" :size="18" />
          <div>
            <h2 class="text-base font-semibold text-gray-900">Generate Audit Package</h2>
            <p class="text-xs text-gray-400">{{ clientName }} · {{ billingMonthLabel }}</p>
          </div>
        </div>
        <button @click="emit('close')" class="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <X :size="16" />
        </button>
      </div>

      <!-- Step indicator -->
      <div class="flex items-center gap-0 px-6 py-3 border-b border-gray-100 bg-gray-50">
        <template v-for="n in 5" :key="n">
          <div
            class="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 transition-colors"
            :class="step > n ? 'bg-teal-600 text-white' : step === n ? 'bg-teal-100 text-teal-700 ring-2 ring-teal-300' : 'bg-gray-200 text-gray-400'"
          >
            <CheckCircle2 v-if="step > n" :size="14" />
            <span v-else>{{ n }}</span>
          </div>
          <div v-if="n < 5" class="flex-1 h-0.5 mx-1" :class="step > n ? 'bg-teal-400' : 'bg-gray-200'" />
        </template>
      </div>

      <!-- Step body -->
      <div class="px-6 py-5 min-h-[240px]">

        <!-- Step 1: Audit identification -->
        <div v-if="step === 1">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Step 1 — Audit Identification</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Auditing Entity <span class="text-red-500">*</span></label>
              <input
                v-model="auditingEntity"
                type="text"
                placeholder="e.g., CMS, Medicaid, Aetna"
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Audit Reference Number <span class="text-red-500">*</span></label>
              <input
                v-model="auditReferenceNumber"
                type="text"
                placeholder="e.g., AUD-2024-001234"
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Audit Type</label>
              <select
                v-model="auditType"
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option v-for="(label, key) in AUDIT_TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Step 2: Package scope -->
        <div v-else-if="step === 2">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Step 2 — Package Type</h3>
          <div class="space-y-3">
            <label
              v-for="opt in [
                { value: 'full', label: 'Full Package', desc: 'Eligibility summary, billing index, individual reports, cover letter, CSV manifest' },
                { value: 'partial', label: 'Partial Package', desc: 'Eligibility summary and billing index only' },
                { value: 'eligibility_only', label: 'Eligibility Only', desc: 'Provider eligibility summary only' },
              ]"
              :key="opt.value"
              class="flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors"
              :class="packageType === opt.value ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'"
            >
              <input
                v-model="packageType"
                :value="opt.value"
                type="radio"
                class="mt-0.5 text-teal-600 focus:ring-teal-400"
              />
              <div>
                <p class="text-sm font-semibold text-gray-900">{{ opt.label }}</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ opt.desc }}</p>
              </div>
            </label>
          </div>
        </div>

        <!-- Step 3: Additional context -->
        <div v-else-if="step === 3">
          <h3 class="text-sm font-semibold text-gray-900 mb-2">Step 3 — Cover Letter Context <span class="text-gray-400 font-normal">(optional)</span></h3>
          <p class="text-xs text-gray-500 mb-3">This text will appear in the cover letter under "Additional Context". Max 500 characters.</p>
          <textarea
            v-model="additionalContext"
            rows="5"
            placeholder="e.g., All sessions were conducted via telehealth. Patient was experiencing acute crisis during the billing period…"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            :class="additionalContext.length > 500 ? 'border-red-300 focus:ring-red-400' : ''"
          />
          <div class="flex justify-end mt-1">
            <span class="text-xs" :class="contextCharsRemaining < 0 ? 'text-red-500 font-medium' : 'text-gray-400'">
              {{ contextCharsRemaining }} characters remaining
            </span>
          </div>
          <p v-if="additionalContext.length > 500" class="text-xs text-red-600 mt-1">
            Additional context must be 500 characters or fewer.
          </p>
        </div>

        <!-- Step 4: Review & confirm -->
        <div v-else-if="step === 4">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Step 4 — Review & Confirm</h3>
          <div class="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 space-y-2 mb-4">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Client</span>
              <span class="font-medium text-gray-900">{{ clientName }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Billing Period</span>
              <span class="font-medium text-gray-900">{{ billingMonthLabel }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Auditing Entity</span>
              <span class="font-medium text-gray-900">{{ auditingEntity }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Reference Number</span>
              <span class="font-medium text-gray-900 font-mono">{{ auditReferenceNumber }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Package Type</span>
              <span class="font-medium text-gray-900">{{ packageType.replace('_', ' ') }}</span>
            </div>
          </div>
          <label class="flex items-start gap-2.5 cursor-pointer">
            <input v-model="confirmed" type="checkbox" class="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-400" />
            <span class="text-sm text-gray-600">
              I confirm that this package contains Protected Health Information and will be transmitted securely to authorized recipients only.
            </span>
          </label>
          <div v-if="error" class="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {{ error }}
          </div>
        </div>

        <!-- Step 5: Success -->
        <div v-else-if="step === 5 && result" class="text-center py-4">
          <CheckCircle2 class="mx-auto mb-3 text-teal-500" :size="40" />
          <h3 class="text-base font-semibold text-gray-900 mb-1">Package Generated</h3>
          <p class="text-sm text-gray-500 mb-4">Your audit response package is ready. Links expire in 72 hours.</p>

          <div class="space-y-2 text-left">
            <a
              :href="result.zipUrl"
              target="_blank"
              class="flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
            >
              <Download :size="16" />
              Download Full ZIP Package
            </a>
            <div class="grid grid-cols-2 gap-2">
              <a :href="result.coverUrl" target="_blank" class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                <FileText :size="12" /> Cover Letter
              </a>
              <a :href="result.eligibilityUrl" target="_blank" class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                <Shield :size="12" /> Eligibility Summary
              </a>
              <a :href="result.indexUrl" target="_blank" class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                <FileText :size="12" /> Billing Index
              </a>
              <a :href="result.csvUrl" target="_blank" class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                <FileText :size="12" /> CSV Manifest
              </a>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button
          v-if="step > 1 && step < 5"
          class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          @click="step--"
        >
          Back
        </button>
        <div v-else />

        <div class="flex items-center gap-2">
          <button
            v-if="step < 5"
            class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            @click="emit('close')"
          >
            Cancel
          </button>

          <!-- Step 1–3: Next -->
          <button
            v-if="step < 4"
            class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            :disabled="step === 1 && !step1Valid || step === 3 && !step3Valid"
            @click="step++"
          >
            Next
          </button>

          <!-- Step 4: Generate -->
          <button
            v-else-if="step === 4"
            class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            :disabled="!confirmed || generating"
            @click="generate"
          >
            <Loader2 v-if="generating" :size="14" class="animate-spin" />
            <Package v-else :size="14" />
            {{ generating ? 'Generating…' : 'Generate Package' }}
          </button>

          <!-- Step 5: Done -->
          <button
            v-else-if="step === 5"
            class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
            @click="emit('close')"
          >
            Done
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
