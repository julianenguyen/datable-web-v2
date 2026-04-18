<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { logPhiAccess } from '@/lib/audit'
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Trash2, Plus, Pencil, X, Check } from 'lucide-vue-next'
import { WHEEL_OF_LIFE } from '@/data/wheelOfLife'

const router = useRouter()
const route = useRoute()
const clientId = route.params.clientId as string
const clientName = ref<string>('Client')

const activeTab = ref<'overview' | 'logs' | 'history'>('overview')

// Daily logs
const logs = ref<Record<string, unknown>[]>([])
const expandedLogs = ref<Set<string>>(new Set())
const logsLoading = ref(false)

// Check-in items for current cycle
const checkinItems = ref<Record<string, unknown>[]>([])

// Healthkit summary
const healthSummary = ref<{
  avgSleep: number | null
  avgHrv: number | null
  avgHr: number | null
} | null>(null)

// Session history
const sessionHistory = ref<Record<string, unknown>[]>([])
const expandedCycles = ref<Set<string>>(new Set())

// Brief generation
const generatingBrief = ref(false)

// Delete client
const showDeleteConfirm = ref(false)
const deleting = ref(false)

// Session cycle management
const showNewCycleForm = ref(false)
const savingCycle = ref(false)
const editingCycleId = ref<string | null>(null)
const newCycle = ref({ session_date: '', next_session_date: '' })
const editCycle = ref({ session_date: '', next_session_date: '', status: 'active' })

function startEdit(cycle: Record<string, unknown>) {
  editingCycleId.value = cycle.id as string
  editCycle.value = {
    session_date: (cycle.session_date as string) ?? '',
    next_session_date: (cycle.next_session_date as string) ?? '',
    status: (cycle.status as string) ?? 'active',
  }
}

function cancelEdit() {
  editingCycleId.value = null
}

async function createCycle() {
  savingCycle.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { error } = await supabase.from('session_cycles').insert({
      client_id: clientId,
      therapist_id: user.id,
      session_date: newCycle.value.session_date || null,
      next_session_date: newCycle.value.next_session_date || null,
      status: 'active',
    })
    if (error) throw error
    newCycle.value = { session_date: '', next_session_date: '' }
    showNewCycleForm.value = false
    await loadSessionHistory()
  } catch (e) {
    console.error('Create cycle error:', e)
  } finally {
    savingCycle.value = false
  }
}

async function saveCycleEdit(cycleId: string) {
  savingCycle.value = true
  try {
    const { error } = await supabase
      .from('session_cycles')
      .update({
        session_date: editCycle.value.session_date || null,
        next_session_date: editCycle.value.next_session_date || null,
        status: editCycle.value.status,
      })
      .eq('id', cycleId)
    if (error) throw error
    editingCycleId.value = null
    await loadSessionHistory()
  } catch (e) {
    console.error('Update cycle error:', e)
  } finally {
    savingCycle.value = false
  }
}

async function deleteClient() {
  deleting.value = true
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
    if (error) throw error
    router.push('/')
  } catch (e) {
    console.error('Delete error:', e)
    deleting.value = false
    showDeleteConfirm.value = false
  }
}

onMounted(async () => {
  const { data: clientRow } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()
  if (clientRow) clientName.value = clientRow.name

  await Promise.all([loadLogs(), loadHealthSummary(), loadSessionHistory()])
})

async function loadLogs() {
  logsLoading.value = true
  const { data } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(30)

  logs.value = data ?? []
  logPhiAccess(clientId, 'daily_log', 'read')
  logsLoading.value = false
}

async function loadHealthSummary() {
  const { data } = await supabase
    .from('healthkit_snapshots')
    .select('sleep_duration_minutes, hrv_ms, resting_heart_rate')
    .eq('client_id', clientId)
    .order('snapshot_date', { ascending: false })
    .limit(7)

  if (data && data.length > 0) {
    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v !== null)
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
    }
    healthSummary.value = {
      avgSleep: avg(data.map(d => d.sleep_duration_minutes)),
      avgHrv: avg(data.map(d => d.hrv_ms)),
      avgHr: avg(data.map(d => d.resting_heart_rate)),
    }
    logPhiAccess(clientId, 'healthkit_snapshot', 'read')
  }
}

async function loadSessionHistory() {
  const { data } = await supabase
    .from('session_cycles')
    .select(`
      id, session_date, next_session_date, status,
      checkin_lists (id, status, sent_at),
      presession_briefs (id, content, generated_at)
    `)
    .eq('client_id', clientId)
    .order('session_date', { ascending: false })

  sessionHistory.value = data ?? []
}

async function generateBrief(cycleId: string) {
  generatingBrief.value = true
  try {
    const { data } = await supabase.functions.invoke('generate-presession-brief', {
      body: { clientId, cycleId },
    })
    router.push({
      name: 'presession-brief',
      params: { clientId },
      query: { briefId: data.briefId },
    })
  } catch {
    // handle error
  } finally {
    generatingBrief.value = false
  }
}

function toggleLog(logId: string) {
  if (expandedLogs.value.has(logId)) {
    expandedLogs.value.delete(logId)
  } else {
    expandedLogs.value.add(logId)
  }
}

function toggleCycle(cycleId: string) {
  if (expandedCycles.value.has(cycleId)) {
    expandedCycles.value.delete(cycleId)
  } else {
    expandedCycles.value.add(cycleId)
  }
}

function moodColor(score: number) {
  if (score >= 7) return 'text-green-600'
  if (score >= 4) return 'text-amber-600'
  return 'text-red-500'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function sleepHours(minutes: number | null) {
  if (!minutes) return '—'
  return `${(minutes / 60).toFixed(1)} hrs`
}

const activeCycle = computed(() =>
  sessionHistory.value.find((c: Record<string, unknown>) => c.status === 'active') as Record<string, unknown> | undefined
)
</script>

<template>
  <AppLayout>
    <div class="flex-1 p-8">
      <!-- Back -->
      <button
        @click="router.push('/')"
        class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Back to roster
      </button>

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-xl font-semibold text-gray-900">{{ clientName }}</h1>
          <p class="text-sm text-gray-500 mt-0.5">Client detail</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="showDeleteConfirm = true"
            class="flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Trash2 class="w-4 h-4" />
            Remove Client
          </button>
          <button
            @click="router.push({ name: 'session-summary', params: { clientId } })"
            class="text-sm font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-4 py-2 rounded-lg transition-colors"
          >
            New Session Summary
          </button>
        </div>
      </div>

      <!-- Delete confirmation modal -->
      <Teleport to="body">
        <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" @click="showDeleteConfirm = false" />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 class="text-base font-semibold text-gray-900 mb-2">Remove {{ clientName }}?</h2>
            <p class="text-sm text-gray-500 mb-6">
              This will permanently delete their account and all associated data — logs, check-ins, session history, and health data. This cannot be undone.
            </p>
            <div class="flex gap-3">
              <button
                @click="showDeleteConfirm = false"
                class="flex-1 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                @click="deleteClient"
                :disabled="deleting"
                class="flex-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 py-2.5 rounded-xl transition-colors"
              >
                {{ deleting ? 'Removing…' : 'Yes, Remove' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Tabs -->
      <div class="flex gap-0 border-b border-gray-200 mb-6">
        <button
          v-for="tab in [{ key: 'overview', label: 'Overview' }, { key: 'logs', label: 'Log Entries' }, { key: 'history', label: 'Session History' }]"
          :key="tab.key"
          @click="activeTab = tab.key as 'overview' | 'logs' | 'history'"
          class="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
          :class="activeTab === tab.key
            ? 'border-teal-600 text-teal-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- ── TAB 1: OVERVIEW ── -->
      <div v-if="activeTab === 'overview'" class="space-y-6">

        <!-- Check-in completion -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-gray-900 mb-4">Check-In List — Current Cycle</h2>
          <div v-if="checkinItems.length === 0" class="text-sm text-gray-400">
            No active check-in list. Start a new session summary to generate one.
          </div>
        </div>

        <!-- Health summary -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-gray-900 mb-4">Biometrics — Last 7 Days</h2>
          <div v-if="healthSummary" class="grid grid-cols-3 gap-4">
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-teal-600">{{ sleepHours(healthSummary.avgSleep) }}</p>
              <p class="text-xs text-gray-500 mt-1">Avg Sleep</p>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-teal-600">{{ healthSummary.avgHrv?.toFixed(0) ?? '—' }}</p>
              <p class="text-xs text-gray-500 mt-1">Avg HRV (ms)</p>
            </div>
            <div class="text-center p-3 bg-gray-50 rounded-lg">
              <p class="text-2xl font-bold text-teal-600">{{ healthSummary.avgHr?.toFixed(0) ?? '—' }}</p>
              <p class="text-xs text-gray-500 mt-1">Resting HR (bpm)</p>
            </div>
          </div>
          <div v-else class="text-sm text-gray-400">No biometric data available yet.</div>
        </div>

        <!-- Generate brief -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-gray-900">Pre-Session Brief</h2>
              <p class="text-xs text-gray-500 mt-0.5">AI-generated summary to prepare for your next session</p>
            </div>
            <button
              @click="activeCycle && generateBrief(activeCycle.id as string)"
              :disabled="generatingBrief || !activeCycle"
              class="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <span v-if="generatingBrief" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <Sparkles v-else class="w-4 h-4" />
              {{ generatingBrief ? 'Generating…' : 'Generate Pre-Session Brief' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── TAB 2: LOG ENTRIES ── -->
      <div v-else-if="activeTab === 'logs'">
        <div v-if="logsLoading" class="text-sm text-gray-400 py-8 text-center">Loading entries…</div>
        <div v-else-if="logs.length === 0" class="text-sm text-gray-400 py-8 text-center">No log entries yet.</div>
        <div v-else class="space-y-2">
          <div
            v-for="log in logs"
            :key="log.id as string"
            class="bg-white border rounded-xl overflow-hidden transition-all"
            :class="(log.is_flagged as boolean) ? 'border-red-200' : 'border-gray-200'"
          >
            <!-- Collapsed header -->
            <button
              @click="toggleLog(log.id as string)"
              class="w-full flex items-center justify-between px-5 py-3.5 text-left"
            >
              <div class="flex items-center gap-4">
                <span class="text-sm font-medium text-gray-900">{{ formatDate(log.log_date as string) }}</span>
                <span class="flex items-center gap-1.5 text-sm">
                  <span class="text-gray-500 text-xs">Mood</span>
                  <span :class="moodColor(log.mood_score as number)" class="font-semibold">
                    {{ log.mood_score ?? '—' }}
                  </span>
                  <span class="text-gray-300">/</span>
                  <span class="text-gray-500 text-xs">Energy</span>
                  <span class="font-semibold text-gray-700">{{ log.energy_score ?? '—' }}</span>
                </span>
                <span v-if="log.is_flagged" class="flex items-center gap-1 text-xs text-red-500 font-medium">
                  <AlertTriangle class="w-3.5 h-3.5" />
                  Flagged
                </span>
              </div>
              <ChevronDown v-if="!expandedLogs.has(log.id as string)" class="w-4 h-4 text-gray-400" />
              <ChevronUp v-else class="w-4 h-4 text-gray-400" />
            </button>

            <!-- Expanded detail -->
            <div v-if="expandedLogs.has(log.id as string)" class="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
              <div v-if="log.went_well">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">What went well</p>
                <p class="text-sm text-gray-800">{{ log.went_well }}</p>
              </div>
              <div v-if="log.weighing_on">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">What is weighing on you</p>
                <p class="text-sm text-gray-800">{{ log.weighing_on }}</p>
              </div>

              <!-- Wheel of Life entries -->
              <div v-if="(log.wheel_of_life_entries as unknown[])?.length > 0">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Wheel of Life</p>
                <div class="space-y-2">
                  <div
                    v-for="(entry, i) in (log.wheel_of_life_entries as Record<string, unknown>[])"
                    :key="i"
                    class="bg-gray-50 rounded-lg p-3"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-xs font-semibold text-teal-700">
                        {{ WHEEL_OF_LIFE[entry.category as keyof typeof WHEEL_OF_LIFE]?.label ?? entry.category }}
                      </span>
                      <span
                        v-for="sub in (entry.subcategories as string[])"
                        :key="sub"
                        class="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-100"
                      >
                        {{ sub }}
                      </span>
                    </div>
                    <p v-if="entry.note" class="text-sm text-gray-700">{{ entry.note }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB 3: SESSION HISTORY ── -->
      <div v-else-if="activeTab === 'history'">

        <!-- Header row -->
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-sm text-gray-500">Manage session cycles and scheduled dates</p>
          </div>
          <button
            @click="showNewCycleForm = !showNewCycleForm"
            class="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Plus class="w-4 h-4" />
            Schedule Session
          </button>
        </div>

        <!-- New cycle form -->
        <div v-if="showNewCycleForm" class="bg-teal-50 border border-teal-200 rounded-xl p-5 mb-4">
          <p class="text-sm font-semibold text-teal-800 mb-4">New Session Cycle</p>
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Session date</label>
              <input
                v-model="newCycle.session_date"
                type="date"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p class="text-xs text-gray-400 mt-1">When did / will the session happen?</p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Next session date</label>
              <input
                v-model="newCycle.next_session_date"
                type="date"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p class="text-xs text-gray-400 mt-1">Shows in client's app as upcoming session</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button
              @click="createCycle"
              :disabled="savingCycle"
              class="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <span v-if="savingCycle" class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <Check v-else class="w-3.5 h-3.5" />
              {{ savingCycle ? 'Saving…' : 'Create Cycle' }}
            </button>
            <button
              @click="showNewCycleForm = false"
              class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-lg transition-colors"
            >
              <X class="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="sessionHistory.length === 0" class="text-center py-12 text-gray-400">
          <p class="text-sm font-medium mb-1">No sessions scheduled yet</p>
          <p class="text-xs">Click "Schedule Session" to create the first cycle.</p>
        </div>

        <!-- Cycle list -->
        <div v-else class="space-y-3">
          <div
            v-for="cycle in sessionHistory"
            :key="cycle.id as string"
            class="bg-white border rounded-xl overflow-hidden"
            :class="cycle.status === 'active' ? 'border-teal-200' : 'border-gray-200'"
          >
            <!-- View mode -->
            <div v-if="editingCycleId !== cycle.id" class="px-5 py-4">
              <div class="flex items-start justify-between">
                <div class="space-y-2">
                  <!-- Status badge -->
                  <span
                    class="inline-flex text-xs px-2.5 py-0.5 rounded-full font-medium"
                    :class="cycle.status === 'active'
                      ? 'bg-teal-50 text-teal-700 border border-teal-200'
                      : 'bg-gray-100 text-gray-500'"
                  >
                    {{ cycle.status === 'active' ? 'Active cycle' : 'Closed' }}
                  </span>

                  <!-- Dates -->
                  <div class="flex items-center gap-6 text-sm">
                    <div>
                      <span class="text-xs text-gray-400 block mb-0.5">Session date</span>
                      <span class="font-medium text-gray-900">
                        {{ cycle.session_date ? formatDate(cycle.session_date as string) : '—' }}
                      </span>
                    </div>
                    <div class="text-gray-300">→</div>
                    <div>
                      <span class="text-xs text-gray-400 block mb-0.5">Next session</span>
                      <span class="font-medium text-gray-900">
                        {{ cycle.next_session_date ? formatDate(cycle.next_session_date as string) : '—' }}
                      </span>
                    </div>
                  </div>

                  <!-- Pre-session brief link -->
                  <div v-if="(cycle.presession_briefs as unknown[])?.length > 0">
                    <button
                      @click="router.push({ name: 'presession-brief', params: { clientId }, query: { briefId: String(((cycle.presession_briefs as Record<string, unknown>[])[0]).id) } })"
                      class="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      View pre-session brief →
                    </button>
                  </div>
                </div>

                <!-- Edit button -->
                <button
                  @click="startEdit(cycle)"
                  class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Pencil class="w-3 h-3" />
                  Edit
                </button>
              </div>
            </div>

            <!-- Edit mode -->
            <div v-else class="px-5 py-4 bg-gray-50">
              <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Editing cycle</p>
              <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Session date</label>
                  <input
                    v-model="editCycle.session_date"
                    type="date"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Next session date</label>
                  <input
                    v-model="editCycle.next_session_date"
                    type="date"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
              </div>
              <div class="mb-4">
                <label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  v-model="editCycle.status"
                  class="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div class="flex gap-2">
                <button
                  @click="saveCycleEdit(cycle.id as string)"
                  :disabled="savingCycle"
                  class="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <span v-if="savingCycle" class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <Check v-else class="w-3.5 h-3.5" />
                  {{ savingCycle ? 'Saving…' : 'Save Changes' }}
                </button>
                <button
                  @click="cancelEdit"
                  class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-lg transition-colors"
                >
                  <X class="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
