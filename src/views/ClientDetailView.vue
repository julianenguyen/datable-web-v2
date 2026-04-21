<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { logPhiAccess } from '@/lib/audit'
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Trash2, Plus, Pencil, X, Check, RotateCcw } from 'lucide-vue-next'
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

// Healthkit summary
const healthSummary = ref<{
  avgSleep: number | null
  avgHrv: number | null
  avgHr: number | null
} | null>(null)

// Session history
const sessionHistory = ref<Record<string, unknown>[]>([])
const expandedCycles = ref<Set<string>>(new Set())

// Pre-session reflection from patient
const presessionReflection = ref<{
  id: string
  weekSummary: string | null
  progress: string | null
  agenda: string | null
  submittedAt: string | null
} | null>(null)

// Brief generation
const generatingBrief = ref(false)

// Archive / unarchive
const clientStatus = ref<string>('active') // 'active' | 'pending' | 'archived'
const showArchiveModal = ref(false)
const archiving = ref(false)
const archiveError = ref<string | null>(null)
const unarchiving = ref(false)

// Session cycle management (kept for summaries/reflections)
const showNewCycleForm = ref(false)
const savingCycle = ref(false)
const editingCycleId = ref<string | null>(null)
const newCycle = ref({ session_date: '', next_session_date: '' })
const editCycle = ref({ session_date: '', next_session_date: '', status: 'active' })

// ── New sessions scheduling ──────────────────────────────────────────────────
interface ScheduledSession {
  id: string
  session_date: string
  session_time: string | null
  status: 'scheduled' | 'completed' | 'cancelled'
  series_id: string | null
  recurrence_rule: string | null
  notes: string | null
}

const sessions = ref<ScheduledSession[]>([])
const sessionsLoading = ref(false)
const showScheduleModal = ref(false)
const savingSession = ref(false)

// Calendar
const calendarYear = ref(new Date().getFullYear())
const calendarMonth = ref(new Date().getMonth()) // 0-indexed

// Schedule form
const scheduleForm = ref({
  date: '',
  time: '',
  recurrence: 'none' as 'none' | 'weekly' | 'biweekly' | 'monthly',
  endDate: '',
})

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

const calendarDays = computed(() => {
  const year = calendarYear.value
  const month = calendarMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
})

const sessionDateSet = computed(() => {
  const set = new Set<string>()
  for (const s of sessions.value) {
    if (s.status !== 'cancelled') set.add(s.session_date)
  }
  return set
})

function calendarDateStr(day: number) {
  const m = String(calendarMonth.value + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${calendarYear.value}-${m}-${d}`
}

function prevMonth() {
  if (calendarMonth.value === 0) { calendarYear.value--; calendarMonth.value = 11 }
  else calendarMonth.value--
}

function nextMonth() {
  if (calendarMonth.value === 11) { calendarYear.value++; calendarMonth.value = 0 }
  else calendarMonth.value++
}

function sessionsOnDay(day: number) {
  const dateStr = calendarDateStr(day)
  return sessions.value.filter(s => s.session_date === dateStr && s.status !== 'cancelled')
}

async function loadSessions() {
  sessionsLoading.value = true
  const { data } = await supabase
    .from('sessions')
    .select('id, session_date, session_time, status, series_id, recurrence_rule, notes')
    .eq('client_id', clientId)
    .order('session_date', { ascending: true })
  sessions.value = (data ?? []) as ScheduledSession[]
  sessionsLoading.value = false
}

function expandDates(startDate: string, recurrence: string, endDate: string): string[] {
  const dates: string[] = []
  const end = new Date(endDate + 'T12:00:00')
  let current = new Date(startDate + 'T12:00:00')
  const stepDays = recurrence === 'weekly' ? 7 : recurrence === 'biweekly' ? 14 : 0
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    if (stepDays > 0) {
      current = new Date(current.getTime() + stepDays * 86400000)
    } else {
      // monthly
      const next = new Date(current)
      next.setMonth(next.getMonth() + 1)
      current = next
    }
  }
  return dates
}

async function saveSchedule() {
  if (!scheduleForm.value.date) return
  savingSession.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const isRecurring = scheduleForm.value.recurrence !== 'none' && scheduleForm.value.endDate
    const seriesId = isRecurring ? crypto.randomUUID() : null

    if (isRecurring) {
      const dates = expandDates(scheduleForm.value.date, scheduleForm.value.recurrence, scheduleForm.value.endDate)
      const rows = dates.map(d => ({
        client_id: clientId,
        therapist_id: user.id,
        session_date: d,
        session_time: scheduleForm.value.time || null,
        recurrence_rule: scheduleForm.value.recurrence,
        series_id: seriesId,
      }))
      const { error } = await supabase.from('sessions').insert(rows)
      if (error) throw error
    } else {
      const { error } = await supabase.from('sessions').insert({
        client_id: clientId,
        therapist_id: user.id,
        session_date: scheduleForm.value.date,
        session_time: scheduleForm.value.time || null,
      })
      if (error) throw error
    }

    scheduleForm.value = { date: '', time: '', recurrence: 'none', endDate: '' }
    showScheduleModal.value = false
    await loadSessions()
    // navigate calendar to the scheduled month
    const d = new Date(scheduleForm.value.date || sessions.value[0]?.session_date)
    if (!isNaN(d.getTime())) {
      calendarYear.value = d.getFullYear()
      calendarMonth.value = d.getMonth()
    }
  } catch (e) {
    console.error('Save session error:', e)
  } finally {
    savingSession.value = false
  }
}

async function cancelSession(sessionId: string, wholeSeriesId: string | null) {
  const cancelAll = wholeSeriesId
    ? confirm('Cancel just this session, or all future sessions in this series?\n\nOK = cancel entire series\nCancel = cancel just this one')
    : false

  if (cancelAll && wholeSeriesId) {
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('series_id', wholeSeriesId).eq('status', 'scheduled')
  } else {
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', sessionId)
  }
  await loadSessions()
}

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

async function deleteCycle(cycleId: string) {
  if (!confirm('Delete this session cycle? This cannot be undone.')) return
  try {
    const { error } = await supabase.from('session_cycles').delete().eq('id', cycleId)
    if (error) throw error
    await loadSessionHistory()
  } catch (e) {
    console.error('Delete cycle error:', e)
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

async function confirmArchive() {
  archiving.value = true
  archiveError.value = null
  try {
    const { error } = await supabase
      .from('clients')
      .update({ status: 'archived' })
      .eq('id', clientId)
    if (error) throw error
    showArchiveModal.value = false
    router.push('/')
  } catch (e) {
    console.error('[ClientDetail] archive error:', e)
    archiveError.value = e instanceof Error ? e.message : 'Failed to archive client. Please try again.'
    archiving.value = false
  }
}

async function confirmUnarchive() {
  unarchiving.value = true
  try {
    const { error } = await supabase
      .from('clients')
      .update({ status: 'active' })
      .eq('id', clientId)
    if (error) throw error
    clientStatus.value = 'active'
  } catch (e) {
    console.error('[ClientDetail] unarchive error:', e)
  } finally {
    unarchiving.value = false
  }
}

onMounted(async () => {
  const { data: clientRow } = await supabase
    .from('clients')
    .select('name, status')
    .eq('id', clientId)
    .single()
  if (clientRow) {
    clientName.value = clientRow.name
    clientStatus.value = clientRow.status ?? 'active'
  }

  await Promise.all([loadLogs(), loadHealthSummary(), loadSessionHistory(), loadPresessionReflection(), loadSessions()])

  // Real-time: reload on logs or commitment progress changes
  realtimeChannel = supabase
    .channel(`client-detail:${clientId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs', filter: `client_id=eq.${clientId}` }, () => { loadLogs() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commitment_progress', filter: `client_id=eq.${clientId}` }, () => { loadSessionHistory() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presession_reflections', filter: `client_id=eq.${clientId}` }, () => { loadPresessionReflection() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `client_id=eq.${clientId}` }, () => { loadSessions() })
    .subscribe()
})

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})

async function loadLogs() {
  logsLoading.value = true
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(90)

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
      presession_briefs (id, content, generated_at),
      session_summaries (id, themes, strategies, commitments, watch_fors, submitted_at, commitment_progress (commitment_index, status, updated_at))
    `)
    .eq('client_id', clientId)
    .order('session_date', { ascending: false })

  sessionHistory.value = data ?? []
}

async function loadPresessionReflection() {
  // Find the most recent active cycle — avoid maybeSingle() which errors on multiple rows
  const { data: cycles } = await supabase
    .from('session_cycles')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
  const cycle = cycles?.[0]
  if (!cycle) { presessionReflection.value = null; return }
  await fetchReflectionForCycle(cycle.id)
}

async function fetchReflectionForCycle(cycleId: string) {
  const { data } = await supabase
    .from('presession_reflections')
    .select('id, week_summary, progress, agenda, submitted_at')
    .eq('cycle_id', cycleId)
    .maybeSingle()
  presessionReflection.value = data ? {
    id: data.id,
    weekSummary: data.week_summary,
    progress: data.progress,
    agenda: data.agenda,
    submittedAt: data.submitted_at,
  } : null
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
  // Append T12:00:00 for date-only strings (YYYY-MM-DD) to avoid UTC midnight
  // shifting the date back one day in timezones behind UTC
  const d = new Date(dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function sleepHours(minutes: number | null) {
  if (!minutes) return '—'
  return `${(minutes / 60).toFixed(1)} hrs`
}

const activeCycle = computed(() =>
  sessionHistory.value.find((c: Record<string, unknown>) => c.status === 'active') as Record<string, unknown> | undefined
)

// ── Wheel of Life frequency ──
const wheelFrequency = computed(() => {
  const counts: Record<string, number> = {}
  for (const log of logs.value) {
    const entries = log.wheel_of_life_entries as Array<{ category: string }> | null
    if (!entries) continue
    for (const entry of entries) {
      if (entry.category) counts[entry.category] = (counts[entry.category] ?? 0) + 1
    }
  }
  console.log('[WheelFreq] counts:', counts)
  const result = Object.entries(WHEEL_OF_LIFE)
    .map(([key, val]) => ({ key, label: val.label, count: counts[key] ?? 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
  console.log('[WheelFreq] result:', result)
  return result
})
const wheelMax = computed(() => Math.max(...wheelFrequency.value.map(c => c.count), 1))

// ── Mood / Energy chart ──
const hoveredLogIndex = ref<number | null>(null)

const chartLogs = computed(() =>
  [...logs.value]
    .filter(l => (l.mood_score as number | null) != null || (l.energy_score as number | null) != null)
    .sort((a, b) => (a.log_date as string).localeCompare(b.log_date as string))
)

const CHART = { W: 728, H: 160, PL: 44, PT: 16, PB: 36, PR: 16 }

function chartX(i: number): number {
  const n = chartLogs.value.length
  if (n <= 1) return CHART.PL + CHART.W / 2
  return CHART.PL + (i / (n - 1)) * CHART.W
}

function chartY(score: number): number {
  return CHART.PT + (1 - score / 10) * CHART.H
}

function buildPath(key: 'mood_score' | 'energy_score'): string {
  const pts = chartLogs.value
    .map((l, i) => {
      const s = l[key] as number | null
      return s != null ? `${chartX(i)},${chartY(s)}` : null
    })
    .filter(Boolean) as string[]
  if (pts.length === 0) return ''
  return 'M ' + pts.join(' L ')
}

function xLabelStep(): number {
  const n = chartLogs.value.length
  if (n <= 7) return 1
  if (n <= 14) return 2
  if (n <= 21) return 3
  return Math.ceil(n / 7)
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const totalSVGWidth = computed(() => CHART.PL + CHART.W + CHART.PR)
const totalSVGHeight = computed(() => CHART.PT + CHART.H + CHART.PB)
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
            @click="router.push({ name: 'session-summary', params: { clientId }, query: activeCycle ? { cycleId: activeCycle.id as string } : {} })"
            class="text-sm font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-4 py-2 rounded-lg transition-colors"
          >
            New Session Summary
          </button>
        </div>
      </div>

      <!-- Archive client modal -->
      <Teleport to="body">
        <div v-if="showArchiveModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" @click="!archiving && (showArchiveModal = false)" />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">

            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Trash2 class="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <h2 class="text-base font-semibold text-gray-900">Archive {{ clientName }}?</h2>
                <p class="text-xs text-gray-400 mt-0.5">This disconnects the relationship — nothing is deleted</p>
              </div>
            </div>

            <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 space-y-1.5">
              <li class="flex items-start gap-2 text-xs text-gray-500 list-none">
                <span class="text-green-500 shrink-0">✓</span>
                <span><span class="font-medium text-gray-700">{{ clientName }} keeps full app access</span> — all their data stays intact.</span>
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-500 list-none">
                <span class="text-green-500 shrink-0">✓</span>
                <span>They can continue using Datable independently.</span>
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-500 list-none">
                <span class="text-gray-400 shrink-0">–</span>
                <span>You'll stop seeing their new activity.</span>
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-500 list-none">
                <span class="text-gray-400 shrink-0">–</span>
                <span>They'll stop receiving check-ins from you.</span>
              </li>
              <li class="flex items-start gap-2 text-xs text-gray-500 list-none">
                <span class="text-teal-500 shrink-0">↩</span>
                <span>Reversible at any time from your roster.</span>
              </li>
            </div>

            <p v-if="archiveError" class="text-xs text-red-500 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {{ archiveError }}
            </p>

            <div class="flex gap-3">
              <button
                @click="showArchiveModal = false; archiveError = null"
                :disabled="archiving"
                class="flex-1 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                @click="confirmArchive"
                :disabled="archiving"
                class="flex-1 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-60 py-2.5 rounded-xl transition-colors"
              >
                {{ archiving ? 'Archiving…' : 'Archive Client' }}
              </button>
            </div>

          </div>
        </div>
      </Teleport>

      <!-- Tabs -->
      <div class="flex gap-0 border-b border-gray-200 mb-6">
        <button
          v-for="tab in [{ key: 'overview', label: 'Overview' }, { key: 'logs', label: 'Logged Entries' }, { key: 'history', label: 'Session History' }]"
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

        <!-- Pre-Session Brief from patient -->
        <div v-if="presessionReflection" class="bg-teal-50 border border-teal-200 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-sm font-semibold text-teal-900">Pre-Session Reflection</h2>
              <p class="text-xs text-teal-600 mt-0.5">
                Submitted by patient{{ presessionReflection.submittedAt ? ` · ${formatDate(presessionReflection.submittedAt)}` : '' }}
              </p>
            </div>
            <span class="text-xs bg-teal-100 text-teal-700 font-medium px-2.5 py-1 rounded-full">New</span>
          </div>
          <div class="space-y-3">
            <div v-if="presessionReflection.weekSummary">
              <p class="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">This past week</p>
              <p class="text-sm text-gray-800">{{ presessionReflection.weekSummary }}</p>
            </div>
            <div v-if="presessionReflection.progress">
              <p class="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">Progress on commitments</p>
              <p class="text-sm text-gray-800">{{ presessionReflection.progress }}</p>
            </div>
            <div v-if="presessionReflection.agenda">
              <p class="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">What they want to focus on</p>
              <p class="text-sm text-gray-800">{{ presessionReflection.agenda }}</p>
            </div>
          </div>
        </div>

        <!-- Focus Areas -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-gray-900 mb-4">Focus Areas</h2>
          <p v-if="logsLoading" class="text-xs text-gray-400">Loading…</p>
          <p v-else-if="wheelFrequency.length === 0" class="text-xs text-gray-400">No categories tagged yet.</p>
          <div v-else class="space-y-2.5">
            <div v-for="item in wheelFrequency" :key="item.key" class="flex items-center gap-3">
              <span class="text-xs text-gray-500 w-40 shrink-0 truncate">{{ item.label }}</span>
              <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  class="h-2 bg-teal-500 rounded-full transition-all duration-500"
                  :style="{ width: `${(item.count / wheelMax) * 100}%` }"
                />
              </div>
              <span class="text-xs font-medium text-gray-400 w-5 text-right shrink-0">{{ item.count }}</span>
            </div>
          </div>
        </div>

        <!-- Mood & Energy Trends -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-gray-900">Mood & Energy Trends</h2>
            <div class="flex items-center gap-4 text-xs text-gray-500">
              <span class="flex items-center gap-1.5">
                <span class="inline-block w-3 h-0.5 rounded" style="background:#16796F" />
                Mood
              </span>
              <span class="flex items-center gap-1.5">
                <span class="inline-block w-3 h-0.5 rounded" style="background:#2DD4BF" />
                Energy
              </span>
            </div>
          </div>
          <div v-if="logsLoading" class="text-xs text-gray-400 py-4 text-center">Loading…</div>
          <div v-else-if="logs.length === 0" class="text-xs text-gray-400">No log entries yet.</div>
          <svg
            v-else
            :viewBox="`0 0 ${totalSVGWidth} ${totalSVGHeight}`"
            class="w-full"
            :style="`height: ${totalSVGHeight}px`"
            @mouseleave="hoveredLogIndex = null"
          >
            <!-- Gridlines & Y-axis labels -->
            <g v-for="tick in [0, 2, 4, 6, 8, 10]" :key="tick">
              <line
                :x1="CHART.PL" :y1="chartY(tick)"
                :x2="CHART.PL + CHART.W" :y2="chartY(tick)"
                stroke="#f3f4f6" stroke-width="1"
              />
              <text
                :x="CHART.PL - 8" :y="chartY(tick) + 4"
                text-anchor="end" font-size="10" fill="#9ca3af"
              >{{ tick }}</text>
            </g>
            <!-- Energy line -->
            <path
              v-if="buildPath('energy_score')"
              :d="buildPath('energy_score')"
              fill="none" stroke="#2DD4BF" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"
            />
            <!-- Mood line -->
            <path
              v-if="buildPath('mood_score')"
              :d="buildPath('mood_score')"
              fill="none" stroke="#16796F" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"
            />
            <!-- Data points + hover targets -->
            <g
              v-for="(log, i) in chartLogs"
              :key="log.id as string"
              @mouseenter="hoveredLogIndex = i"
            >
              <rect :x="chartX(i) - 16" :y="CHART.PT" width="32" :height="CHART.H" fill="transparent" />
              <line
                v-if="hoveredLogIndex === i"
                :x1="chartX(i)" :y1="CHART.PT"
                :x2="chartX(i)" :y2="CHART.PT + CHART.H"
                stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3 3"
              />
              <circle
                v-if="(log.mood_score as number | null) != null"
                :cx="chartX(i)" :cy="chartY(log.mood_score as number)"
                :r="hoveredLogIndex === i ? 5 : 3"
                fill="#16796F" stroke="white" stroke-width="1.5"
              />
              <circle
                v-if="(log.energy_score as number | null) != null"
                :cx="chartX(i)" :cy="chartY(log.energy_score as number)"
                :r="hoveredLogIndex === i ? 5 : 3"
                fill="#2DD4BF" stroke="white" stroke-width="1.5"
              />
              <g v-if="hoveredLogIndex === i">
                <rect
                  :x="Math.min(chartX(i) - 36, CHART.PL + CHART.W - 80)"
                  :y="CHART.PT - 2"
                  width="80" height="48" rx="6" fill="#1f2937"
                />
                <text
                  :x="Math.min(chartX(i) - 36, CHART.PL + CHART.W - 80) + 40"
                  :y="CHART.PT + 12"
                  text-anchor="middle" font-size="9" fill="#9ca3af"
                >{{ formatShortDate(log.log_date as string) }}</text>
                <text
                  v-if="(log.mood_score as number | null) != null"
                  :x="Math.min(chartX(i) - 36, CHART.PL + CHART.W - 80) + 40"
                  :y="CHART.PT + 26"
                  text-anchor="middle" font-size="10" fill="#5eead4"
                >Mood {{ log.mood_score }}</text>
                <text
                  v-if="(log.energy_score as number | null) != null"
                  :x="Math.min(chartX(i) - 36, CHART.PL + CHART.W - 80) + 40"
                  :y="CHART.PT + 40"
                  text-anchor="middle" font-size="10" fill="#2DD4BF"
                >Energy {{ log.energy_score }}</text>
              </g>
            </g>
            <!-- X-axis labels -->
            <g v-for="(log, i) in chartLogs" :key="`xl-${i}`">
              <text
                v-if="i % xLabelStep() === 0"
                :x="chartX(i)" :y="CHART.PT + CHART.H + 20"
                text-anchor="middle" font-size="9" fill="#9ca3af"
              >{{ formatShortDate(log.log_date as string) }}</text>
            </g>
          </svg>
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

        <!-- ── ARCHIVE / RESTORE ZONE ── -->
        <div class="border rounded-xl overflow-hidden" :class="clientStatus === 'archived' ? 'border-teal-200' : 'border-gray-200'">
          <div class="px-5 py-3 border-b" :class="clientStatus === 'archived' ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'">
            <h2 class="text-sm font-semibold" :class="clientStatus === 'archived' ? 'text-teal-700' : 'text-gray-600'">
              {{ clientStatus === 'archived' ? 'Archived Client' : 'Archive' }}
            </h2>
          </div>

          <!-- Archived state -->
          <div v-if="clientStatus === 'archived'" class="px-5 py-4 bg-white flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">This client is archived</p>
              <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">
                They still have full access to their Datable app and all historical data. You're just disconnected — no new activity will appear here. Restore to resume the relationship.
              </p>
            </div>
            <button
              @click="confirmUnarchive"
              :disabled="unarchiving"
              class="shrink-0 flex items-center gap-1.5 text-sm font-medium text-teal-700 border border-teal-300 hover:bg-teal-50 disabled:opacity-60 px-4 py-2 rounded-lg transition-colors"
            >
              <span v-if="unarchiving" class="w-3.5 h-3.5 border-2 border-teal-400/40 border-t-teal-600 rounded-full animate-spin" />
              <RotateCcw v-else class="w-3.5 h-3.5" />
              {{ unarchiving ? 'Restoring…' : 'Restore to Active' }}
            </button>
          </div>

          <!-- Active state -->
          <div v-else class="px-5 py-4 bg-white flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">Archive this client</p>
              <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Disconnects the provider relationship — {{ clientName }} keeps their app access and all data, but you'll stop receiving their activity and they'll stop receiving check-ins from you. Reversible at any time.
              </p>
            </div>
            <button
              @click="showArchiveModal = true; archiveError = null"
              class="shrink-0 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
            >
              Archive Client
            </button>
          </div>
        </div>

      </div>

      <!-- ── TAB 2: LOGGED ENTRIES ── -->
      <div v-else-if="activeTab === 'logs'">
        <div v-if="logsLoading" class="text-sm text-gray-400 py-8 text-center">Loading entries…</div>
        <div v-else-if="logs.length === 0" class="text-sm text-gray-400 py-8 text-center">No log entries yet.</div>
        <div v-else class="space-y-4">

          <!-- Log entry list -->
          <div class="space-y-2">
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
          </div><!-- end log entry list -->
        </div><!-- end space-y-4 -->
      </div>

      <!-- ── TAB 3: SESSION HISTORY ── -->
      <div v-else-if="activeTab === 'history'" class="space-y-6">

        <!-- ── Calendar + Upcoming side by side ── -->
        <div class="flex items-start gap-5">

          <!-- Calendar (compact, fixed width) -->
          <div class="shrink-0 w-72 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <!-- Calendar header -->
            <div class="flex items-center justify-between px-3 py-3 border-b border-gray-100">
              <div class="flex items-center gap-1.5">
                <button @click="prevMonth" class="p-1 hover:bg-gray-100 rounded-md transition-colors">
                  <svg class="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <h2 class="text-xs font-semibold text-gray-900 w-28 text-center">{{ MONTH_NAMES[calendarMonth] }} {{ calendarYear }}</h2>
                <button @click="nextMonth" class="p-1 hover:bg-gray-100 rounded-md transition-colors">
                  <svg class="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
              <button
                @click="showScheduleModal = true"
                class="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus class="w-3 h-3" />
                Schedule
              </button>
            </div>

            <!-- Day-of-week headers -->
            <div class="grid grid-cols-7 border-b border-gray-100">
              <div v-for="d in ['S','M','T','W','T','F','S']" :key="d"
                class="py-1.5 text-center text-xs font-medium text-gray-400">{{ d }}</div>
            </div>

            <!-- Calendar grid -->
            <div class="grid grid-cols-7">
              <div
                v-for="(day, i) in calendarDays"
                :key="i"
                class="min-h-10 border-b border-r border-gray-50 p-1 last:border-r-0"
                :class="{ 'bg-gray-50/50': !day }"
              >
                <template v-if="day">
                  <span
                    class="text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full"
                    :class="calendarDateStr(day) === new Date().toISOString().split('T')[0]
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-700'"
                  >{{ day }}</span>
                  <!-- Session dot -->
                  <div v-if="sessionsOnDay(day).length > 0" class="mt-0.5">
                    <div
                      v-for="s in sessionsOnDay(day)"
                      :key="s.id"
                      class="group relative flex items-center gap-0.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-1 py-0.5 cursor-default transition-colors"
                    >
                      <span class="w-1 h-1 rounded-full bg-teal-500 shrink-0"></span>
                      <span class="text-[10px] text-teal-700 truncate leading-none">
                        {{ s.session_time ? s.session_time.slice(0,5) : '·' }}
                      </span>
                      <button
                        @click.stop="cancelSession(s.id, s.series_id)"
                        class="ml-auto opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all text-[10px] leading-none"
                        title="Cancel"
                      >✕</button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Upcoming sessions (fills remaining space) -->
          <div class="flex-1 min-w-0">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upcoming Sessions</h3>
            <div v-if="sessionsLoading" class="text-sm text-gray-400 py-4 text-center">Loading…</div>
            <div v-else-if="sessions.filter(s => s.session_date >= new Date().toISOString().split('T')[0] && s.status === 'scheduled').length === 0"
              class="text-sm text-gray-400 py-8 text-center">No upcoming sessions scheduled.</div>
            <div v-else class="space-y-2">
              <div
                v-for="s in sessions.filter(s => s.session_date >= new Date().toISOString().split('T')[0] && s.status === 'scheduled').slice(0, 8)"
                :key="s.id"
                class="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">{{ formatDate(s.session_date) }}</p>
                    <p class="text-xs text-gray-400">
                      {{ s.session_time ? s.session_time.slice(0,5) : 'No time set' }}
                      <span v-if="s.recurrence_rule" class="ml-2 capitalize">· {{ s.recurrence_rule }}</span>
                    </p>
                  </div>
                </div>
                <button
                  @click="cancelSession(s.id, s.series_id)"
                  class="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded"
                >Cancel</button>
              </div>
            </div>
          </div>

        </div>

        <!-- ── Post-session summaries ── -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Session Notes</h3>
          <div v-if="sessionHistory.length === 0" class="text-sm text-gray-400 py-4 text-center">
            No session notes yet. Submit a post-session summary after a session.
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="cycle in sessionHistory"
              :key="cycle.id as string"
              class="bg-white border rounded-xl overflow-hidden"
              :class="(cycle.session_summaries as unknown[])?.length > 0 ? 'border-gray-200' : 'border-gray-100'"
            >
              <template v-if="(cycle.session_summaries as unknown[])?.length > 0">
                <button
                  class="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors text-left"
                  @click="toggleCycle(cycle.id as string)"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="text-sm font-medium text-gray-900 shrink-0">
                      {{ cycle.session_date ? formatDate(cycle.session_date as string) : 'No date' }}
                    </span>
                    <span class="shrink-0 inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">📝 Summary</span>
                    <template v-if="((cycle.session_summaries as Record<string, unknown>[])[0]).commitments as string[] | undefined">
                      <span
                        class="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                        :class="(((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.some((p: Record<string, unknown>) => p.status === 'completed') ? 'bg-green-50 text-green-700' : (((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.some((p: Record<string, unknown>) => p.status === 'in_progress') ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'"
                      >
                        ✓ {{ (((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.filter((p: Record<string, unknown>) => p.status === 'completed').length ?? 0 }}/{{ (((cycle.session_summaries as Record<string, unknown>[])[0]).commitments as string[]).length }} done
                      </span>
                    </template>
                    <span v-if="((cycle.session_summaries as Record<string, unknown>[])[0]).watch_fors" class="shrink-0 inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">👁 Watch-fors</span>
                  </div>
                  <ChevronDown v-if="!expandedCycles.has(cycle.id as string)" class="w-4 h-4 text-gray-400 shrink-0" />
                  <ChevronUp v-else class="w-4 h-4 text-gray-400 shrink-0" />
                </button>

                <div v-if="expandedCycles.has(cycle.id as string)" class="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
                  <div><p class="text-xs text-gray-400 mb-1">What was discussed</p><p class="text-sm text-gray-800 leading-relaxed">{{ ((cycle.session_summaries as Record<string, unknown>[])[0]).themes }}</p></div>
                  <div><p class="text-xs text-gray-400 mb-1">Strategies & tools</p><p class="text-sm text-gray-800 leading-relaxed">{{ ((cycle.session_summaries as Record<string, unknown>[])[0]).strategies }}</p></div>
                  <div v-if="((cycle.session_summaries as Record<string, unknown>[])[0]).commitments">
                    <p class="text-xs text-gray-400 mb-2">Client commitments</p>
                    <ul class="space-y-2">
                      <li v-for="(c, i) in ((cycle.session_summaries as Record<string, unknown>[])[0]).commitments as string[]" :key="i" class="flex items-start gap-2.5">
                        <span class="shrink-0 inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap"
                          :class="{
                            'bg-green-50 text-green-700': (((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.find((p: Record<string, unknown>) => p.commitment_index === i)?.status === 'completed',
                            'bg-amber-50 text-amber-700': (((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.find((p: Record<string, unknown>) => p.commitment_index === i)?.status === 'in_progress',
                            'bg-gray-100 text-gray-500': !(((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.find((p: Record<string, unknown>) => p.commitment_index === i),
                          }">
                          {{ (((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.find((p: Record<string, unknown>) => p.commitment_index === i)?.status === 'completed' ? '✓ Done' : (((cycle.session_summaries as Record<string, unknown>[])[0]).commitment_progress as Record<string, unknown>[])?.find((p: Record<string, unknown>) => p.commitment_index === i)?.status === 'in_progress' ? '⏳ In progress' : '— Not started' }}
                        </span>
                        <span class="text-sm text-gray-800 leading-relaxed">{{ c }}</span>
                      </li>
                    </ul>
                  </div>
                  <div v-if="((cycle.session_summaries as Record<string, unknown>[])[0]).watch_fors"><p class="text-xs text-gray-400 mb-1">Watch-fors</p><p class="text-sm text-gray-800 leading-relaxed">{{ ((cycle.session_summaries as Record<string, unknown>[])[0]).watch_fors }}</p></div>
                  <div class="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <button @click="deleteCycle(cycle.id as string)" class="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors">
                      <Trash2 class="w-3 h-3" />Delete
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

      </div>

      <!-- ── Schedule Session Modal ── -->
      <Teleport to="body">
        <div v-if="showScheduleModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="showScheduleModal = false">
          <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-base font-semibold text-gray-900">Schedule Session</h2>
              <button @click="showScheduleModal = false" class="text-gray-400 hover:text-gray-600"><X class="w-5 h-5" /></button>
            </div>

            <!-- Patient pill -->
            <div class="flex items-center gap-2.5 bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-2.5 mb-5">
              <div class="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
                <span class="text-white text-xs font-bold">{{ clientName.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-teal-900 truncate">{{ clientName }}</p>
                <p class="text-xs text-teal-600">Session will appear on their app immediately</p>
              </div>
              <svg class="w-4 h-4 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            </div>

            <div class="space-y-4">
              <!-- Date -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">Date <span class="text-red-500">*</span></label>
                <input v-model="scheduleForm.date" type="date" class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>

              <!-- Time (optional) -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">Time <span class="text-xs font-normal text-gray-400">(optional)</span></label>
                <input v-model="scheduleForm.time" type="time" class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>

              <!-- Recurrence -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">Repeat</label>
                <div class="grid grid-cols-4 gap-2">
                  <button
                    v-for="opt in [{ value: 'none', label: 'Once' }, { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Bi-weekly' }, { value: 'monthly', label: 'Monthly' }]"
                    :key="opt.value"
                    @click="scheduleForm.recurrence = opt.value as 'none' | 'weekly' | 'biweekly' | 'monthly'"
                    class="py-2 text-xs font-medium rounded-xl border transition-colors"
                    :class="scheduleForm.recurrence === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'text-gray-600 border-gray-200 hover:border-teal-300'"
                  >{{ opt.label }}</button>
                </div>
              </div>

              <!-- End date for recurring -->
              <div v-if="scheduleForm.recurrence !== 'none'">
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">Repeat until <span class="text-red-500">*</span></label>
                <input v-model="scheduleForm.endDate" type="date" :min="scheduleForm.date" class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <p v-if="scheduleForm.date && scheduleForm.endDate" class="text-xs text-gray-400 mt-1">
                  Creates {{ expandDates(scheduleForm.date, scheduleForm.recurrence, scheduleForm.endDate).length }} sessions
                </p>
              </div>
            </div>

            <div class="flex gap-2 mt-6">
              <button
                @click="saveSchedule"
                :disabled="savingSession || !scheduleForm.date || (scheduleForm.recurrence !== 'none' && !scheduleForm.endDate)"
                class="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                <span v-if="savingSession" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {{ savingSession ? 'Saving…' : 'Schedule' }}
              </button>
              <button @click="showScheduleModal = false" class="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </AppLayout>
</template>
