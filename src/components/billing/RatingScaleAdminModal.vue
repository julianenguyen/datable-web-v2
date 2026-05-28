<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Loader2, Star } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { supabase, supabaseAnonKey } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScaleItem {
  number: number
  text: string
  options: Array<{ value: number; label: string }>
}

interface ScaleMetadata {
  code: string
  name: string
  description: string
  totalItems: number
  administrationMode: 'patient_self_report' | 'clinician_only' | 'both'
  items: ScaleItem[]
}

interface StartResponse {
  administrationId: string
  scale: ScaleMetadata
}

interface CompleteResponse {
  administrationId: string
  scaleName: string
  totalScore: number
  severityLabel: string
  interpretation: string
  significantChange: boolean
}

interface SuggestResponse {
  suggestions: string[]
}

// ── Props / emits ──────────────────────────────────────────────────────────────

const props = defineProps<{
  clientId: string
  icd10Code?: string
}>()

const emit = defineEmits<{
  close: []
  completed: [administrationId: string, scaleName: string, totalScore: number, severityLabel: string]
}>()

// ── Constants ──────────────────────────────────────────────────────────────────

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_EDGE_FUNCTION_URL as string

type Screen = 'selector' | 'items' | 'results'

// ── State ──────────────────────────────────────────────────────────────────────

const authStore = useAuthStore()

const screen = ref<Screen>('selector')

// Selector screen
const availableScales = ref<ScaleMetadata[]>([])
const suggestedCodes = ref<string[]>([])
const selectedScaleCode = ref<string>('')
const loadingLibrary = ref(false)
const libraryError = ref<string | null>(null)

// Item-by-item screen
const administrationId = ref<string>('')
const activeScale = ref<ScaleMetadata | null>(null)
const currentItemIndex = ref(0)
const responses = ref<Map<number, number>>(new Map())
const starting = ref(false)
const startError = ref<string | null>(null)

// Results screen
const result = ref<CompleteResponse | null>(null)
const submitting = ref(false)
const submitError = ref<string | null>(null)

// ── Auth helpers ────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  // Use store token if available, fall back to getSession()
  let token = authStore.user ? (await supabase.auth.getSession()).data.session?.access_token ?? '' : ''
  return {
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
  }
}

// ── Computed ────────────────────────────────────────────────────────────────────

const clinicianScales = computed(() =>
  availableScales.value.filter(
    s => s.administrationMode === 'clinician_only' || s.administrationMode === 'both'
  )
)

const selectedScale = computed(() =>
  clinicianScales.value.find(s => s.code === selectedScaleCode.value) ?? null
)

const currentItem = computed((): ScaleItem | null => {
  if (!activeScale.value) return null
  return activeScale.value.items[currentItemIndex.value] ?? null
})

const currentItemNumber = computed(() => currentItemIndex.value + 1)
const totalItems = computed(() => activeScale.value?.items.length ?? 0)

const currentResponse = computed(() => {
  const item = currentItem.value
  if (!item) return undefined
  return responses.value.get(item.number)
})

const isLastItem = computed(() => currentItemIndex.value === totalItems.value - 1)

const canGoNext = computed(() => currentResponse.value !== undefined)

const severityColor = computed(() => {
  if (!result.value) return 'text-gray-700'
  const label = result.value.severityLabel.toLowerCase()
  if (label.includes('severe') || label.includes('high')) return 'text-red-600'
  if (label.includes('moderate') || label.includes('mild')) return 'text-amber-600'
  return 'text-green-600'
})

const severityBg = computed(() => {
  if (!result.value) return 'bg-gray-50 border-gray-200'
  const label = result.value.severityLabel.toLowerCase()
  if (label.includes('severe') || label.includes('high')) return 'bg-red-50 border-red-200'
  if (label.includes('moderate') || label.includes('mild')) return 'bg-amber-50 border-amber-200'
  return 'bg-green-50 border-green-200'
})

// ── API calls ──────────────────────────────────────────────────────────────────

async function loadLibrary() {
  loadingLibrary.value = true
  libraryError.value = null
  try {
    const headers = await authHeaders()
    const [libraryRes, suggestRes] = await Promise.all([
      fetch(`${EDGE_FUNCTION_URL}/rating-scales/library`, { headers }),
      fetch(`${EDGE_FUNCTION_URL}/rating-scales/suggest/${props.clientId}`, { headers }),
    ])

    if (!libraryRes.ok) throw new Error(`Failed to load scale library (${libraryRes.status})`)
    const libraryData = await libraryRes.json() as ScaleMetadata[]
    availableScales.value = libraryData

    if (suggestRes.ok) {
      const suggestData = await suggestRes.json() as SuggestResponse
      suggestedCodes.value = suggestData.suggestions ?? []
    }

    // Pre-select suggested scale or first available
    const firstSuggested = clinicianScales.value.find(s => suggestedCodes.value.includes(s.code))
    if (firstSuggested) {
      selectedScaleCode.value = firstSuggested.code
    } else if (clinicianScales.value.length > 0) {
      selectedScaleCode.value = clinicianScales.value[0].code
    }
  } catch (e) {
    libraryError.value = e instanceof Error ? e.message : 'Failed to load rating scales'
  } finally {
    loadingLibrary.value = false
  }
}

async function startAssessment() {
  if (!selectedScaleCode.value) return
  starting.value = true
  startError.value = null
  try {
    const headers = await authHeaders()
    const res = await fetch(`${EDGE_FUNCTION_URL}/rating-scales/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: props.clientId,
        scaleCode: selectedScaleCode.value,
        administrationMode: 'clinician_administered',
      }),
    })
    if (!res.ok) throw new Error(`Failed to start assessment (${res.status})`)
    const data = await res.json() as StartResponse
    administrationId.value = data.administrationId
    activeScale.value = data.scale
    currentItemIndex.value = 0
    responses.value = new Map()
    screen.value = 'items'
  } catch (e) {
    startError.value = e instanceof Error ? e.message : 'Failed to start assessment'
  } finally {
    starting.value = false
  }
}

async function submitResponses() {
  submitting.value = true
  submitError.value = null
  try {
    const headers = await authHeaders()
    const responseList = Array.from(responses.value.entries()).map(([itemNumber, responseValue]) => ({
      itemNumber,
      responseValue,
    }))
    const res = await fetch(`${EDGE_FUNCTION_URL}/rating-scales/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        administrationId: administrationId.value,
        responses: responseList,
      }),
    })
    if (!res.ok) throw new Error(`Failed to submit responses (${res.status})`)
    const data = await res.json() as CompleteResponse
    result.value = data
    screen.value = 'results'
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Failed to submit responses'
  } finally {
    submitting.value = false
  }
}

// ── Item navigation ─────────────────────────────────────────────────────────────

function selectResponse(value: number) {
  const item = currentItem.value
  if (!item) return
  responses.value = new Map(responses.value).set(item.number, value)
}

function goNext() {
  if (!canGoNext.value) return
  if (isLastItem.value) {
    submitResponses()
  } else {
    currentItemIndex.value++
  }
}

function goPrevious() {
  if (currentItemIndex.value > 0) {
    currentItemIndex.value--
  }
}

function handleDone() {
  if (!result.value) return
  emit('completed', result.value.administrationId, result.value.scaleName, result.value.totalScore, result.value.severityLabel)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(() => {
  loadLibrary()
})
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
    <div class="max-w-lg w-full bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Clinician-Administered Rating Scale</h2>
          <p v-if="screen === 'items' && activeScale" class="text-sm text-gray-500 mt-0.5">
            {{ activeScale.name }}
          </p>
        </div>
        <button
          @click="emit('close')"
          class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- ── SCREEN: Scale selector ─────────────────────────────────────────── -->
      <div v-if="screen === 'selector'" class="flex flex-col flex-1 overflow-y-auto">
        <div class="px-6 py-5 flex flex-col gap-5">

          <!-- Clinician banner -->
          <div class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p class="text-sm text-amber-800">
              This scale is being administered by the clinician on behalf of the patient.
            </p>
          </div>

          <!-- Loading state -->
          <div v-if="loadingLibrary" class="flex items-center justify-center py-8 gap-3 text-gray-500">
            <Loader2 class="w-5 h-5 animate-spin" />
            <span class="text-sm">Loading available scales…</span>
          </div>

          <!-- Error state -->
          <div v-else-if="libraryError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ libraryError }}
          </div>

          <!-- Scale list -->
          <div v-else class="flex flex-col gap-3">
            <p class="text-sm font-medium text-gray-700">Select a rating scale</p>
            <div class="flex flex-col gap-2">
              <button
                v-for="scale in clinicianScales"
                :key="scale.code"
                @click="selectedScaleCode = scale.code"
                class="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
                :class="selectedScaleCode === scale.code
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'"
              >
                <!-- Radio indicator -->
                <div class="mt-0.5 flex-shrink-0">
                  <div
                    class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                    :class="selectedScaleCode === scale.code ? 'border-teal-500' : 'border-gray-300'"
                  >
                    <div
                      v-if="selectedScaleCode === scale.code"
                      class="w-2 h-2 rounded-full bg-teal-500"
                    />
                  </div>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-gray-900 text-sm">{{ scale.name }}</span>
                    <span
                      v-if="suggestedCodes.includes(scale.code)"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700"
                    >
                      <Star class="w-3 h-3" />
                      Suggested
                    </span>
                    <span
                      v-if="scale.administrationMode === 'clinician_only'"
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                    >
                      Clinician only
                    </span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">{{ scale.description }}</p>
                  <p class="text-xs text-gray-400 mt-1">{{ scale.totalItems }} items · {{ scale.code }}</p>
                </div>
              </button>
            </div>

            <p v-if="clinicianScales.length === 0" class="text-sm text-gray-500 text-center py-4">
              No clinician-administered scales available.
            </p>
          </div>

          <!-- Start error -->
          <div v-if="startError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ startError }}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            @click="startAssessment"
            :disabled="!selectedScaleCode || starting || loadingLibrary"
            class="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="starting" class="w-4 h-4 animate-spin" />
            <span>{{ starting ? 'Starting…' : 'Start Assessment' }}</span>
          </button>
        </div>
      </div>

      <!-- ── SCREEN: Item by item ────────────────────────────────────────────── -->
      <div v-else-if="screen === 'items'" class="flex flex-col flex-1 overflow-hidden">

        <!-- Progress bar -->
        <div class="px-6 pt-4 pb-3 flex-shrink-0">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-700">
              Question {{ currentItemNumber }} of {{ totalItems }}
            </span>
            <span class="text-xs text-gray-400">
              {{ Math.round((currentItemNumber / totalItems) * 100) }}%
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              class="h-full rounded-full bg-teal-500 transition-all duration-300"
              :style="{ width: `${(currentItemNumber / totalItems) * 100}%` }"
            />
          </div>
        </div>

        <!-- Item content -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div v-if="currentItem" class="flex flex-col gap-4">
            <!-- Item text -->
            <p class="text-base font-medium text-gray-900 leading-snug">
              {{ currentItem.text }}
            </p>

            <!-- Response options -->
            <div class="flex flex-col gap-2">
              <button
                v-for="option in currentItem.options"
                :key="option.value"
                @click="selectResponse(option.value)"
                class="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors"
                :class="currentResponse === option.value
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'"
              >
                <div
                  class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="currentResponse === option.value ? 'border-teal-500' : 'border-gray-300'"
                >
                  <div
                    v-if="currentResponse === option.value"
                    class="w-2.5 h-2.5 rounded-full bg-teal-500"
                  />
                </div>
                <span class="text-sm text-gray-800">{{ option.label }}</span>
              </button>
            </div>

            <!-- Submit error -->
            <div v-if="submitError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {{ submitError }}
            </div>
          </div>
        </div>

        <!-- Navigation footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            @click="goPrevious"
            :disabled="currentItemIndex === 0"
            class="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft class="w-4 h-4" />
            Previous
          </button>

          <button
            @click="goNext"
            :disabled="!canGoNext || submitting"
            class="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="submitting" class="w-4 h-4 animate-spin" />
            <template v-else-if="isLastItem">
              Submit Responses
              <CheckCircle2 class="w-4 h-4" />
            </template>
            <template v-else>
              Next
              <ChevronRight class="w-4 h-4" />
            </template>
          </button>
        </div>
      </div>

      <!-- ── SCREEN: Results ────────────────────────────────────────────────── -->
      <div v-else-if="screen === 'results' && result" class="flex flex-col flex-1 overflow-y-auto">
        <div class="px-6 py-5 flex flex-col gap-5">

          <!-- Score card -->
          <div
            class="rounded-xl border p-5 flex flex-col gap-3"
            :class="severityBg"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-gray-600">{{ result.scaleName }}</p>
                <div class="flex items-baseline gap-2 mt-1">
                  <span class="text-4xl font-bold text-gray-900">{{ result.totalScore }}</span>
                  <span class="text-sm text-gray-500">total score</span>
                </div>
              </div>
              <span
                class="px-3 py-1 rounded-full text-sm font-semibold"
                :class="severityColor"
                :style="{ background: 'transparent' }"
              >
                {{ result.severityLabel }}
              </span>
            </div>
            <p class="text-sm text-gray-700">{{ result.interpretation }}</p>
          </div>

          <!-- Significant change banner -->
          <div
            v-if="result.significantChange"
            class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          >
            <AlertTriangle class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p class="text-sm text-amber-800">
              Significant change detected. Care plan review recommended.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            @click="handleDone"
            class="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
          >
            Done
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
