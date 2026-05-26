<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Clock, AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
interface TimeEntry {
  id: string
  activity_date: string
  activity_type: string
  duration_minutes: number
  billing_month: string
  billing_month_locked: boolean
  is_retroactive: boolean
  retroactive_explanation: string | null
  note: string | null
  attested_at: string
  source: 'manual' | 'platform_session'
  platform_session_id: string | null
  created_at: string
}

// ── Props ──────────────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  billingMonth?: string  // optional YYYY-MM filter
}>()

defineExpose({ reload })

// ── State ─────────────────────────────────────────────────────────────────────
const entries = ref<TimeEntry[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const expandedNotes = ref<Set<string>>(new Set())
const expandedRetro = ref<Set<string>>(new Set())

// ── API ────────────────────────────────────────────────────────────────────────
async function reload() {
  loading.value = true
  loadError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    const params = props.billingMonth ? `?month=${props.billingMonth}` : ''
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/clinical-time/entries/${props.clientId}${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      }
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as { entries: TimeEntry[] }
    entries.value = data.entries
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load time entries'
  } finally {
    loading.value = false
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatActivityType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSource(entry: TimeEntry): string {
  return entry.source === 'platform_session' ? 'Auto-captured' : 'Manual'
}

function toggleNote(id: string) {
  if (expandedNotes.value.has(id)) {
    expandedNotes.value.delete(id)
  } else {
    expandedNotes.value.add(id)
  }
  // Trigger reactivity
  expandedNotes.value = new Set(expandedNotes.value)
}

function toggleRetro(id: string) {
  if (expandedRetro.value.has(id)) {
    expandedRetro.value.delete(id)
  } else {
    expandedRetro.value.add(id)
  }
  expandedRetro.value = new Set(expandedRetro.value)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(reload)

watch(() => [props.clientId, props.billingMonth], reload)
</script>

<template>
  <div class="time-log-history">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Clock :size="15" class="text-gray-500" />
        <span class="text-sm font-medium text-gray-700">Time Log</span>
        <span v-if="entries.length" class="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {{ entries.length }}
        </span>
      </div>
      <button
        type="button"
        class="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        :disabled="loading"
        @click="reload"
      >
        <RefreshCw :size="14" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-2 text-sm text-gray-500 py-4">
      <Loader2 :size="14" class="animate-spin" />
      Loading entries…
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle :size="14" class="shrink-0" />
      {{ loadError }}
    </div>

    <!-- Empty state -->
    <div v-else-if="entries.length === 0" class="text-sm text-gray-400 py-4 text-center">
      No time entries recorded{{ billingMonth ? ` for ${billingMonth}` : '' }}.
    </div>

    <!-- Entry list -->
    <div v-else class="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="bg-white p-3 space-y-1.5"
      >
        <!-- Row 1: date + type + duration + source -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-gray-900">{{ formatDate(entry.activity_date) }}</span>
            <span class="text-xs text-gray-500">{{ formatActivityType(entry.activity_type) }}</span>

            <!-- Retroactive badge -->
            <span
              v-if="entry.is_retroactive"
              class="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 cursor-pointer hover:bg-amber-200 transition-colors"
              @click="toggleRetro(entry.id)"
            >
              <AlertTriangle :size="10" />
              Retroactive
              <component :is="expandedRetro.has(entry.id) ? ChevronUp : ChevronDown" :size="10" />
            </span>

            <!-- Source badge -->
            <span
              v-if="entry.source === 'platform_session'"
              class="text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded px-1.5 py-0.5"
            >
              Auto-captured
            </span>

            <!-- Locked badge -->
            <span
              v-if="entry.billing_month_locked"
              class="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5"
            >
              Locked
            </span>
          </div>

          <!-- Duration pill -->
          <span class="shrink-0 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
            {{ entry.duration_minutes }} min
          </span>
        </div>

        <!-- Retroactive explanation (expandable) -->
        <div v-if="entry.is_retroactive && expandedRetro.has(entry.id)" class="pl-2 border-l-2 border-amber-300">
          <p class="text-xs text-amber-800 italic leading-relaxed">
            {{ entry.retroactive_explanation ?? 'No explanation provided.' }}
          </p>
        </div>

        <!-- Note (expandable) -->
        <div v-if="entry.note">
          <button
            type="button"
            class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            @click="toggleNote(entry.id)"
          >
            <component :is="expandedNotes.has(entry.id) ? ChevronUp : ChevronDown" :size="12" />
            {{ expandedNotes.has(entry.id) ? 'Hide note' : 'View note' }}
          </button>
          <p
            v-if="expandedNotes.has(entry.id)"
            class="mt-1 text-xs text-gray-700 leading-relaxed bg-gray-50 rounded p-2 border border-gray-200"
          >
            {{ entry.note }}
          </p>
        </div>

        <!-- Attested at (small) -->
        <p class="text-xs text-gray-300">
          Attested {{ new Date(entry.attested_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) }}
          · {{ formatSource(entry) }}
        </p>
      </div>
    </div>
  </div>
</template>
