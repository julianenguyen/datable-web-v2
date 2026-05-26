<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { CheckCircle2, AlertTriangle, XCircle, FileText, Loader2, Lock } from 'lucide-vue-next'

// ── Types ──────────────────────────────────────────────────────────────────────
type GateStatus = 'loading' | 'pass' | 'warn' | 'fail'

interface Gate {
  key: string
  label: string
  status: GateStatus
  message: string | null
  actionLabel?: string
  onAction?: () => void
}

// ── Props ──────────────────────────────────────────────────────────────────────
const props = defineProps<{
  // Initiating visit gate
  visitStatus: 'loading' | 'pass' | 'fail' | 'warn'
  visitMessage: string | null
  onDocumentVisit?: () => void

  // Consent gate
  consentStatus: 'loading' | 'pass' | 'fail' | 'warn'
  consentMessage: string | null
  onManageConsent?: () => void

  // Care plan gate
  carePlanStatus: 'loading' | 'pass' | 'fail' | 'warn'
  carePlanMessage: string | null
  onManageCarePlan?: () => void

  // Clinical time gate
  clinicalTimeStatus: 'loading' | 'pass' | 'fail' | 'warn'
  clinicalTimeMessage: string | null
  onLogTime?: () => void

  // Report generation
  generating: boolean
  onGenerateReport?: () => void
}>()

const emit = defineEmits<{
  generateReport: []
}>()

// ── Computed ──────────────────────────────────────────────────────────────────
const gates = computed<Gate[]>(() => [
  {
    key: 'visit',
    label: 'Initiating Visit (90791)',
    status: props.visitStatus,
    message: props.visitMessage,
    actionLabel: props.visitStatus === 'fail' ? 'Document Visit' : undefined,
    onAction: props.onDocumentVisit,
  },
  {
    key: 'consent',
    label: 'Patient Consent',
    status: props.consentStatus,
    message: props.consentMessage,
    actionLabel: props.consentStatus === 'fail' ? 'Manage Consent' : undefined,
    onAction: props.onManageConsent,
  },
  {
    key: 'carePlan',
    label: 'Individualized Care Plan (G0323)',
    status: props.carePlanStatus,
    message: props.carePlanMessage,
    actionLabel: props.carePlanStatus === 'fail' ? 'Create Care Plan' : (props.carePlanStatus === 'warn' ? 'Update' : undefined),
    onAction: props.onManageCarePlan,
  },
  {
    key: 'clinicalTime',
    label: 'Qualifying Clinical Time (≥20 min)',
    status: props.clinicalTimeStatus,
    message: props.clinicalTimeMessage,
    actionLabel: props.clinicalTimeStatus === 'fail' ? 'Log Time' : undefined,
    onAction: props.onLogTime,
  },
])

const allPass = computed(() =>
  gates.value.every((g) => g.status === 'pass')
)

const anyLoading = computed(() =>
  gates.value.some((g) => g.status === 'loading')
)

const overallStatus = computed<'loading' | 'ready' | 'blocked'>(() => {
  if (anyLoading.value) return 'loading'
  if (allPass.value) return 'ready'
  return 'blocked'
})

// ── Helpers ────────────────────────────────────────────────────────────────────
function iconFor(status: GateStatus) {
  if (status === 'loading') return Loader2
  if (status === 'pass') return CheckCircle2
  if (status === 'warn') return AlertTriangle
  return XCircle
}

function colorFor(status: GateStatus): string {
  if (status === 'loading') return 'text-gray-400'
  if (status === 'pass') return 'text-green-600'
  if (status === 'warn') return 'text-amber-500'
  return 'text-red-500'
}

function rowBg(status: GateStatus): string {
  if (status === 'pass') return 'bg-green-50'
  if (status === 'warn') return 'bg-amber-50'
  if (status === 'fail') return 'bg-red-50'
  return 'bg-gray-50'
}
</script>

<template>
  <div class="billing-readiness-panel rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
    <!-- Panel header -->
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <FileText :size="16" class="text-teal-600" />
        <h3 class="text-sm font-semibold text-gray-900">G0323 Billing Readiness</h3>
      </div>

      <!-- Overall status chip -->
      <div
        v-if="overallStatus === 'loading'"
        class="flex items-center gap-1.5 text-xs text-gray-500"
      >
        <Loader2 :size="12" class="animate-spin" />
        Checking…
      </div>
      <div
        v-else-if="overallStatus === 'ready'"
        class="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 border border-green-200 rounded-full px-2.5 py-0.5"
      >
        <CheckCircle2 :size="12" />
        Ready to bill
      </div>
      <div
        v-else
        class="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5"
      >
        <Lock :size="12" />
        Not ready
      </div>
    </div>

    <!-- Gate rows -->
    <div class="divide-y divide-gray-100">
      <div
        v-for="gate in gates"
        :key="gate.key"
        class="flex items-start gap-3 px-5 py-3.5"
        :class="rowBg(gate.status)"
      >
        <!-- Status icon -->
        <component
          :is="iconFor(gate.status)"
          :size="16"
          class="mt-0.5 shrink-0 transition-colors"
          :class="[colorFor(gate.status), { 'animate-spin': gate.status === 'loading' }]"
        />

        <!-- Label + message -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800">{{ gate.label }}</p>
          <p v-if="gate.message" class="text-xs text-gray-500 mt-0.5 leading-snug">
            {{ gate.message }}
          </p>
        </div>

        <!-- Action button -->
        <button
          v-if="gate.actionLabel && gate.onAction"
          type="button"
          class="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          @click="gate.onAction()"
        >
          {{ gate.actionLabel }}
        </button>
      </div>
    </div>

    <!-- Generate Report footer -->
    <div class="px-5 py-4 border-t border-gray-100 bg-gray-50">
      <button
        type="button"
        class="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors"
        :class="allPass
          ? 'bg-teal-600 text-white hover:bg-teal-700 cursor-pointer'
          : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'"
        :disabled="!allPass || generating"
        @click="allPass && !generating && emit('generateReport')"
      >
        <Loader2 v-if="generating" :size="15" class="animate-spin" />
        <FileText v-else :size="15" />
        {{ generating ? 'Generating Report…' : 'Generate Billing Report' }}
      </button>

      <p v-if="!allPass && !anyLoading" class="mt-2 text-center text-xs text-gray-400">
        All four gates must pass before generating a report.
      </p>
    </div>
  </div>
</template>
