<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, ChevronLeft, Award } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

const props = defineProps<{
  open: boolean
  clientId: string
  clientFirstName: string
}>()

const emit = defineEmits<{ close: [] }>()

interface MilestoneDef {
  id: string
  milestone_name: string
  clinical_description: string
  framework: string
  sort_order: number
}

interface DomainGroup {
  domain: string
  domain_label: string
  color: string
  milestones: MilestoneDef[]
}

interface SessionCycle {
  id: string
  session_date: string | null
  next_session_date: string | null
  status: string
}

// Drawer state
const currentStep = ref<1 | 2 | 3>(1)
const selectedDomain = ref<string | null>(null)
const selectedMilestoneId = ref<string | null>(null)
const therapistNote = ref('')
const selectedCycleId = ref<string>('')
const calloutPreview = ref<string | null>(null)
const calloutLoading = ref(false)
const isSubmitting = ref(false)
const submitError = ref<string | null>(null)
const submitSuccess = ref(false)

// Taxonomy
const taxonomy = ref<DomainGroup[]>([])
const taxonomyLoading = ref(false)
const taxonomyError = ref<string | null>(null)

// Cycles
const cycles = ref<SessionCycle[]>([])

// Expanded milestone rows
const expandedMilestones = ref<Set<string>>(new Set())

const selectedDomainGroup = computed(() =>
  taxonomy.value.find(d => d.domain === selectedDomain.value) ?? null
)

const selectedMilestone = computed(() =>
  selectedDomainGroup.value?.milestones.find(m => m.id === selectedMilestoneId.value) ?? null
)

function formatCycleLabel(c: SessionCycle): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (!c.session_date) return 'Unknown cycle'
  if (!c.next_session_date) return fmt(c.session_date) + ' – present'
  return fmt(c.session_date) + ' – ' + fmt(c.next_session_date)
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    'Authorization': `Bearer ${data.session?.access_token ?? ''}`,
    'apikey': supabaseAnonKey,
    'Content-Type': 'application/json',
  }
}

async function loadTaxonomy() {
  taxonomyLoading.value = true
  taxonomyError.value = null
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/milestones/taxonomy`, {
      headers: await authHeaders(),
    })
    if (!res.ok) throw new Error('Failed')
    taxonomy.value = await res.json() as DomainGroup[]
  } catch {
    taxonomyError.value = 'Failed to load milestone categories. Please try again.'
  } finally {
    taxonomyLoading.value = false
  }
}

async function loadCycles() {
  const { data } = await supabase
    .from('session_cycles')
    .select('id, session_date, next_session_date, status')
    .eq('client_id', props.clientId)
    .order('session_date', { ascending: false })
    .limit(6)
  cycles.value = (data ?? []) as SessionCycle[]

  const closed = cycles.value.find(c => c.status === 'closed')
  selectedCycleId.value = closed?.id ?? ''
  if (closed?.id) fetchCalloutPreview(closed.id)
}

async function fetchCalloutPreview(cycleId: string) {
  if (!cycleId) { calloutPreview.value = null; return }
  calloutLoading.value = true
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/milestones/client/${props.clientId}/cycle-preview?cycleId=${cycleId}`,
      { headers: await authHeaders() }
    )
    if (!res.ok) throw new Error('Failed')
    const json = await res.json()
    calloutPreview.value = json.callout_text ?? null
  } catch {
    calloutPreview.value = null
  } finally {
    calloutLoading.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) {
    reset()
    loadTaxonomy()
    loadCycles()
  }
})

function reset() {
  currentStep.value = 1
  selectedDomain.value = null
  selectedMilestoneId.value = null
  therapistNote.value = ''
  selectedCycleId.value = ''
  calloutPreview.value = null
  isSubmitting.value = false
  submitError.value = null
  submitSuccess.value = false
  expandedMilestones.value = new Set()
}

function selectDomain(domain: string) {
  selectedDomain.value = domain
  selectedMilestoneId.value = null
  expandedMilestones.value = new Set()
  currentStep.value = 2
}

function backToDomains() {
  selectedDomain.value = null
  currentStep.value = 1
}

function toggleMilestone(id: string) {
  if (expandedMilestones.value.has(id)) {
    expandedMilestones.value.delete(id)
  } else {
    expandedMilestones.value.add(id)
  }
  expandedMilestones.value = new Set(expandedMilestones.value)
}

function selectMilestone(id: string) {
  selectedMilestoneId.value = id
  if (!expandedMilestones.value.has(id)) toggleMilestone(id)
}

function backToMilestones() {
  selectedMilestoneId.value = null
  currentStep.value = 2
}

function onCycleChange() {
  fetchCalloutPreview(selectedCycleId.value)
}

async function awardMilestone() {
  if (!selectedMilestoneId.value) return
  isSubmitting.value = true
  submitError.value = null
  try {
    const headers = await authHeaders()
    const res = await fetch(`${EDGE_FUNCTION_URL}/milestones/award`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        client_id: props.clientId,
        milestone_type_id: selectedMilestoneId.value,
        cycle_id: selectedCycleId.value || null,
        therapist_note: therapistNote.value.trim() || null,
      }),
    })
    if (!res.ok) throw new Error('Failed')
    const data = await res.json()
    if (!data?.id) throw new Error('No milestone returned')
    submitSuccess.value = true
  } catch {
    submitError.value = 'Something went wrong. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}

function close() {
  reset()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <!-- Overlay -->
      <div class="fixed inset-0 z-40 bg-black/40" @click="close" />

      <!-- Drawer -->
      <div
        class="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-transform duration-200"
        :class="open ? 'translate-x-0' : 'translate-x-full'"
        style="width: min(480px, 100vw);"
        @click.stop
      >
        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <Award class="w-4 h-4 text-teal-600" />
            <h2 class="text-base font-semibold text-gray-900">Award Milestone</h2>
          </div>
          <button @click="close" class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Success state -->
        <div v-if="submitSuccess" class="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div class="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-4">
            <Award class="w-6 h-6 text-teal-600" />
          </div>
          <p class="text-base font-semibold text-gray-900 mb-1">Milestone awarded.</p>
          <p class="text-sm text-gray-500">{{ clientFirstName }} will see this the next time they open the app.</p>
          <button @click="close" class="mt-6 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors">
            Close
          </button>
        </div>

        <!-- Step content -->
        <div v-else class="flex-1 overflow-y-auto px-6 py-5">

          <!-- Step 1: Select Domain -->
          <template v-if="currentStep === 1">
            <p class="text-sm text-gray-500 mb-4">Select a clinical domain to browse milestones.</p>

            <div v-if="taxonomyLoading" class="flex items-center justify-center py-16">
              <span class="w-6 h-6 border-2 border-gray-200 border-t-teal-600 rounded-full animate-spin" />
            </div>

            <div v-else-if="taxonomyError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {{ taxonomyError }}
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <button
                v-for="domain in taxonomy"
                :key="domain.domain"
                @click="selectDomain(domain.domain)"
                class="text-left p-4 rounded-xl border transition-all hover:bg-gray-50"
                :style="{
                  borderColor: selectedDomain === domain.domain ? domain.color : '#e5e7eb',
                  backgroundColor: selectedDomain === domain.domain ? domain.color + '14' : '',
                  borderLeftWidth: '4px',
                  borderLeftColor: domain.color,
                }"
              >
                <p class="text-sm font-medium text-gray-900 leading-snug">{{ domain.domain_label }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ domain.milestones.length }} milestones</p>
              </button>
            </div>
          </template>

          <!-- Step 2: Select Milestone -->
          <template v-else-if="currentStep === 2 && selectedDomainGroup">
            <button @click="backToDomains" class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
              <ChevronLeft class="w-4 h-4" />
              Back to domains
            </button>

            <p class="text-sm font-semibold mb-4" :style="{ color: selectedDomainGroup.color }">
              {{ selectedDomainGroup.domain_label }}
            </p>

            <div class="space-y-2">
              <div
                v-for="m in selectedDomainGroup.milestones"
                :key="m.id"
                class="border rounded-xl overflow-hidden transition-all cursor-pointer"
                :style="{
                  borderColor: selectedMilestoneId === m.id ? selectedDomainGroup.color : '#e5e7eb',
                  backgroundColor: selectedMilestoneId === m.id ? selectedDomainGroup.color + '14' : 'white',
                }"
                @click="selectMilestone(m.id)"
              >
                <div class="flex items-start gap-3 px-4 py-3">
                  <!-- Radio -->
                  <div class="mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                    :style="{
                      borderColor: selectedMilestoneId === m.id ? selectedDomainGroup.color : '#d1d5db',
                      backgroundColor: selectedMilestoneId === m.id ? selectedDomainGroup.color : 'transparent',
                    }">
                    <div v-if="selectedMilestoneId === m.id" class="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900">{{ m.milestone_name }}</p>
                    <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {{ expandedMilestones.has(m.id) ? m.clinical_description : m.clinical_description.slice(0, 80) + (m.clinical_description.length > 80 ? '…' : '') }}
                    </p>
                    <div v-if="expandedMilestones.has(m.id)" class="mt-2">
                      <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{{ m.framework }}</span>
                    </div>
                  </div>
                  <button
                    class="shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                    @click.stop="toggleMilestone(m.id)"
                  >
                    <svg class="w-4 h-4 transition-transform" :class="expandedMilestones.has(m.id) ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- Step 3: Note + Confirm -->
          <template v-else-if="currentStep === 3 && selectedMilestone && selectedDomainGroup">
            <button @click="backToMilestones" class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
              <ChevronLeft class="w-4 h-4" />
              Back to milestones
            </button>

            <!-- Selected milestone summary -->
            <div class="border rounded-xl p-4 mb-5" :style="{ borderColor: selectedDomainGroup.color + '40', backgroundColor: selectedDomainGroup.color + '0a' }">
              <span class="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-2"
                :style="{ backgroundColor: selectedDomainGroup.color, color: 'white' }">
                {{ selectedDomainGroup.domain_label }}
              </span>
              <p class="text-sm font-semibold text-gray-900">{{ selectedMilestone.milestone_name }}</p>
            </div>

            <!-- Therapist note -->
            <div class="mb-5">
              <label class="block text-sm font-medium text-gray-700 mb-1">Add a personal note (optional)</label>
              <textarea
                v-model="therapistNote"
                rows="4"
                maxlength="500"
                :placeholder="`Add a personal note for ${clientFirstName} about this milestone (optional)`"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
              />
              <p class="text-xs mt-1 text-right" :class="therapistNote.length > 450 ? 'text-red-500' : 'text-gray-400'">
                {{ therapistNote.length }} / 500 characters
              </p>
            </div>

            <!-- Cycle selector -->
            <div class="mb-5">
              <label class="block text-sm font-medium text-gray-700 mb-1">Which session cycle did this progress occur in?</label>
              <select
                v-model="selectedCycleId"
                @change="onCycleChange"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option v-for="c in cycles" :key="c.id" :value="c.id">{{ formatCycleLabel(c) }}</option>
                <option value="">Not tied to a specific cycle</option>
              </select>
            </div>

            <!-- Callout preview -->
            <div v-if="calloutPreview && !calloutLoading" class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5">
              <p class="text-xs font-medium text-gray-500 mb-1">What the patient will see:</p>
              <p class="text-sm text-gray-700 italic leading-relaxed">{{ calloutPreview }}</p>
            </div>
            <div v-else-if="calloutLoading" class="flex items-center gap-2 text-xs text-gray-400 mb-5">
              <span class="w-3 h-3 border border-gray-300 border-t-teal-500 rounded-full animate-spin" />
              Loading preview…
            </div>

            <!-- Error -->
            <div v-if="submitError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              {{ submitError }}
            </div>

            <!-- Award button -->
            <button
              @click="awardMilestone"
              :disabled="isSubmitting"
              class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              {{ isSubmitting ? 'Awarding…' : 'Award Milestone' }}
            </button>

            <button @click="close" class="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 py-2 transition-colors">
              Cancel
            </button>
          </template>
        </div>

        <!-- Step 2 footer: Continue button -->
        <div
          v-if="!submitSuccess && currentStep === 2 && selectedMilestoneId"
          class="border-t border-gray-200 px-6 py-4 shrink-0"
        >
          <button
            @click="currentStep = 3"
            class="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>
