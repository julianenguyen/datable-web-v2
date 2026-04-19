<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Clock, CheckCircle2, Plus, FileText, ChevronRight, ChevronDown, RotateCcw, Archive } from 'lucide-vue-next'

interface ClientCard {
  id: string
  name: string
  status: 'active' | 'pending'
  nextSessionDate: string | null
  lastLogDate: string | null
  daysLastLog: number | null
  logsLast7Days: number
  isFlagged: boolean
  flagReason?: string
  cycleId: string | null
}

interface ArchivedClient {
  id: string
  name: string
}

const router = useRouter()
const route = useRoute()
const search = ref('')
const clients = ref<ClientCard[]>([])
const archivedClients = ref<ArchivedClient[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const showArchived = ref(false)
const unarchivingId = ref<string | null>(null)

onMounted(loadClients)
watch(() => route.fullPath, () => {
  if (route.path === '/') loadClients()
})

async function loadClients() {
  loading.value = true
  loadError.value = null

  // Active + pending clients
  const { data: clientRows, error } = await supabase
    .from('clients')
    .select('id, name, status')
    .neq('status', 'archived')
    .order('name')

  if (error) {
    loadError.value = `Failed to load clients: ${error.message}`
    loading.value = false
    return
  }

  // Archived clients (names only for the collapsed list)
  const { data: archivedRows } = await supabase
    .from('clients')
    .select('id, name')
    .eq('status', 'archived')
    .order('name')

  archivedClients.value = archivedRows ?? []

  if (!clientRows?.length) {
    clients.value = []
    loading.value = false
    return
  }

  const clientIds = clientRows.map(c => c.id)

  const { data: cycles } = await supabase
    .from('session_cycles')
    .select('id, client_id, next_session_date')
    .in('client_id', clientIds)
    .eq('status', 'active')

  const cycleMap: Record<string, { id: string; next_session_date: string | null }> = {}
  cycles?.forEach(cy => { cycleMap[cy.client_id] = cy })

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceDate = since.toISOString().split('T')[0]

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('client_id, log_date, mood_score, is_flagged')
    .in('client_id', clientIds)
    .gte('log_date', sinceDate)
    .order('log_date', { ascending: false })

  const logsByClient: Record<string, Array<{ log_date: string; mood_score: number; is_flagged: boolean }>> = {}
  logs?.forEach(log => {
    if (!logsByClient[log.client_id]) logsByClient[log.client_id] = []
    logsByClient[log.client_id].push(log)
  })

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const weekStart = sevenDaysAgo.toISOString().split('T')[0]

  clients.value = clientRows.map(c => {
    const cycle = cycleMap[c.id] ?? null
    const clientLogs = logsByClient[c.id] ?? []
    const lastLog = clientLogs[0] ?? null

    let daysLastLog: number | null = null
    if (lastLog) {
      const diffMs = new Date(today).getTime() - new Date(lastLog.log_date).getTime()
      daysLastLog = Math.round(diffMs / 86400000)
    }

    const isFlagged =
      lastLog?.is_flagged === true ||
      (lastLog?.mood_score != null && lastLog.mood_score <= 3)

    const flagReason = isFlagged && lastLog
      ? `Mood score of ${lastLog.mood_score} — ${daysLastLog === 0 ? 'today' : daysLastLog === 1 ? 'yesterday' : `${daysLastLog} days ago`}`
      : undefined

    const logsLast7Days = clientLogs.filter(l => l.log_date >= weekStart).length

    return {
      id: c.id,
      name: c.name,
      status: c.status as 'active' | 'pending',
      nextSessionDate: cycle?.next_session_date ?? null,
      lastLogDate: lastLog?.log_date ?? null,
      daysLastLog,
      logsLast7Days,
      isFlagged,
      flagReason,
      cycleId: cycle?.id ?? null,
    }
  })

  loading.value = false
}

async function unarchiveClient(clientId: string) {
  unarchivingId.value = clientId
  try {
    const { error } = await supabase.functions.invoke('undo-remove-client', {
      body: { clientId },
    })
    if (error) throw error
    await loadClients()
  } catch (e) {
    console.error('[Dashboard] unarchive failed:', e)
  } finally {
    unarchivingId.value = null
  }
}

const activeCount = computed(() => clients.value.filter(c => c.status === 'active').length)

const sortedClients = computed(() => {
  const filtered = clients.value.filter(c =>
    c.name.toLowerCase().includes(search.value.toLowerCase())
  )
  return [...filtered].sort((a, b) => {
    if (a.isFlagged && !b.isFlagged) return -1
    if (!a.isFlagged && b.isFlagged) return 1
    if (!a.nextSessionDate) return 1
    if (!b.nextSessionDate) return -1
    return a.nextSessionDate.localeCompare(b.nextSessionDate)
  })
})

function formatSessionDate(date: string | null) {
  if (!date) return '—'
  const d = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return `In ${diff} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function completionColor(count: number) {
  if (count >= 6) return 'text-green-600'
  if (count >= 4) return 'text-amber-600'
  return 'text-red-500'
}

function lastLogLabel(days: number | null) {
  if (days === null) return 'No logs yet'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function openNewSessionSummary(clientId: string, cycleId: string | null) {
  router.push({ name: 'session-summary', params: { clientId }, query: { cycleId: cycleId ?? '' } })
}

function openClientDetail(clientId: string) {
  router.push({ name: 'client-detail', params: { clientId } })
}
</script>

<template>
  <AppLayout>
    <div class="flex-1 p-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-xl font-semibold text-gray-900">Client Roster</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ activeCount }} active client{{ activeCount !== 1 ? 's' : '' }}</p>
        </div>
        <button
          @click="router.push({ name: 'invite-client' })"
          class="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus class="w-4 h-4" />
          Invite New Client
        </button>
      </div>

      <!-- Search -->
      <div class="mb-5">
        <input
          v-model="search"
          type="text"
          placeholder="Search clients…"
          class="w-72 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      <!-- Error -->
      <div v-if="loadError" class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">
        {{ loadError }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-20 text-gray-400">
        <svg class="animate-spin w-6 h-6 mr-2 text-teal-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span class="text-sm">Loading clients…</span>
      </div>

      <!-- Active client list -->
      <div v-else class="space-y-2">
        <div
          v-for="client in sortedClients"
          :key="client.id"
          @click="openClientDetail(client.id)"
          class="bg-white border rounded-xl transition-all cursor-pointer hover:shadow-md hover:border-teal-200"
          :class="client.isFlagged ? 'border-red-200 shadow-sm' : 'border-gray-200'"
        >
          <div class="flex items-center gap-4 px-5 py-4">
            <div class="shrink-0 w-1.5 self-stretch rounded-full" :class="client.isFlagged ? 'bg-red-400' : 'bg-transparent'" />

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-semibold text-gray-900">{{ client.name }}</span>
                <span
                  v-if="client.status === 'pending'"
                  class="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                >
                  Invite pending
                </span>
                <span v-if="client.isFlagged" class="flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertTriangle class="w-3.5 h-3.5" />
                  Flagged
                </span>
              </div>
              <p v-if="client.isFlagged && client.flagReason" class="text-xs text-red-500 mb-2">
                {{ client.flagReason }}
              </p>
              <div class="flex items-center gap-5 text-xs text-gray-500">
                <div class="flex items-center gap-1.5">
                  <Clock class="w-3.5 h-3.5" />
                  <span>{{ formatSessionDate(client.nextSessionDate) }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <FileText class="w-3.5 h-3.5" />
                  <span>{{ lastLogLabel(client.daysLastLog) }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  <span :class="completionColor(client.logsLast7Days)">
                    {{ client.logsLast7Days }} of 7 days logged
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="client.status === 'active'"
                @click.stop="openNewSessionSummary(client.id, client.cycleId)"
                class="text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                New Session Summary
              </button>
              <ChevronRight class="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="sortedClients.length === 0 && !loading" class="text-center py-16 text-gray-400">
          <p class="text-sm font-medium mb-1">No clients yet</p>
          <p class="text-xs">Invite a client to get started.</p>
        </div>
      </div>

      <!-- Archived clients -->
      <div v-if="!loading && archivedClients.length > 0" class="mt-10">
        <button
          @click="showArchived = !showArchived"
          class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-3"
        >
          <Archive class="w-4 h-4" />
          <span class="font-medium">Archived clients</span>
          <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{{ archivedClients.length }}</span>
          <ChevronDown
            class="w-4 h-4 transition-transform duration-200"
            :class="showArchived ? 'rotate-180' : ''"
          />
        </button>

        <div v-if="showArchived" class="space-y-1.5">
          <div
            v-for="client in archivedClients"
            :key="client.id"
            class="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center justify-between"
          >
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-500">{{ client.name }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Archived</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="openClientDetail(client.id)"
                class="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                View history
              </button>
              <button
                @click="unarchiveClient(client.id)"
                :disabled="unarchivingId === client.id"
                class="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RotateCcw class="w-3 h-3" />
                {{ unarchivingId === client.id ? 'Restoring…' : 'Restore' }}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </AppLayout>
</template>
