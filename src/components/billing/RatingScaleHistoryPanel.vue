<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScaleAdministrationItem {
  itemNumber: number
  itemText: string
  responseValue: number
  responseLabel: string
  itemScore: number
}

interface ScaleAdministration {
  id: string
  scaleCode: string
  scaleName: string
  administeredAt: string
  totalScore: number | null
  severityLabel: string | null
  scoreInterpretation: string | null
  scoreChange: number | null
  significantChangeFlagged: boolean
  administrationMode: string
  completedAt: string | null
  items: ScaleAdministrationItem[]
}

interface HistoryResponse {
  administrations: ScaleAdministration[]
  hasRecentScale: boolean
  daysSinceLastScale: number | null
}

// ── Props / Emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
}>()

const emit = defineEmits<{
  administerScale: []
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const authStore = useAuthStore()
const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_EDGE_FUNCTION_URL as string

const loading = ref(true)
const errorMsg = ref<string | null>(null)
const data = ref<HistoryResponse | null>(null)
const selectedScale = ref<string>('all')
const expandedRows = ref<Set<string>>(new Set())

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchHistory(): Promise<void> {
  loading.value = true
  errorMsg.value = null
  try {
    const token = authStore.session?.access_token
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/rating-scales/history/${props.clientId}`,
      {
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data.value = (await res.json()) as HistoryResponse
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load history'
  } finally {
    loading.value = false
  }
}

onMounted(fetchHistory)

// ── Computed ───────────────────────────────────────────────────────────────────
const availableScales = computed<Array<{ code: string; name: string }>>(() => {
  if (!data.value) return []
  const seen = new Map<string, string>()
  for (const a of data.value.administrations) {
    if (!seen.has(a.scaleCode)) seen.set(a.scaleCode, a.scaleName)
  }
  return Array.from(seen.entries()).map(([code, name]) => ({ code, name }))
})

const filteredAdministrations = computed<ScaleAdministration[]>(() => {
  if (!data.value) return []
  const list = [...data.value.administrations].sort(
    (a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime()
  )
  if (selectedScale.value === 'all') return list
  return list.filter((a) => a.scaleCode === selectedScale.value)
})

// Chart data: only for filtered scale when ≥2 points and a single scale is selected
const chartPoints = computed<Array<{ date: Date; score: number }>>(() => {
  if (selectedScale.value === 'all') return []
  const withScores = filteredAdministrations.value
    .filter((a): a is ScaleAdministration & { totalScore: number } => a.totalScore !== null)
    .map((a) => ({ date: new Date(a.administeredAt), score: a.totalScore }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  if (withScores.length < 2) return []
  return withScores
})

const showChart = computed(() => chartPoints.value.length >= 2)

// SVG chart dimensions
const SVG_W = 600
const SVG_H = 120
const PADDING = { top: 10, right: 16, bottom: 24, left: 32 }

const chartMeta = computed(() => {
  if (!showChart.value) return null
  const pts = chartPoints.value
  const scores = pts.map((p) => p.score)
  const dates = pts.map((p) => p.date.getTime())
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const minDate = Math.min(...dates)
  const maxDate = Math.max(...dates)
  const scoreRange = maxScore - minScore || 1
  const dateRange = maxDate - minDate || 1

  const plotW = SVG_W - PADDING.left - PADDING.right
  const plotH = SVG_H - PADDING.top - PADDING.bottom

  const svgPoints = pts.map((p) => ({
    x: PADDING.left + ((p.date.getTime() - minDate) / dateRange) * plotW,
    y: PADDING.top + (1 - (p.score - minScore) / scoreRange) * plotH,
    score: p.score,
    date: p.date,
  }))

  const polyline = svgPoints.map((p) => `${p.x},${p.y}`).join(' ')

  const yTicks = [minScore, Math.round((minScore + maxScore) / 2), maxScore]
  const xTicks = [pts[0], pts[pts.length - 1]]

  return { svgPoints, polyline, yTicks, xTicks, minScore, maxScore, minDate, maxDate, plotW, plotH }
})

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function severityColorClass(label: string | null): string {
  if (!label) return 'bg-gray-100 text-gray-600'
  const l = label.toLowerCase()
  if (l.includes('none') || l.includes('minimal')) return 'bg-green-100 text-green-700'
  if (l.includes('mild')) return 'bg-amber-100 text-amber-700'
  if (l.includes('moderate')) return 'bg-amber-200 text-amber-800'
  if (l.includes('severe')) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

function modeLabel(mode: string): string {
  if (mode === 'patient_self_report' || mode === 'self_report') return 'Patient Self-Report'
  if (mode === 'clinician_administered' || mode === 'clinician') return 'Clinician Administered'
  return mode
}

function modeColorClass(mode: string): string {
  if (mode === 'patient_self_report' || mode === 'self_report')
    return 'bg-blue-100 text-blue-700'
  return 'bg-purple-100 text-purple-700'
}

// For PHQ / GAD, improvement = score going down
function isImprovementScale(scaleCode: string): boolean {
  return scaleCode.startsWith('PHQ') || scaleCode.startsWith('GAD')
}

function scoreChangeColorClass(change: number | null, scaleCode: string): string {
  if (change === null || change === 0) return 'text-gray-500'
  const improvement = isImprovementScale(scaleCode) ? change < 0 : change > 0
  return improvement ? 'text-green-600' : 'text-amber-600'
}

function scoreChangeLabel(change: number | null): string {
  if (change === null || change === 0) return ''
  return change > 0 ? `▲ +${change}` : `▼ ${change}`
}

function toggleRow(id: string): void {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id)
  } else {
    expandedRows.value.add(id)
  }
}
</script>

<template>
  <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <ClipboardList :size="16" class="text-teal-600" />
        <h3 class="text-sm font-semibold text-gray-900">Rating Scale History</h3>
      </div>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
        @click="emit('administerScale')"
      >
        <ClipboardList :size="13" />
        Administer Scale
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="px-5 py-6 space-y-3">
      <div class="h-6 w-64 rounded bg-gray-100 animate-pulse" />
      <div class="h-4 w-full rounded bg-gray-100 animate-pulse" />
      <div class="h-4 w-5/6 rounded bg-gray-100 animate-pulse" />
      <div class="h-4 w-4/6 rounded bg-gray-100 animate-pulse" />
    </div>

    <!-- Error state -->
    <div v-else-if="errorMsg" class="px-5 py-8 text-center">
      <p class="text-sm text-red-600">{{ errorMsg }}</p>
      <button
        type="button"
        class="mt-3 text-xs text-teal-600 underline hover:text-teal-700"
        @click="fetchHistory"
      >
        Retry
      </button>
    </div>

    <template v-else-if="data">
      <!-- 90-day status chip -->
      <div class="px-5 pt-4 pb-2">
        <div
          v-if="data.hasRecentScale"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-green-100 text-green-700 border border-green-200"
        >
          <CheckCircle2 :size="12" />
          Scale administered in past 90 days
        </div>
        <div
          v-else
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"
        >
          <AlertTriangle :size="12" />
          No scale in past 90 days — recommended for billing
          <span v-if="data.daysSinceLastScale !== null" class="opacity-70">
            ({{ data.daysSinceLastScale }}d ago)
          </span>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="data.administrations.length === 0"
        class="px-5 py-12 text-center"
      >
        <ClipboardList :size="32" class="mx-auto mb-3 text-gray-300" />
        <p class="text-sm font-medium text-gray-500">No rating scales administered yet</p>
        <button
          type="button"
          class="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
          @click="emit('administerScale')"
        >
          Administer Scale
        </button>
      </div>

      <template v-else>
        <!-- Filter dropdown -->
        <div class="px-5 pt-3 pb-2">
          <select
            v-model="selectedScale"
            class="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Scales</option>
            <option
              v-for="s in availableScales"
              :key="s.code"
              :value="s.code"
            >
              {{ s.code }} — {{ s.name }}
            </option>
          </select>
        </div>

        <!-- SVG Score Trend Chart -->
        <div v-if="showChart && chartMeta" class="px-5 py-2">
          <p class="mb-1 text-xs font-medium text-gray-500">Score Trend</p>
          <div class="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
            <svg
              :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
              class="w-full"
              :style="{ height: '120px' }"
              xmlns="http://www.w3.org/2000/svg"
            >
              <!-- Y-axis ticks -->
              <g>
                <line
                  v-for="tick in chartMeta.yTicks"
                  :key="tick"
                  :x1="PADDING.left"
                  :x2="SVG_W - PADDING.right"
                  :y1="PADDING.top + (1 - (tick - chartMeta.minScore) / (chartMeta.maxScore - chartMeta.minScore || 1)) * (SVG_H - PADDING.top - PADDING.bottom)"
                  :y2="PADDING.top + (1 - (tick - chartMeta.minScore) / (chartMeta.maxScore - chartMeta.minScore || 1)) * (SVG_H - PADDING.top - PADDING.bottom)"
                  stroke="#e5e7eb"
                  stroke-width="1"
                />
                <text
                  v-for="tick in chartMeta.yTicks"
                  :key="`label-${tick}`"
                  :x="PADDING.left - 4"
                  :y="PADDING.top + (1 - (tick - chartMeta.minScore) / (chartMeta.maxScore - chartMeta.minScore || 1)) * (SVG_H - PADDING.top - PADDING.bottom) + 4"
                  text-anchor="end"
                  class="fill-gray-400"
                  style="font-size: 9px"
                >{{ tick }}</text>
              </g>

              <!-- Teal trend line -->
              <polyline
                :points="chartMeta.polyline"
                fill="none"
                stroke="#0d9488"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />

              <!-- Data point dots -->
              <circle
                v-for="(pt, i) in chartMeta.svgPoints"
                :key="i"
                :cx="pt.x"
                :cy="pt.y"
                r="4"
                fill="#0d9488"
                stroke="white"
                stroke-width="1.5"
              >
                <title>{{ formatDateShort(pt.date) }}: {{ pt.score }}</title>
              </circle>

              <!-- X-axis date labels (first + last) -->
              <text
                :x="chartMeta.svgPoints[0].x"
                :y="SVG_H - 4"
                text-anchor="start"
                class="fill-gray-400"
                style="font-size: 9px"
              >{{ formatDateShort(chartMeta.xTicks[0].date) }}</text>
              <text
                :x="chartMeta.svgPoints[chartMeta.svgPoints.length - 1].x"
                :y="SVG_H - 4"
                text-anchor="end"
                class="fill-gray-400"
                style="font-size: 9px"
              >{{ formatDateShort(chartMeta.xTicks[chartMeta.xTicks.length - 1].date) }}</text>
            </svg>
          </div>
        </div>

        <!-- History table -->
        <div class="mt-2 divide-y divide-gray-100">
          <div
            v-for="admin in filteredAdministrations"
            :key="admin.id"
            class="group"
          >
            <!-- Main row -->
            <button
              type="button"
              class="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors"
              @click="toggleRow(admin.id)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <!-- Expand icon -->
                <span class="shrink-0 text-gray-400">
                  <ChevronUp v-if="expandedRows.has(admin.id)" :size="14" />
                  <ChevronDown v-else :size="14" />
                </span>

                <!-- Date -->
                <span class="w-28 shrink-0 text-xs text-gray-500">
                  {{ formatDate(admin.administeredAt) }}
                </span>

                <!-- Scale name -->
                <span class="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">
                  {{ admin.scaleName }}
                </span>

                <!-- Score + severity -->
                <span class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="admin.totalScore !== null"
                    class="text-sm font-semibold text-gray-900"
                  >
                    {{ admin.totalScore }}
                  </span>
                  <span
                    v-if="admin.severityLabel"
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="severityColorClass(admin.severityLabel)"
                  >
                    {{ admin.severityLabel }}
                  </span>
                </span>

                <!-- Mode badge -->
                <span
                  class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="modeColorClass(admin.administrationMode)"
                >
                  {{ modeLabel(admin.administrationMode) }}
                </span>

                <!-- Score change -->
                <span
                  v-if="admin.scoreChange !== null && admin.scoreChange !== 0"
                  class="shrink-0 flex items-center gap-1 text-xs font-semibold"
                  :class="scoreChangeColorClass(admin.scoreChange, admin.scaleCode)"
                >
                  <TrendingDown v-if="admin.scoreChange < 0" :size="12" />
                  <TrendingUp v-else :size="12" />
                  {{ scoreChangeLabel(admin.scoreChange) }}
                </span>

                <!-- Significant change flag -->
                <span
                  v-if="admin.significantChangeFlagged"
                  class="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 border border-red-200"
                  title="Significant change flagged"
                >
                  !
                </span>
              </div>

              <!-- Score interpretation sub-line -->
              <p
                v-if="admin.scoreInterpretation"
                class="mt-1 ml-5 text-xs text-gray-400 truncate"
              >
                {{ admin.scoreInterpretation }}
              </p>
            </button>

            <!-- Expanded item-level responses -->
            <div
              v-if="expandedRows.has(admin.id) && admin.items.length > 0"
              class="px-5 pb-4 bg-gray-50 border-t border-gray-100"
            >
              <p class="pt-3 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Item Responses
              </p>
              <div class="space-y-1.5">
                <div
                  v-for="item in admin.items"
                  :key="item.itemNumber"
                  class="flex items-start gap-3 text-xs"
                >
                  <span class="w-5 shrink-0 text-gray-400 font-medium">{{ item.itemNumber }}.</span>
                  <span class="flex-1 text-gray-700 leading-snug">{{ item.itemText }}</span>
                  <span class="shrink-0 rounded bg-white border border-gray-200 px-2 py-0.5 text-gray-800 font-medium">
                    {{ item.responseLabel }} ({{ item.itemScore }})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
