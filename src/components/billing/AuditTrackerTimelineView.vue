<script setup lang="ts">
import { computed } from 'vue'
import { X, CheckCircle2, Circle, Clock, Shield, Download } from 'lucide-vue-next'

// ── Props / Emits ──────────────────────────────────────────────────────────────

interface AuditTracker {
  id: string
  audit_reference_number: string
  auditing_entity: string
  audit_type: string
  status: string
  billing_months_in_scope: string[]
  clients_in_scope: string[]
  total_claims_in_scope: number
  total_amount_at_risk?: number
  audit_received_date: string
  response_deadline: string
  submitted_at?: string
  resolved_at?: string
  resolution_notes?: string
  amount_recovered?: number
  amount_repaid?: number
  response_letter_url?: string
  daysUntilDeadline?: number
  isOverdue?: boolean
  urgency?: string
  created_at: string
  updated_at: string
}

const props = defineProps<{ tracker: AuditTracker }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

// ── Timeline Steps ─────────────────────────────────────────────────────────────

const LIFECYCLE = [
  {
    key: 'received',
    label: 'Audit Received',
    description: 'Audit notice received from payer',
    dateField: 'audit_received_date' as keyof AuditTracker,
  },
  {
    key: 'documentation_gathering',
    label: 'Documentation Gathering',
    description: 'Collecting clinical records and supporting documentation',
    dateField: null,
  },
  {
    key: 'package_submitted',
    label: 'Package Submitted',
    description: 'Audit response package submitted to payer',
    dateField: 'submitted_at' as keyof AuditTracker | null,
  },
  {
    key: 'awaiting_decision',
    label: 'Awaiting Decision',
    description: 'Waiting for payer determination',
    dateField: null,
  },
  {
    key: 'resolved',
    label: 'Resolved',
    description: 'Payer issued final determination',
    dateField: 'resolved_at' as keyof AuditTracker | null,
  },
]

const STATUS_ORDER = [
  'received',
  'documentation_gathering',
  'package_submitted',
  'awaiting_decision',
  'resolved_favorable',
  'resolved_unfavorable',
  'appealed',
  'closed',
]

const currentStatusIndex = computed(() => {
  const s = props.tracker.status
  if (['resolved_favorable', 'resolved_unfavorable'].includes(s)) return 4
  if (s === 'appealed') return 3  // appealed = went back to awaiting after package submitted
  return STATUS_ORDER.indexOf(s)
})

function stepStatus(stepIndex: number): 'completed' | 'current' | 'upcoming' {
  if (stepIndex < currentStatusIndex.value) return 'completed'
  if (stepIndex === currentStatusIndex.value) return 'current'
  return 'upcoming'
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  pre_payment: 'Pre-payment Review',
  post_payment: 'Post-payment Audit',
  medical_review: 'Medical Review',
  compliance: 'Compliance Review',
  targeted: 'Targeted Audit',
  random: 'Random Sample Audit',
}

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  documentation_gathering: 'Gathering Docs',
  package_submitted: 'Package Submitted',
  awaiting_decision: 'Awaiting Decision',
  resolved_favorable: 'Resolved — Favorable',
  resolved_unfavorable: 'Resolved — Unfavorable',
  appealed: 'Appealed',
  closed: 'Closed',
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'resolved_favorable': return 'bg-green-100 text-green-700'
    case 'resolved_unfavorable': return 'bg-red-100 text-red-700'
    case 'appealed': return 'bg-orange-100 text-orange-700'
    case 'closed': return 'bg-gray-100 text-gray-500'
    default: return 'bg-teal-100 text-teal-700'
  }
}

function fmt(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-end" @click.self="emit('close')">
    <div class="h-full w-full max-w-md bg-white shadow-xl flex flex-col overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
        <div class="flex items-center gap-2.5">
          <Shield class="text-teal-600" :size="18" />
          <div>
            <h2 class="text-sm font-semibold text-gray-900">{{ tracker.auditing_entity }}</h2>
            <p class="text-xs text-gray-400">#{{ tracker.audit_reference_number }}</p>
          </div>
        </div>
        <button @click="emit('close')" class="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <X :size="16" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        <!-- Summary card -->
        <div class="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500">Current Status</span>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="statusBadgeClass(tracker.status)">
              {{ STATUS_LABELS[tracker.status] ?? tracker.status }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-gray-400">Type</span>
              <p class="font-medium text-gray-700 mt-0.5">{{ AUDIT_TYPE_LABELS[tracker.audit_type] ?? tracker.audit_type }}</p>
            </div>
            <div>
              <span class="text-gray-400">Deadline</span>
              <p class="font-medium mt-0.5" :class="tracker.isOverdue ? 'text-red-600' : 'text-gray-700'">{{ fmt(tracker.response_deadline) }}</p>
            </div>
            <div>
              <span class="text-gray-400">Months in Scope</span>
              <p class="font-medium text-gray-700 mt-0.5">{{ tracker.billing_months_in_scope.join(', ') || '—' }}</p>
            </div>
            <div>
              <span class="text-gray-400">Claims at Risk</span>
              <p class="font-medium text-gray-700 mt-0.5">
                {{ tracker.total_claims_in_scope }}
                <span v-if="tracker.total_amount_at_risk"> · ${{ tracker.total_amount_at_risk.toLocaleString() }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Vertical timeline -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Lifecycle Timeline</h3>
          <div class="relative">
            <div class="absolute left-3 top-3 bottom-3 w-0.5 bg-gray-200" />

            <div
              v-for="(stage, i) in LIFECYCLE"
              :key="stage.key"
              class="relative flex gap-4 pb-6 last:pb-0"
            >
              <!-- Node -->
              <div
                class="relative z-10 flex items-center justify-center w-7 h-7 rounded-full shrink-0 ring-2 transition-colors"
                :class="stepStatus(i) === 'completed'
                  ? 'bg-teal-600 ring-teal-100'
                  : stepStatus(i) === 'current'
                    ? 'bg-white ring-teal-400'
                    : 'bg-white ring-gray-200'"
              >
                <CheckCircle2 v-if="stepStatus(i) === 'completed'" class="text-white" :size="14" />
                <div v-else-if="stepStatus(i) === 'current'" class="w-3 h-3 rounded-full bg-teal-500" />
                <Circle v-else class="text-gray-300" :size="14" />
              </div>

              <!-- Content -->
              <div class="flex-1 pt-0.5">
                <p class="text-sm font-semibold" :class="stepStatus(i) === 'upcoming' ? 'text-gray-400' : 'text-gray-900'">
                  {{ stage.label }}
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ stage.description }}</p>

                <!-- Date badge -->
                <div v-if="stage.dateField && tracker[stage.dateField]" class="flex items-center gap-1 mt-1.5">
                  <Clock :size="11" class="text-gray-400" />
                  <span class="text-xs text-gray-500">{{ fmt(tracker[stage.dateField] as string) }}</span>
                </div>

                <!-- Current step call-to-action  -->
                <div v-if="stepStatus(i) === 'current' && tracker.isOverdue" class="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <p class="text-xs text-red-700 font-medium">Response deadline has passed — submit immediately</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Resolution details -->
        <div v-if="['resolved_favorable', 'resolved_unfavorable', 'appealed', 'closed'].includes(tracker.status)" class="rounded-xl border border-gray-200 px-4 py-3">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resolution Details</h3>
          <div v-if="tracker.resolution_notes" class="text-sm text-gray-700 mb-2">{{ tracker.resolution_notes }}</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div v-if="tracker.amount_recovered">
              <span class="text-gray-400">Amount Recovered</span>
              <p class="font-semibold text-green-700 mt-0.5">${{ tracker.amount_recovered.toLocaleString() }}</p>
            </div>
            <div v-if="tracker.amount_repaid">
              <span class="text-gray-400">Amount Repaid</span>
              <p class="font-semibold text-red-600 mt-0.5">${{ tracker.amount_repaid.toLocaleString() }}</p>
            </div>
          </div>
        </div>

        <!-- Response letter -->
        <div v-if="tracker.response_letter_url">
          <a
            :href="tracker.response_letter_url"
            target="_blank"
            class="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download :size="14" class="text-teal-600" />
            Download Response Letter
          </a>
        </div>

      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button
          class="w-full rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          @click="emit('updated')"
        >
          Update Audit Status
        </button>
      </div>

    </div>
  </div>
</template>
