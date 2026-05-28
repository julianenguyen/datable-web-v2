<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase, EDGE_FUNCTION_URL } from '@/lib/supabase'
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Edit2,
  Eye,
} from 'lucide-vue-next'
import AuditTrackerFormModal from '@/components/billing/AuditTrackerFormModal.vue'
import AuditTrackerTimelineView from '@/components/billing/AuditTrackerTimelineView.vue'

// ── Emits ──────────────────────────────────────────────────────────────────────

const emit = defineEmits<{ (e: 'create'): void }>()

// ── Types ──────────────────────────────────────────────────────────────────────

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
  daysUntilDeadline: number
  isOverdue: boolean
  urgency: 'overdue' | 'critical' | 'warning' | 'normal'
  audit_response_log?: unknown
  created_at: string
  updated_at: string
}

// ── State ──────────────────────────────────────────────────────────────────────

const loading = ref(true)
const error = ref<string | null>(null)
const open = ref<AuditTracker[]>([])
const resolved = ref<AuditTracker[]>([])
const showResolved = ref(false)
const editTracker = ref<AuditTracker | null>(null)
const timelineTracker = ref<AuditTracker | null>(null)

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  error.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/audit-tracker/tracker?include_resolved=true`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!res.ok) throw new Error('Failed to load audit trackers')
    const json = await res.json() as { open: AuditTracker[]; resolved: AuditTracker[] }
    open.value = json.open
    resolved.value = json.resolved
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUDIT_TYPE_LABELS: Record<string, string> = {
  pre_payment: 'Pre-payment',
  post_payment: 'Post-payment',
  medical_review: 'Medical Review',
  compliance: 'Compliance',
  targeted: 'Targeted',
  random: 'Random Sample',
}

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  documentation_gathering: 'Gathering Docs',
  package_submitted: 'Submitted',
  awaiting_decision: 'Awaiting Decision',
  resolved_favorable: 'Resolved — Favorable',
  resolved_unfavorable: 'Resolved — Unfavorable',
  appealed: 'Appealed',
  closed: 'Closed',
}

function urgencyBadgeClass(urgency: string, status: string): string {
  if (['resolved_favorable', 'resolved_unfavorable', 'closed'].includes(status)) return 'bg-gray-100 text-gray-500'
  switch (urgency) {
    case 'overdue': return 'bg-red-100 text-red-700'
    case 'critical': return 'bg-red-50 text-red-600'
    case 'warning': return 'bg-amber-50 text-amber-700'
    default: return 'bg-teal-50 text-teal-700'
  }
}

function deadlineLabel(t: AuditTracker): string {
  if (['resolved_favorable', 'resolved_unfavorable', 'closed'].includes(t.status)) return 'Resolved'
  if (t.isOverdue) return `${Math.abs(t.daysUntilDeadline)}d overdue`
  if (t.daysUntilDeadline === 0) return 'Due today'
  if (t.daysUntilDeadline === 1) return 'Due tomorrow'
  return `${t.daysUntilDeadline}d remaining`
}

function statusClass(status: string): string {
  switch (status) {
    case 'received': return 'bg-blue-100 text-blue-700'
    case 'documentation_gathering': return 'bg-amber-100 text-amber-700'
    case 'package_submitted': return 'bg-teal-100 text-teal-700'
    case 'awaiting_decision': return 'bg-purple-100 text-purple-700'
    case 'resolved_favorable': return 'bg-green-100 text-green-700'
    case 'resolved_unfavorable': return 'bg-red-100 text-red-700'
    case 'appealed': return 'bg-orange-100 text-orange-700'
    case 'closed': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100 text-gray-500'
  }
}
</script>

<template>
  <div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <Loader2 class="animate-spin text-teal-600" :size="24" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-5 text-center">
      <p class="text-sm text-red-700">{{ error }}</p>
      <button class="mt-2 text-sm text-teal-600 underline" @click="load">Retry</button>
    </div>

    <template v-else>

      <!-- ── Open Audits ──────────────────────────────────────────────────── -->
      <div v-if="open.length === 0" class="rounded-xl border border-dashed border-gray-300 py-14 text-center">
        <Shield class="mx-auto mb-2 text-gray-300" :size="32" />
        <p class="text-sm text-gray-400">No open audits. Create one if you receive an audit notice.</p>
        <button
          class="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          @click="emit('create')"
        >
          New Audit
        </button>
      </div>

      <div v-else class="space-y-3 mb-6">
        <div
          v-for="tracker in open"
          :key="tracker.id"
          class="rounded-xl border overflow-hidden"
          :class="tracker.isOverdue ? 'border-red-200' : tracker.urgency === 'critical' ? 'border-red-100' : tracker.urgency === 'warning' ? 'border-amber-200' : 'border-gray-200'"
        >
          <div class="px-5 py-4 flex items-start justify-between gap-4 bg-white">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-sm font-semibold text-gray-900">{{ tracker.auditing_entity }}</p>
                <code class="text-xs bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">#{{ tracker.audit_reference_number }}</code>
                <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium" :class="statusClass(tracker.status)">
                  {{ STATUS_LABELS[tracker.status] ?? tracker.status }}
                </span>
              </div>
              <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                <span>{{ AUDIT_TYPE_LABELS[tracker.audit_type] ?? tracker.audit_type }}</span>
                <span>·</span>
                <span>{{ tracker.billing_months_in_scope.length }} month{{ tracker.billing_months_in_scope.length !== 1 ? 's' : '' }} in scope</span>
                <span v-if="tracker.total_claims_in_scope">· {{ tracker.total_claims_in_scope }} claim{{ tracker.total_claims_in_scope !== 1 ? 's' : '' }}</span>
                <span v-if="tracker.total_amount_at_risk">
                  · ${{ tracker.total_amount_at_risk.toLocaleString() }} at risk
                </span>
              </div>
              <div class="flex items-center gap-1.5 mt-2 text-xs">
                <Clock :size="12" class="text-gray-400" />
                <span class="text-gray-500">Deadline: {{ new Date(tracker.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}</span>
                <span
                  class="ml-1 rounded-full px-2 py-0.5 font-medium"
                  :class="urgencyBadgeClass(tracker.urgency, tracker.status)"
                >
                  {{ deadlineLabel(tracker) }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                class="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                @click="timelineTracker = tracker"
              >
                <Eye :size="12" />
                Timeline
              </button>
              <button
                class="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                @click="editTracker = tracker"
              >
                <Edit2 :size="12" />
                Update
              </button>
            </div>
          </div>

          <!-- Overdue warning bar -->
          <div v-if="tracker.isOverdue" class="px-5 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2">
            <AlertTriangle class="text-red-500 shrink-0" :size="13" />
            <p class="text-xs text-red-700 font-medium">Deadline passed — response urgently needed</p>
          </div>
        </div>
      </div>

      <!-- ── Resolved Audits ─────────────────────────────────────────────── -->
      <div v-if="resolved.length > 0">
        <button
          class="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-500 hover:text-gray-700 mb-2"
          @click="showResolved = !showResolved"
        >
          <component :is="showResolved ? ChevronDown : ChevronRight" :size="16" />
          Resolved Audits ({{ resolved.length }})
        </button>

        <div v-if="showResolved" class="space-y-2">
          <div
            v-for="tracker in resolved"
            :key="tracker.id"
            class="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3.5 flex items-center justify-between"
          >
            <div>
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-gray-600">{{ tracker.auditing_entity }}</p>
                <code class="text-xs bg-gray-100 rounded px-1.5 py-0.5 text-gray-500">#{{ tracker.audit_reference_number }}</code>
                <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium" :class="statusClass(tracker.status)">
                  {{ STATUS_LABELS[tracker.status] ?? tracker.status }}
                </span>
              </div>
              <p class="text-xs text-gray-400 mt-1">
                {{ tracker.billing_months_in_scope.length }} month(s) · Resolved {{ tracker.resolved_at ? new Date(tracker.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '' }}
              </p>
            </div>
            <button
              class="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              @click="timelineTracker = tracker"
            >
              <Eye :size="12" /> Timeline
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit/Update Modal -->
    <AuditTrackerFormModal
      v-if="editTracker"
      :tracker="editTracker"
      @close="editTracker = null"
      @saved="() => { editTracker = null; load() }"
    />

    <!-- Timeline Drawer -->
    <AuditTrackerTimelineView
      v-if="timelineTracker"
      :tracker="timelineTracker"
      @close="timelineTracker = null"
      @updated="() => { timelineTracker = null; load() }"
    />

  </div>
</template>
