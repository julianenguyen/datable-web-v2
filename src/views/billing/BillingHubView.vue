<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import {
  Receipt,
  Shield,
  History,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Plus,
} from 'lucide-vue-next'
import BillingMonthView from '@/views/billing/BillingMonthView.vue'
import BillingHistoryPanel from '@/components/billing/BillingHistoryPanel.vue'
import AuditTrackerPanel from '@/components/billing/AuditTrackerPanel.vue'
import AuditTrackerFormModal from '@/components/billing/AuditTrackerFormModal.vue'
import BillingSetupCard from '@/components/BillingSetupCard.vue'

const router = useRouter()

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'current' | 'history' | 'audit'
const activeTab = ref<Tab>('current')

// ── Hub Data ──────────────────────────────────────────────────────────────────

interface OpenAudit {
  id: string
  audit_reference_number: string
  auditing_entity: string
  audit_type: string
  status: string
  response_deadline: string
  billing_months_in_scope: string[]
}

interface HubData {
  currentMonth: string
  openAudits: OpenAudit[]
  recentHistory: unknown[]
}

const hubData = ref<HubData | null>(null)
const hubLoading = ref(true)

// ── Phase 2 / Billing Setup Card ──────────────────────────────────────────────

const phase2Complete = ref(true) // optimistic default — show card only when confirmed incomplete
const phase2WizardStep = ref(1)

async function loadCredentialStatus() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/status`, {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: supabaseAnonKey,
      },
    })
    if (res.ok) {
      const s = await res.json() as { phase2_complete?: boolean; current_phase2_step?: number }
      phase2Complete.value = s.phase2_complete ?? true
      phase2WizardStep.value = s.current_phase2_step ?? 1
    }
  } catch {
    // Non-fatal — card simply does not render
  }
}

async function loadHub() {
  hubLoading.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/billing-hub/hub`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      hubData.value = await res.json() as HubData
    }
  } catch (e) {
    console.error('Failed to load billing hub:', e)
  } finally {
    hubLoading.value = false
  }
}

onMounted(() => {
  loadHub()
  loadCredentialStatus()
})

// ── Computed ──────────────────────────────────────────────────────────────────

const openAudits = computed(() => hubData.value?.openAudits ?? [])
const overdueAudits = computed(() => {
  const now = new Date()
  return openAudits.value.filter(a =>
    new Date(a.response_deadline) < now &&
    !['resolved_favorable', 'resolved_unfavorable', 'closed'].includes(a.status)
  )
})

const currentMonth = computed(() => {
  const now = new Date()
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
  }
})

const currentMonthLabel = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

// ── Audit tracker modal ───────────────────────────────────────────────────────
const showCreateAuditModal = ref(false)

// ── Urgency chip styling ──────────────────────────────────────────────────────
function urgencyClass(deadline: string, status: string): string {
  if (['resolved_favorable', 'resolved_unfavorable', 'closed'].includes(status)) return 'bg-gray-100 text-gray-500'
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'bg-red-100 text-red-700'
  if (days <= 7) return 'bg-red-50 text-red-600'
  if (days <= 30) return 'bg-amber-50 text-amber-700'
  return 'bg-teal-50 text-teal-700'
}

function urgencyLabel(deadline: string, status: string): string {
  if (['resolved_favorable', 'resolved_unfavorable', 'closed'].includes(status)) return 'Resolved'
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `${days}d remaining`
}
</script>

<template>
  <AppLayout>
    <div class="px-8 py-8 max-w-6xl mx-auto">

      <!-- ── Page Header ──────────────────────────────────────────────────── -->
      <div class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Receipt class="text-teal-600" :size="24" />
            Billing Hub
          </h1>
          <p class="text-sm text-gray-500 mt-1">G0323 treatment coordination billing management</p>
        </div>

        <!-- Open audit alert badge -->
        <div
          v-if="overdueAudits.length > 0"
          class="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5"
        >
          <AlertTriangle class="text-red-500 shrink-0" :size="16" />
          <div>
            <p class="text-sm font-semibold text-red-700">{{ overdueAudits.length }} overdue audit{{ overdueAudits.length > 1 ? 's' : '' }}</p>
            <button class="text-xs text-red-500 underline" @click="activeTab = 'audit'">View audit tracker →</button>
          </div>
        </div>
        <div
          v-else-if="openAudits.length > 0"
          class="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5"
        >
          <Shield class="text-amber-500 shrink-0" :size="16" />
          <div>
            <p class="text-sm font-semibold text-amber-700">{{ openAudits.length }} open audit{{ openAudits.length > 1 ? 's' : '' }}</p>
            <button class="text-xs text-amber-600 underline" @click="activeTab = 'audit'">View audit tracker →</button>
          </div>
        </div>
      </div>

      <!-- ── Tabs ─────────────────────────────────────────────────────────── -->
      <div class="flex gap-1 mb-6 border-b border-gray-200">
        <button
          v-for="tab in ([
            { key: 'current', label: currentMonthLabel, icon: Receipt },
            { key: 'history', label: 'Billing History', icon: History },
            { key: 'audit', label: `Audit Tracker${openAudits.length ? ` (${openAudits.length})` : ''}`, icon: Shield },
          ] as const)"
          :key="tab.key"
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="activeTab === tab.key
            ? 'border-teal-600 text-teal-700'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" :size="15" />
          {{ tab.label }}
        </button>
      </div>

      <!-- ── Tab Content ───────────────────────────────────────────────────── -->

      <!-- Current Month Tab -->
      <template v-if="activeTab === 'current'">
        <!-- Billing setup card — shown when Phase 2 (billing profile) is incomplete -->
        <BillingSetupCard
          v-if="!phase2Complete"
          :wizard-step="phase2WizardStep"
        />

        <BillingMonthView
          :year="currentMonth.year"
          :month="currentMonth.month"
          :embedded="true"
        />
      </template>

      <!-- History Tab -->
      <template v-else-if="activeTab === 'history'">
        <BillingHistoryPanel />
      </template>

      <!-- Audit Tracker Tab -->
      <template v-else-if="activeTab === 'audit'">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-base font-semibold text-gray-900">Audit Tracker</h2>
            <p class="text-sm text-gray-500 mt-0.5">Track open and resolved payer audits</p>
          </div>
          <button
            class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
            @click="showCreateAuditModal = true"
          >
            <Plus :size="15" />
            New Audit
          </button>
        </div>
        <AuditTrackerPanel @create="showCreateAuditModal = true" />
      </template>

    </div>

    <!-- Audit Tracker Create Modal -->
    <AuditTrackerFormModal
      v-if="showCreateAuditModal"
      @close="showCreateAuditModal = false"
      @saved="() => { showCreateAuditModal = false; loadHub() }"
    />
  </AppLayout>
</template>
