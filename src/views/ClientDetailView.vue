<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { logPhiAccess } from '@/lib/audit'
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Trash2, Plus, Pencil, X, Check, RotateCcw } from 'lucide-vue-next'
import { WHEEL_OF_LIFE } from '@/data/wheelOfLife'
import PresessionBriefDrawer from '@/components/PresessionBriefDrawer.vue'
import AwardMilestoneDrawer from '@/components/AwardMilestoneDrawer.vue'
import ClientMilestonesTab from '@/components/ClientMilestonesTab.vue'
import BillingTab from '@/components/BillingTab.vue'

const router = useRouter()
const route = useRoute()
const clientId = route.params.clientId as string
const clientName = ref<string>('Client')

const activeTab = ref<'overview' | 'logs' | 'history' | 'milestones' | 'billing'>('overview')

// Insurance / billing
const insuranceStatus = ref<'insurance' | 'self_pay' | 'sliding_scale' | 'unknown'>('unknown')
const insuranceProvider = ref<string>('')
const savingInsurance = ref(false)
const isAwardDrawerOpen = ref(false)

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
const sessionHistoryError = ref<string | null>(null)
const expandedCycles = ref<Set<string>>(new Set())

// Pre-session reflection from patient
const presessionReflection = ref<{
  id: string
  weekSummary: string | null
  progress: string | null
  agenda: string | null
  sessionIntent: string | null
  submittedAt: string | null
} | null>(null)

// Brief generation
const generatingBrief = ref(false)
const briefData = ref<{ id: string; content: Record<string, unknown>; generated_at: string } | null>(null)
const briefError = ref<string | null>(null)
const drawerOpen = ref(false)

// Past session briefs (keyed by session_id)
interface PastSessionBrief {
  id: string
  content: Record<string, unknown>
  generated_at: string
  session_id: string
}
const pastSessionBriefs = ref<Record<string, PastSessionBrief>>({})

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
  await loadPastSessionBriefs()
}

async function loadPastSessionBriefs() {
  const today = new Date().toISOString().split('T')[0]
  const pastIds = sessions.value
    .filter(s => s.session_date < today && s.status !== 'cancelled')
    .map(s => s.id)
  if (pastIds.length === 0) return
  const { data } = await supabase
    .from('presession_briefs')
    .select('id, content, generated_at, session_id')
    .in('session_id', pastIds)
  const map: Record<string, PastSessionBrief> = {}
  for (const b of data ?? []) {
    if (b.session_id) map[b.session_id] = b as PastSessionBrief
  }
  pastSessionBriefs.value = map
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

    const scheduledDate = scheduleForm.value.date
    scheduleForm.value = { date: '', time: '', recurrence: 'none', endDate: '' }
    showScheduleModal.value = false
    await loadSessions()
    // navigate calendar to the scheduled month
    const d = new Date(scheduledDate || sessions.value[0]?.session_date)
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
  if (!confirm('Are you sure you want to cancel this session?')) return

  const cancelAll = wholeSeriesId
    ? confirm('Cancel all future sessions in this series too?\n\nOK = cancel entire series\nCancel = cancel just this one')
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

    // Close any existing active cycle before opening a new one
    if (activeCycle.value?.id) {
      await supabase.from('session_cycles').update({ status: 'closed' }).eq('id', activeCycle.value.id as string)
    }

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

async function saveInsurance() {
  savingInsurance.value = true
  try {
    await supabase
      .from('clients')
      .update({
        insurance_status: insuranceStatus.value,
        insurance_provider: insuranceStatus.value === 'insurance' ? insuranceProvider.value.trim() || null : null,
      })
      .eq('id', clientId)
  } catch (e) {
    console.error('[ClientDetail] insurance save error:', e)
  } finally {
    savingInsurance.value = false
  }
}

onMounted(async () => {
  const { data: clientRow } = await supabase
    .from('clients')
    .select('name, status, insurance_status, insurance_provider')
    .eq('id', clientId)
    .single()
  if (clientRow) {
    clientName.value = clientRow.name
    clientStatus.value = clientRow.status ?? 'active'
    insuranceStatus.value = (clientRow.insurance_status as typeof insuranceStatus.value) ?? 'unknown'
    insuranceProvider.value = clientRow.insurance_provider ?? ''
  }

  await Promise.all([loadLogs(), loadHealthSummary(), loadSessionHistory(), loadPresessionReflection(), loadSessions()])

  // Load brief directly from presession_briefs for the active cycle
  await loadBrief()

  // Real-time: reload on logs or commitment progress changes
  realtimeChannel = supabase
    .channel(`client-detail:${clientId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs', filter: `client_id=eq.${clientId}` }, () => { loadLogs() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commitment_progress', filter: `client_id=eq.${clientId}` }, () => { loadSessionHistory() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'session_cycles', filter: `client_id=eq.${clientId}` }, () => { loadSessionHistory() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'session_summaries' }, () => { loadSessionHistory() })
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
  // Fetch cycles
  const { data: cycles, error: cyclesError } = await supabase
    .from('session_cycles')
    .select('id, session_date, next_session_date, status, created_at, checkin_lists (id, status, sent_at), presession_briefs (id, content, generated_at), presession_reflections (id, week_summary, progress, agenda, session_intent, submitted_at)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (cyclesError) {
    console.error('[loadSessionHistory] cycles error:', cyclesError)
    sessionHistoryError.value = `Failed to load session history: ${cyclesError.message}`
    return
  }

  if (!cycles || cycles.length === 0) {
    sessionHistory.value = []
    sessionHistoryError.value = null
    return
  }

  const cycleIds = cycles.map(c => c.id)

  // Fetch summaries separately — avoids nested select join issues
  const { data: summaries, error: summariesError } = await supabase
    .from('session_summaries')
    .select('id, cycle_id, title, themes, strategies, commitments, watch_fors, wins, public_notes, notes, submitted_at, commitment_progress (commitment_index, status, helpfulness_rating, updated_at)')
    .in('cycle_id', cycleIds)
    .order('submitted_at', { ascending: false })

  if (summariesError) {
    console.error('[loadSessionHistory] summaries error:', summariesError)
    sessionHistoryError.value = `Failed to load summaries: ${summariesError.message}`
    return
  }

  sessionHistoryError.value = null

  // Group summaries by cycle_id (newest first due to ordering above)
  const summariesByCycle: Record<string, Record<string, unknown>[]> = {}
  for (const s of (summaries ?? [])) {
    const cid = s.cycle_id as string
    if (!summariesByCycle[cid]) summariesByCycle[cid] = []
    summariesByCycle[cid].push(s as Record<string, unknown>)
  }

  sessionHistory.value = cycles.map(c => ({
    ...(c as Record<string, unknown>),
    session_summaries: summariesByCycle[c.id] ?? [],
  }))
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
    .select('id, week_summary, progress, agenda, session_intent, submitted_at')
    .eq('cycle_id', cycleId)
    .maybeSingle()
  presessionReflection.value = data ? {
    id: data.id,
    weekSummary: data.week_summary,
    progress: data.progress,
    agenda: data.agenda,
    sessionIntent: data.session_intent ?? null,
    submittedAt: data.submitted_at,
  } : null
}

async function loadBrief() {
  const cycleId = activeCycle.value?.id as string | undefined
  if (!cycleId) return
  const { data } = await supabase
    .from('presession_briefs')
    .select('id, content, generated_at')
    .eq('cycle_id', cycleId)
    .maybeSingle()
  if (data) briefData.value = data as { id: string; content: Record<string, unknown>; generated_at: string }
}

async function generateBrief(cycleId: string) {
  generatingBrief.value = true
  briefError.value = null
  try {
    const today = new Date().toISOString().split('T')[0]
    const nextSession = sessions.value
      .filter(s => s.session_date >= today && s.status === 'scheduled')
      .sort((a, b) => a.session_date.localeCompare(b.session_date))[0] ?? null

    const { data, error } = await supabase.functions.invoke('generate-presession-brief', {
      body: { clientId, cycleId, sessionId: nextSession?.id ?? null },
    })
    if (error) {
      // Extract the actual error body from the edge function response
      let msg = error.message
      try {
        const body = await (error as any).context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* ignore */ }
      briefError.value = msg
      return
    }
    briefData.value = data.brief
    drawerOpen.value = true
  } catch (err) {
    console.error('Brief generation error:', err)
    briefError.value = String(err)
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

const pastSessions = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return sessions.value
    .filter(s => s.session_date < today && s.status !== 'cancelled')
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
})

// ── All summaries flattened across cycles, newest first ──
const allSummaries = computed(() => {
  const items: Array<Record<string, unknown> & { _cycleId: string; _presessionReflections: Record<string, unknown>[] }> = []
  for (const cycle of sessionHistory.value) {
    const summaries = (cycle.session_summaries as Record<string, unknown>[]) ?? []
    const reflections = (cycle.presession_reflections as Record<string, unknown>[]) ?? []
    for (const s of summaries) {
      items.push({ ...s, _cycleId: cycle.id as string, _presessionReflections: reflections })
    }
  }
  return items.sort((a, b) => new Date(b.submitted_at as string).getTime() - new Date(a.submitted_at as string).getTime())
})

// ── Wheel of Life frequency — all logs ──
const wheelFrequency = computed(() => {
  const counts: Record<string, number> = {}
  for (const log of logs.value) {
    const entries = log.wheel_of_life_entries as Array<{ category: string }> | null
    if (!entries) continue
    for (const entry of entries) {
      if (entry.category) counts[entry.category] = (counts[entry.category] ?? 0) + 1
    }
  }
  return Object.entries(WHEEL_OF_LIFE)
    .map(([key, val]) => ({ key, label: val.label, count: counts[key] ?? 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
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
            @click="isAwardDrawerOpen = true"
            class="text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
            Award Milestone
          </button>
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
          v-for="tab in [{ key: 'overview', label: 'Overview' }, { key: 'logs', label: 'Logged Entries' }, { key: 'history', label: 'Session History' }, { key: 'milestones', label: 'Milestones' }, { key: 'billing', label: 'Billing' }]"
          :key="tab.key"
          @click="activeTab = tab.key as 'overview' | 'logs' | 'history' | 'milestones' | 'billing'"
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
            <div v-if="presessionReflection.sessionIntent">
              <p class="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">Support they're looking for</p>
              <p class="text-sm text-gray-800">{{ presessionReflection.sessionIntent }}</p>
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
          <div class="flex items-start justify-between mb-1">
            <div>
              <h2 class="text-sm font-semibold text-gray-900">Mood & Energy Trends</h2>
              <p class="text-xs text-gray-400 mt-0.5">Scale 1–10 · higher is better · self-reported by patient</p>
            </div>
            <div class="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
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
          <div class="flex gap-6 text-xs text-gray-400 mb-4">
            <span><span class="text-gray-500 font-medium">Mood:</span> how the patient genuinely feels</span>
            <span><span class="text-gray-500 font-medium">Energy:</span> physical &amp; mental energy level</span>
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
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm font-semibold text-gray-900">Pre-Session Brief</h2>
              <p class="text-xs text-gray-500 mt-0.5">AI-generated summary to prepare for your next session</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="briefData"
                @click="drawerOpen = true"
                class="text-sm font-medium text-teal-600 hover:text-teal-700 px-3 py-2 rounded-lg hover:bg-teal-50 transition-colors"
              >
                View Brief
              </button>
              <button
                @click="activeCycle && generateBrief(activeCycle.id as string)"
                :disabled="generatingBrief || !activeCycle"
                class="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <span v-if="generatingBrief" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <RotateCcw v-else-if="briefData" class="w-4 h-4" />
                <Sparkles v-else class="w-4 h-4" />
                {{ generatingBrief ? 'Generating…' : briefData ? 'Regenerate Brief' : 'Generate Pre-Session Brief' }}
              </button>
            </div>
          </div>
          <p v-if="briefError" class="text-xs text-red-500 mt-2">{{ briefError }}</p>
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
                <!-- Wheel of life tags for went_well -->
                <div
                  v-if="(log.wheel_of_life_entries as Record<string, unknown>[])?.filter((e: Record<string, unknown>) => e.question_type === 'went_well').length > 0"
                  class="flex flex-wrap gap-1.5 mt-2"
                >
                  <span
                    v-for="(entry, i) in (log.wheel_of_life_entries as Record<string, unknown>[]).filter((e: Record<string, unknown>) => e.question_type === 'went_well')"
                    :key="i"
                    class="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100"
                  >
                    {{ WHEEL_OF_LIFE[entry.category as keyof typeof WHEEL_OF_LIFE]?.label ?? entry.category }}
                  </span>
                </div>
              </div>
              <div v-if="log.weighing_on">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">What is weighing on you</p>
                <p class="text-sm text-gray-800">{{ log.weighing_on }}</p>
                <!-- Wheel of life tags for weighing_on -->
                <div
                  v-if="(log.wheel_of_life_entries as Record<string, unknown>[])?.filter((e: Record<string, unknown>) => e.question_type === 'weighing_on').length > 0"
                  class="flex flex-wrap gap-1.5 mt-2"
                >
                  <span
                    v-for="(entry, i) in (log.wheel_of_life_entries as Record<string, unknown>[]).filter((e: Record<string, unknown>) => e.question_type === 'weighing_on')"
                    :key="i"
                    class="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100"
                  >
                    {{ WHEEL_OF_LIFE[entry.category as keyof typeof WHEEL_OF_LIFE]?.label ?? entry.category }}
                  </span>
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

        <!-- ── Session Notes ── -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Session Notes</h3>
          </div>

          <div v-if="sessionHistoryError" class="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {{ sessionHistoryError }}
          </div>
          <div v-else-if="allSummaries.length === 0" class="text-sm text-gray-400 py-8 text-center">No session notes yet.</div>
          <div v-else class="space-y-3">
            <div
              v-for="s in allSummaries"
              :key="s.id as string"
              class="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              <!-- Summary header row -->
              <div
                class="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                @click="toggleCycle(s.id as string)"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">{{ s.title || 'Session Summary' }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ s.submitted_at ? new Date(s.submitted_at as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '' }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <router-link
                    :to="{ name: 'session-summary', params: { clientId }, query: { cycleId: s._cycleId, summaryId: s.id as string } }"
                    @click.stop
                    class="text-xs text-teal-600 hover:text-teal-700 font-medium px-2.5 py-1 border border-teal-200 rounded-lg transition-colors"
                  >Edit</router-link>
                  <svg
                    class="w-4 h-4 text-gray-400 transition-transform"
                    :class="expandedCycles.has(s.id as string) ? 'rotate-180' : ''"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                  ><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </div>
              </div>

              <!-- Expanded body -->
              <div v-if="expandedCycles.has(s.id as string)" class="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">

                <!-- Themes -->
                <div v-if="s.themes">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Session Themes</p>
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ s.themes }}</p>
                </div>

                <!-- Strategies -->
                <div v-if="s.strategies">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Strategies & Tools</p>
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ s.strategies }}</p>
                </div>

                <!-- Action items -->
                <div v-if="(s.commitments as string[])?.length">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Action Items</p>
                  <ul class="space-y-2">
                    <li
                      v-for="(c, ci) in (s.commitments as string[])"
                      :key="ci"
                      class="flex items-start gap-2"
                    >
                      <!-- Status icon -->
                      <span
                        class="mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                        :class="{
                          'bg-teal-500 border-teal-500': (s.commitment_progress as Array<{commitment_index: number; status: string; helpfulness_rating: number | null}>)?.find(p => p.commitment_index === ci)?.status === 'completed',
                          'bg-yellow-400 border-yellow-400': (s.commitment_progress as Array<{commitment_index: number; status: string; helpfulness_rating: number | null}>)?.find(p => p.commitment_index === ci)?.status === 'in_progress',
                          'border-gray-300': !['completed','in_progress'].includes((s.commitment_progress as Array<{commitment_index: number; status: string; helpfulness_rating: number | null}>)?.find(p => p.commitment_index === ci)?.status ?? '')
                        }"
                      >
                        <svg v-if="(s.commitment_progress as Array<{commitment_index: number; status: string}>)?.find(p => p.commitment_index === ci)?.status === 'completed'" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        <span v-else-if="(s.commitment_progress as Array<{commitment_index: number; status: string}>)?.find(p => p.commitment_index === ci)?.status === 'in_progress'" class="w-1.5 h-1.5 rounded-full bg-white"></span>
                      </span>
                      <!-- Text + badges -->
                      <div class="flex-1 min-w-0">
                        <span class="text-sm text-gray-700">{{ c }}</span>
                        <div class="flex flex-wrap items-center gap-1.5 mt-1">
                          <!-- Status badge -->
                          <span
                            v-if="(s.commitment_progress as Array<{commitment_index: number; status: string; helpfulness_rating: number | null}>)?.find(p => p.commitment_index === ci)"
                            class="text-xs font-medium px-1.5 py-0.5 rounded"
                            :class="{
                              'bg-teal-50 text-teal-700': (s.commitment_progress as Array<{commitment_index: number; status: string}>)?.find(p => p.commitment_index === ci)?.status === 'completed',
                              'bg-yellow-50 text-yellow-700': (s.commitment_progress as Array<{commitment_index: number; status: string}>)?.find(p => p.commitment_index === ci)?.status === 'in_progress',
                              'bg-gray-100 text-gray-500': (s.commitment_progress as Array<{commitment_index: number; status: string}>)?.find(p => p.commitment_index === ci)?.status === 'not_started'
                            }"
                          >
                            {{
                              { completed: 'Completed', in_progress: 'In Progress', not_started: 'Not Started' }[
                                ((s.commitment_progress as Array<{commitment_index: number; status: string}>)?.find(p => p.commitment_index === ci)?.status ?? 'not_started') as 'completed' | 'in_progress' | 'not_started'
                              ]
                            }}
                          </span>
                          <!-- Helpfulness badge -->
                          <span
                            v-if="(s.commitment_progress as Array<{commitment_index: number; status: string; helpfulness_rating: number | null}>)?.find(p => p.commitment_index === ci)?.helpfulness_rating != null"
                            class="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700"
                          >
                            {{ (s.commitment_progress as Array<{commitment_index: number; status: string; helpfulness_rating: number | null}>)?.find(p => p.commitment_index === ci)?.helpfulness_rating }}/5 helpful
                          </span>
                        </div>
                      </div>
                    </li>
                  </ul>
                </div>

                <!-- Wins -->
                <div v-if="s.wins">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Wins</p>
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ s.wins }}</p>
                </div>

                <!-- Watch-fors -->
                <div v-if="s.watch_fors">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Watch-fors</p>
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ s.watch_fors }}</p>
                </div>

                <!-- Notes for client -->
                <div v-if="s.public_notes">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes for Client</p>
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ s.public_notes }}</p>
                </div>

                <!-- Private notes -->
                <div v-if="s.notes">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Private Notes</p>
                  <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ s.notes }}</p>
                </div>

                <!-- Pre-session reflection -->
                <div v-if="(s._presessionReflections as Record<string, unknown>[])?.length">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pre-Session Reflection</p>
                  <div class="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div v-if="(s._presessionReflections as Record<string, unknown>[])[0]?.week_summary">
                      <p class="text-xs text-gray-500 font-medium">Week summary</p>
                      <p class="text-sm text-gray-700">{{ (s._presessionReflections as Record<string, unknown>[])[0].week_summary }}</p>
                    </div>
                    <div v-if="(s._presessionReflections as Record<string, unknown>[])[0]?.agenda">
                      <p class="text-xs text-gray-500 font-medium">Agenda</p>
                      <p class="text-sm text-gray-700">{{ (s._presessionReflections as Record<string, unknown>[])[0].agenda }}</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- ── Past Sessions ── -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Past Sessions</h3>
          <div v-if="pastSessions.length === 0" class="text-sm text-gray-400 py-4 text-center">No past sessions yet.</div>
          <div v-else class="space-y-3">
            <div
              v-for="s in pastSessions"
              :key="s.id"
              class="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              <!-- Session header row -->
              <div
                class="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                @click="toggleCycle('past-' + s.id)"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">{{ formatDate(s.session_date) }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">
                      {{ s.session_time ? s.session_time.slice(0,5) : 'No time recorded' }}
                      <span v-if="pastSessionBriefs[s.id]" class="ml-2 text-teal-600">· Pre-session brief available</span>
                    </p>
                  </div>
                </div>
                <svg
                  class="w-4 h-4 text-gray-400 transition-transform"
                  :class="expandedCycles.has('past-' + s.id) ? 'rotate-180' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                ><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>

              <!-- Expanded: pre-session brief -->
              <div v-if="expandedCycles.has('past-' + s.id)" class="border-t border-gray-100 px-5 py-5">
                <div v-if="pastSessionBriefs[s.id]" class="space-y-5">
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pre-Session Brief</p>
                    <p class="text-xs text-gray-400">Generated {{ new Date(pastSessionBriefs[s.id].generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}</p>
                  </div>

                  <!-- Cycle summary -->
                  <div v-if="(pastSessionBriefs[s.id].content as Record<string, unknown>).cycle_summary">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cycle Summary</p>
                    <p class="text-sm text-gray-700 leading-relaxed">{{ (pastSessionBriefs[s.id].content as Record<string, unknown>).cycle_summary }}</p>
                  </div>

                  <!-- Pre-session reflection -->
                  <div v-if="(pastSessionBriefs[s.id].content as Record<string, unknown>).presession_reflection">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Patient Reflection</p>
                    <div class="bg-gray-50 rounded-lg p-3 space-y-2">
                      <template v-for="[key, label] in [['week_summary','Week summary'],['progress','Progress'],['agenda','Agenda'],['session_intent','Session intent']]" :key="key">
                        <div v-if="((pastSessionBriefs[s.id].content as Record<string, unknown>).presession_reflection as Record<string, unknown>)?.[key]">
                          <p class="text-xs text-gray-500 font-medium">{{ label }}</p>
                          <p class="text-sm text-gray-700">{{ ((pastSessionBriefs[s.id].content as Record<string, unknown>).presession_reflection as Record<string, unknown>)[key] }}</p>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- Suggested openers -->
                  <div v-if="((pastSessionBriefs[s.id].content as Record<string, unknown>).suggested_openers as string[])?.length">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Suggested Openers</p>
                    <ul class="space-y-1.5">
                      <li
                        v-for="(opener, i) in (pastSessionBriefs[s.id].content as Record<string, unknown>).suggested_openers as string[]"
                        :key="i"
                        class="text-sm text-gray-700 flex gap-2"
                      >
                        <span class="text-gray-400 shrink-0">{{ i + 1 }}.</span>{{ opener }}
                      </li>
                    </ul>
                  </div>

                  <!-- Flagged events -->
                  <div v-if="((pastSessionBriefs[s.id].content as Record<string, unknown>).flagged_events as unknown[])?.length">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Flagged Events</p>
                    <div class="space-y-2">
                      <div
                        v-for="(ev, i) in (pastSessionBriefs[s.id].content as Record<string, unknown>).flagged_events as Record<string, unknown>[]"
                        :key="i"
                        class="bg-red-50 border border-red-100 rounded-lg px-3 py-2"
                      >
                        <p class="text-xs font-medium text-red-700">{{ ev.log_date }} · Mood {{ ev.mood_score ?? '—' }}</p>
                        <p class="text-sm text-red-800 mt-0.5">{{ ev.summary }}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="text-sm text-gray-400">No pre-session brief was generated for this session.</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ── TAB 4: MILESTONES ── -->
      <div v-else-if="activeTab === 'milestones'">
        <ClientMilestonesTab
          :client-id="clientId"
          :client-first-name="clientName.split(' ')[0]"
        />
      </div>

      <!-- ── TAB 5: BILLING ── -->
      <div v-else-if="activeTab === 'billing'" class="space-y-6">

        <!-- Insurance settings card -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <h3 class="text-sm font-semibold text-gray-900 mb-3">Billing Settings</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Billing Type</label>
              <select
                v-model="insuranceStatus"
                @change="saveInsurance"
                class="w-56 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="unknown">Unknown</option>
                <option value="insurance">Insurance</option>
                <option value="self_pay">Self-Pay</option>
                <option value="sliding_scale">Sliding Scale</option>
              </select>
            </div>
            <div v-if="insuranceStatus === 'insurance'">
              <label class="block text-xs font-medium text-gray-600 mb-1">Insurance Provider</label>
              <div class="flex gap-2 items-center">
                <input
                  v-model="insuranceProvider"
                  type="text"
                  maxlength="100"
                  placeholder="e.g., BCBS, Aetna, United, Cigna"
                  class="w-72 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  @blur="saveInsurance"
                />
                <span v-if="savingInsurance" class="text-xs text-gray-400">Saving…</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Report list -->
        <BillingTab
          :client-id="clientId"
          :client-name="clientName"
          :insurance-status="insuranceStatus"
        />
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

  <PresessionBriefDrawer
    :open="drawerOpen"
    :brief="briefData as any"
    :client-name="clientName"
    @close="drawerOpen = false"
  />

  <AwardMilestoneDrawer
    :open="isAwardDrawerOpen"
    :client-id="clientId"
    :client-first-name="clientName.split(' ')[0]"
    @close="isAwardDrawerOpen = false"
  />
</template>
