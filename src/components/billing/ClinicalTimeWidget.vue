<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Timer, CheckCircle2, AlertTriangle, XCircle, Play, Square, Loader2, Clock } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SummaryData {
  billing_month: string
  total_minutes: number
  threshold_minutes: number
  meets_threshold: boolean
  minutes_remaining: number
  is_locked: boolean
  breakdown: Record<string, number>
  entry_count: number
}

interface PlatformSession {
  id: string
  client_id: string
  therapist_id: string
  started_at: string
  billing_month: string | null
}

type WidgetState = 'loading' | 'error' | 'no_entries' | 'below_threshold' | 'meets_threshold'

// ── Props / emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  billingMonth?: string   // YYYY-MM; defaults to current server-side
}>()

const emit = defineEmits<{
  statusLoaded: [meetsThreshold: boolean, totalMinutes: number]
  sessionStarted: [sessionId: string]
  sessionEnded: [converted: boolean, durationMinutes: number]
  logEntry: []   // user clicked "Log Time" button
}>()

// ── State ─────────────────────────────────────────────────────────────────────
const widgetState = ref<WidgetState>('loading')
const summary = ref<SummaryData | null>(null)
const loadError = ref<string | null>(null)

// Auto-capture platform session state
const activeSession = ref<PlatformSession | null>(null)
const sessionElapsedSeconds = ref(0)
const sessionTimerHandle = ref<ReturnType<typeof setInterval> | null>(null)
const sessionStarting = ref(false)
const sessionEnding = ref(false)
// Cached token for use in synchronous visibility-change handler (fetch keepalive).
// Refreshed each time a session starts; JWT lifetime (~1 hour) far exceeds any session.
const cachedToken = ref<string>('')

// 30-minute inactivity timer
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
const inactivityHandle = ref<ReturnType<typeof setTimeout> | null>(null)

// ── Computed ──────────────────────────────────────────────────────────────────
const indicatorColor = computed<'amber' | 'green' | 'red'>(() => {
  if (widgetState.value === 'loading' || widgetState.value === 'error') return 'amber'
  if (widgetState.value === 'meets_threshold') return 'green'
  if (widgetState.value === 'below_threshold') return 'amber'
  return 'red' // no_entries
})

const sessionElapsedFormatted = computed<string>(() => {
  const m = Math.floor(sessionElapsedSeconds.value / 60)
  const s = sessionElapsedSeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

// ── API helpers ────────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getToken()
  return fetch(`${EDGE_FUNCTION_URL}/clinical-time${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

// ── Load summary ──────────────────────────────────────────────────────────────
async function reload() {
  widgetState.value = 'loading'
  loadError.value = null
  try {
    const params = props.billingMonth ? `?month=${props.billingMonth}` : ''
    const res = await apiFetch(`/summary/${props.clientId}${params}`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as SummaryData
    summary.value = data

    if (data.entry_count === 0) {
      widgetState.value = 'no_entries'
    } else if (data.meets_threshold) {
      widgetState.value = 'meets_threshold'
    } else {
      widgetState.value = 'below_threshold'
    }

    emit('statusLoaded', data.meets_threshold, data.total_minutes)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load clinical time'
    widgetState.value = 'error'
  }
}

// ── Platform session auto-capture ─────────────────────────────────────────────
async function startSession() {
  if (activeSession.value || sessionStarting.value) return
  sessionStarting.value = true
  try {
    // Cache fresh token for the visibility-change handler (which can't await)
    cachedToken.value = await getToken()
    const res = await apiFetch('/platform-session/start', {
      method: 'POST',
      body: JSON.stringify({ client_id: props.clientId }),
    })
    if (!res.ok) return  // Silent — never interrupt workflow
    const data = await res.json() as { session: PlatformSession | null }
    if (!data.session) return  // No initiating visit — silently skip
    activeSession.value = data.session
    sessionElapsedSeconds.value = 0
    startSessionTimer()
    resetInactivityTimer()
    emit('sessionStarted', data.session.id)
  } catch {
    // Silent — auto-capture errors must never surface
  } finally {
    sessionStarting.value = false
  }
}

async function endSession() {
  if (!activeSession.value || sessionEnding.value) return
  sessionEnding.value = true
  const sessionId = activeSession.value.id
  stopSessionTimer()
  clearInactivityTimer()
  try {
    const res = await apiFetch('/platform-session/end', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    })
    if (res.ok) {
      const data = await res.json() as { converted: boolean; duration_minutes?: number }
      emit('sessionEnded', data.converted, data.duration_minutes ?? 0)
      if (data.converted) {
        // Refresh summary after a short delay so server has committed the entry
        setTimeout(() => reload(), 500)
      }
    }
  } catch {
    // Silent — auto-capture errors must never surface
  } finally {
    activeSession.value = null
    sessionElapsedSeconds.value = 0
    sessionEnding.value = false
  }
}

function startSessionTimer() {
  if (sessionTimerHandle.value) clearInterval(sessionTimerHandle.value)
  sessionTimerHandle.value = setInterval(() => {
    sessionElapsedSeconds.value++
    // Do NOT reset the inactivity timer here — the interval ticking every second
    // would constantly defer it, making it never fire. onUserActivity() is the
    // only correct place to reset it (called by the parent on real user interaction).
  }, 1000)
}

function stopSessionTimer() {
  if (sessionTimerHandle.value) {
    clearInterval(sessionTimerHandle.value)
    sessionTimerHandle.value = null
  }
}

function resetInactivityTimer() {
  clearInactivityTimer()
  inactivityHandle.value = setTimeout(() => {
    // Auto-end session after 30 minutes of inactivity
    endSession()
  }, INACTIVITY_TIMEOUT_MS)
}

function clearInactivityTimer() {
  if (inactivityHandle.value) {
    clearTimeout(inactivityHandle.value)
    inactivityHandle.value = null
  }
}

// Ping the inactivity timer on any user interaction (called from parent via
// a watcher or directly if needed)
function onUserActivity() {
  if (activeSession.value) resetInactivityTimer()
}

// ── Page visibility / unload hooks ─────────────────────────────────────────────
function handleVisibilityChange() {
  if (document.visibilityState === 'hidden' && activeSession.value) {
    const sessionId = activeSession.value.id
    stopSessionTimer()
    clearInactivityTimer()

    // fetch with keepalive: true survives page hide/close and supports
    // Authorization headers — sendBeacon cannot carry custom headers so it
    // always returned 401. cachedToken was populated at session start;
    // JWT lifetime (~1 hr) far exceeds any realistic session.
    fetch(`${EDGE_FUNCTION_URL}/clinical-time/platform-session/end`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cachedToken.value}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId }),
      keepalive: true,
    }).catch(() => { /* silent — auto-capture errors must never surface */ })

    activeSession.value = null
    sessionElapsedSeconds.value = 0
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await reload()
  await startSession()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  // Synchronous cleanup first
  stopSessionTimer()
  clearInactivityTimer()
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  // Fire end-session request with keepalive so it survives SPA navigation.
  // Cannot await here (onUnmounted is synchronous); keepalive ensures the
  // browser does not abort the request when the component tears down.
  if (activeSession.value) {
    fetch(`${EDGE_FUNCTION_URL}/clinical-time/platform-session/end`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cachedToken.value}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: activeSession.value.id }),
      keepalive: true,
    }).catch(() => { /* silent — auto-capture errors must never surface */ })
  }
})

// Reload when client changes (e.g. navigating between clients)
watch(() => props.clientId, async () => {
  await endSession()
  await reload()
  await startSession()
})

// Expose user activity notifier for parent components
defineExpose({ reload, onUserActivity })
</script>

<template>
  <div class="clinical-time-widget space-y-3">
    <!-- Header row -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Timer :size="16" class="text-gray-500" />
        <span class="text-sm font-medium text-gray-700">Qualifying Clinical Time</span>
      </div>

      <!-- Live session indicator -->
      <div v-if="activeSession" class="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5">
        <span class="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
        {{ sessionElapsedFormatted }}
      </div>
    </div>

    <!-- Loading -->
    <div v-if="widgetState === 'loading'" class="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 :size="14" class="animate-spin" />
      Loading clinical time…
    </div>

    <!-- Error -->
    <div v-else-if="widgetState === 'error'" class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <AlertTriangle :size="16" class="mt-0.5 shrink-0 text-amber-600" />
      <p class="text-sm text-amber-800">Unable to load clinical time data. Please refresh.</p>
    </div>

    <!-- Summary card -->
    <template v-else-if="summary">
      <!-- Progress bar -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-gray-500">
            {{ summary.total_minutes }} / {{ summary.threshold_minutes }} min
          </span>
          <span class="text-xs font-medium"
            :class="{
              'text-green-700': indicatorColor === 'green',
              'text-amber-700': indicatorColor === 'amber',
              'text-red-700': indicatorColor === 'red',
            }"
          >
            <template v-if="summary.meets_threshold">
              Threshold met
            </template>
            <template v-else>
              {{ summary.minutes_remaining }} min remaining
            </template>
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            class="h-2 rounded-full transition-all duration-500"
            :class="{
              'bg-green-500': indicatorColor === 'green',
              'bg-amber-400': indicatorColor === 'amber',
              'bg-red-400': indicatorColor === 'red',
            }"
            :style="{ width: `${Math.min(100, (summary.total_minutes / summary.threshold_minutes) * 100)}%` }"
          />
        </div>
      </div>

      <!-- Status badge -->
      <div class="flex items-center gap-2">
        <!-- Green: threshold met -->
        <template v-if="widgetState === 'meets_threshold'">
          <CheckCircle2 :size="16" class="text-green-600 shrink-0" />
          <span class="text-sm text-green-800 font-medium">
            {{ summary.total_minutes }} min recorded — threshold met
          </span>
        </template>

        <!-- Amber: below threshold -->
        <template v-else-if="widgetState === 'below_threshold'">
          <AlertTriangle :size="16" class="text-amber-600 shrink-0" />
          <span class="text-sm text-amber-800">
            {{ summary.total_minutes }} min recorded — {{ summary.minutes_remaining }} more needed
          </span>
        </template>

        <!-- Red: no entries -->
        <template v-else-if="widgetState === 'no_entries'">
          <XCircle :size="16" class="text-red-500 shrink-0" />
          <span class="text-sm text-red-700">No time logged this month</span>
        </template>
      </div>

      <!-- Locked notice -->
      <div v-if="summary.is_locked" class="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded px-2 py-1">
        <Clock :size="12" />
        Billing month locked — entries closed
      </div>

      <!-- Breakdown (collapsed; shown when there are entries) -->
      <details v-if="summary.entry_count > 0" class="text-xs text-gray-600">
        <summary class="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
          View breakdown ({{ summary.entry_count }} {{ summary.entry_count === 1 ? 'entry' : 'entries' }})
        </summary>
        <ul class="mt-2 space-y-0.5 pl-2 border-l-2 border-gray-200">
          <li v-for="(minutes, type) in summary.breakdown" :key="type" class="flex justify-between">
            <span class="capitalize">{{ String(type).replace(/_/g, ' ') }}</span>
            <span class="font-medium">{{ minutes }} min</span>
          </li>
        </ul>
      </details>
    </template>

    <!-- Action buttons -->
    <div v-if="widgetState !== 'loading'" class="flex items-center gap-2 pt-1">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-teal-600 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 transition-colors"
        @click="emit('logEntry')"
      >
        <Clock :size="12" />
        Log Time
      </button>

      <!-- Manual end session button (shown when session active) -->
      <button
        v-if="activeSession"
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        :disabled="sessionEnding"
        @click="endSession()"
      >
        <Square :size="12" :fill="sessionEnding ? 'none' : 'currentColor'" />
        {{ sessionEnding ? 'Ending…' : 'End Session' }}
      </button>
    </div>
  </div>
</template>
