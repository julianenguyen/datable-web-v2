<script setup lang="ts">
/**
 * CarePlanWizard — 6-step G0323 care plan creation wizard
 *
 * Step 1: Import session note (paste / upload / manual)
 * Step 2: Review & edit diagnosis (ICD-10)
 * Step 3: Review & edit treatment goals
 * Step 4: Review & edit planned interventions
 * Step 5: Set next review date
 * Step 6: Confirm & Lock (IntersectionObserver scroll gate)
 */
import { ref, computed, onMounted } from 'vue'
import {
  X, Loader2, AlertTriangle, CheckCircle2, Upload,
  ChevronLeft, ChevronRight, Lock,
} from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── PDF / DOCX text extraction (client-side, no PHI sent to CDN) ──────────────
// Dynamic imports — only loaded when the user chooses upload
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  // Vite bundles the worker separately; set workerSrc to the CDN fallback
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    text += content.items.map((i) => ('str' in i ? (i as { str: string }).str : '')).join(' ') + '\n'
  }
  return text.trim()
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.trim()
}

// ── Types ──────────────────────────────────────────────────────────────────────
type SourceTab = 'paste' | 'upload' | 'manual'

interface TreatmentGoal {
  goal_text: string
  measurable_target: string | null
  target_date: string | null
}

interface PlannedIntervention {
  intervention_text: string
  modality: string
}

interface GeneratedDraft {
  icd10_primary: string
  icd10_description: string
  treatment_goals: TreatmentGoal[]
  planned_interventions: PlannedIntervention[]
  next_review_date: string
  source_type: SourceTab
}

const MODALITIES = [
  'CBT', 'DBT', 'ACT', 'motivational_interviewing', 'psychoeducation',
  'behavioral_activation', 'exposure_therapy', 'mindfulness', 'supportive_therapy', 'other',
]

const props = defineProps<{
  clientId: string
  clientName: string
  onComplete: (carePlanId: string) => void
  onCancel: () => void
}>()

// ── Step state ─────────────────────────────────────────────────────────────────
const currentStep = ref(1)

// Step 1
const sourceTab = ref<SourceTab>('paste')
const pastedText = ref('')
const uploadedFile = ref<File | null>(null)
const extractedText = ref('')
const uploadError = ref<string | null>(null)
const isExtracting = ref(false)

// Step 2 — Diagnosis
const icd10Primary = ref('')
const icd10Description = ref('')

// Step 3 — Treatment goals
const treatmentGoals = ref<TreatmentGoal[]>([])

// Step 4 — Interventions
const plannedInterventions = ref<PlannedIntervention[]>([])

// Step 5 — Review date
const nextReviewDate = ref('')

// Step 6 — Scroll lock
const confirmScrolled = ref(false)
const confirmPanelRef = ref<HTMLElement | null>(null)
const bottomSentinelRef = ref<HTMLElement | null>(null)

// AI generation
const isGenerating = ref(false)
const generateError = ref<string | null>(null)

// Save
const isSaving = ref(false)
const saveError = ref<string | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────────
const sessionNoteText = computed(() => {
  if (sourceTab.value === 'paste') return pastedText.value
  if (sourceTab.value === 'upload') return extractedText.value
  return '' // manual: no note text
})

const step1Valid = computed(() => {
  if (sourceTab.value === 'manual') return true
  return sessionNoteText.value.trim().length >= 10
})

const step2Valid = computed(() => icd10Primary.value.trim().length > 0 && icd10Description.value.trim().length > 0)

const step3Valid = computed(() =>
  treatmentGoals.value.length > 0 &&
  treatmentGoals.value.every(g => g.goal_text.trim().length > 0),
)

const step4Valid = computed(() =>
  plannedInterventions.value.length > 0 &&
  plannedInterventions.value.every(iv => iv.intervention_text.trim().length > 0),
)

const step5Valid = computed(() => nextReviewDate.value.length === 10)

const step6Valid = computed(() => confirmScrolled.value)

const canContinue = computed(() => {
  if (currentStep.value === 1) return step1Valid.value
  if (currentStep.value === 2) return step2Valid.value
  if (currentStep.value === 3) return step3Valid.value
  if (currentStep.value === 4) return step4Valid.value
  if (currentStep.value === 5) return step5Valid.value
  if (currentStep.value === 6) return step6Valid.value
  return false
})

// ── Step 1 helpers ─────────────────────────────────────────────────────────────
async function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadedFile.value = file
  uploadError.value = null
  extractedText.value = ''
  isExtracting.value = true
  try {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      extractedText.value = await extractPdfText(file)
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      extractedText.value = await extractDocxText(file)
    } else {
      throw new Error('Unsupported file type. Please upload a PDF or DOCX file.')
    }
    if (extractedText.value.length < 10) {
      throw new Error('Could not extract text from this file. Please try pasting the note instead.')
    }
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : 'Failed to extract text from file'
    uploadedFile.value = null
    extractedText.value = ''
  } finally {
    isExtracting.value = false
  }
}

// ── Step 1 → Step 2: Generate or manual entry ─────────────────────────────────
async function handleStep1Continue() {
  generateError.value = null
  if (sourceTab.value === 'manual') {
    // No AI generation — set defaults for manual entry
    icd10Primary.value = ''
    icd10Description.value = ''
    treatmentGoals.value = [{ goal_text: '', measurable_target: null, target_date: null }]
    plannedInterventions.value = [{ intervention_text: '', modality: 'CBT' }]
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    nextReviewDate.value = thirtyDays.toISOString().split('T')[0]
    currentStep.value = 2
    return
  }

  isGenerating.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    const res = await fetch(`${EDGE_FUNCTION_URL}/care-plan/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: props.clientId,
        sessionNoteText: sessionNoteText.value,
        sourceType: sourceTab.value,
      }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? `Status ${res.status}`)
    }
    const { draft } = await res.json() as { draft: GeneratedDraft }
    icd10Primary.value = draft.icd10_primary
    icd10Description.value = draft.icd10_description
    treatmentGoals.value = draft.treatment_goals
    plannedInterventions.value = draft.planned_interventions
    nextReviewDate.value = draft.next_review_date
    currentStep.value = 2
  } catch (e) {
    generateError.value = e instanceof Error ? e.message : 'AI generation failed'
  } finally {
    isGenerating.value = false
  }
}

// ── Goal helpers ───────────────────────────────────────────────────────────────
function addGoal() {
  treatmentGoals.value.push({ goal_text: '', measurable_target: null, target_date: null })
}

function removeGoal(i: number) {
  if (treatmentGoals.value.length > 1) treatmentGoals.value.splice(i, 1)
}

// ── Intervention helpers ───────────────────────────────────────────────────────
function addIntervention() {
  plannedInterventions.value.push({ intervention_text: '', modality: 'CBT' })
}

function removeIntervention(i: number) {
  if (plannedInterventions.value.length > 1) plannedInterventions.value.splice(i, 1)
}

// ── Step 6: IntersectionObserver scroll gate ──────────────────────────────────
function setupScrollGate() {
  confirmScrolled.value = false
  if (!bottomSentinelRef.value) return
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        confirmScrolled.value = true
        observer.disconnect()
      }
    },
    { threshold: 0.9 },
  )
  observer.observe(bottomSentinelRef.value)
}

// ── Navigation ─────────────────────────────────────────────────────────────────
async function handleNext() {
  if (currentStep.value === 1) {
    await handleStep1Continue()
    return
  }
  if (currentStep.value < 6) {
    currentStep.value++
    if (currentStep.value === 6) {
      // Mount then attach observer
      setTimeout(setupScrollGate, 100)
    }
  }
}

function handleBack() {
  if (currentStep.value > 1) currentStep.value--
}

// ── Save & lock ────────────────────────────────────────────────────────────────
async function handleSave() {
  if (!confirmScrolled.value) return
  isSaving.value = true
  saveError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    const res = await fetch(`${EDGE_FUNCTION_URL}/care-plan/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: props.clientId,
        icd10_primary: icd10Primary.value.trim(),
        icd10_description: icd10Description.value.trim(),
        treatment_goals: treatmentGoals.value,
        planned_interventions: plannedInterventions.value,
        next_review_date: nextReviewDate.value,
        source_type: sourceTab.value,
        confirmation_modal_scrolled: true,
      }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? `Status ${res.status}`)
    }
    const { care_plan } = await res.json() as { care_plan: { id: string } }
    props.onComplete(care_plan.id)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save care plan'
  } finally {
    isSaving.value = false
  }
}

const todayIso = new Date().toISOString().split('T')[0]
</script>

<template>
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="props.onCancel()"
  >
    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[92vh] flex flex-col">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div>
          <h2 class="text-base font-semibold text-gray-900">Create G0323 Care Plan</h2>
          <p class="text-xs text-gray-500 mt-0.5">{{ clientName }} · Step {{ currentStep }} of 6</p>
        </div>
        <button
          class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          @click="props.onCancel()"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Step progress -->
      <div class="px-6 pt-3 pb-2 shrink-0">
        <div class="flex gap-1.5">
          <div
            v-for="s in 6"
            :key="s"
            :class="[
              'h-1 flex-1 rounded-full transition-colors',
              s < currentStep ? 'bg-teal-500' : s === currentStep ? 'bg-teal-300' : 'bg-gray-200',
            ]"
          />
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto px-6 py-4">

        <!-- ── Step 1: Import Session Note ──────────────────────────────────── -->
        <div v-if="currentStep === 1" class="space-y-4">
          <h3 class="text-sm font-semibold text-gray-800">Import Session Note</h3>
          <p class="text-sm text-gray-500">
            Provide the session note text so Claude can extract a draft care plan.
            The note text is used only for AI processing and is <strong>never stored</strong>.
          </p>

          <!-- Source tabs -->
          <div class="flex border-b border-gray-200">
            <button
              v-for="tab in (['paste', 'upload', 'manual'] as SourceTab[])"
              :key="tab"
              :class="[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                sourceTab === tab
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ]"
              @click="sourceTab = tab"
            >
              {{ tab === 'paste' ? 'Paste Note' : tab === 'upload' ? 'Upload File' : 'Enter Manually' }}
            </button>
          </div>

          <!-- Paste tab -->
          <div v-if="sourceTab === 'paste'">
            <textarea
              v-model="pastedText"
              rows="10"
              placeholder="Paste your session note here…"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          <!-- Upload tab -->
          <div v-else-if="sourceTab === 'upload'" class="space-y-3">
            <label
              class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 transition-colors"
            >
              <Upload class="w-8 h-8 text-gray-400" />
              <div class="text-center">
                <p class="text-sm font-medium text-gray-700">Upload PDF or DOCX</p>
                <p class="text-xs text-gray-500">Text is extracted locally — not uploaded to any server</p>
              </div>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                class="hidden"
                @change="handleFileUpload"
              />
            </label>

            <div v-if="isExtracting" class="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 class="w-4 h-4 animate-spin" /> Extracting text…
            </div>
            <div v-if="uploadError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {{ uploadError }}
            </div>
            <div v-if="extractedText" class="space-y-1">
              <p class="text-xs text-gray-500">Extracted text preview:</p>
              <div class="max-h-32 overflow-y-auto bg-gray-50 rounded p-2 text-xs text-gray-700 font-mono whitespace-pre-wrap">
                {{ extractedText.substring(0, 500) }}{{ extractedText.length > 500 ? '…' : '' }}
              </div>
            </div>
          </div>

          <!-- Manual tab -->
          <div v-else-if="sourceTab === 'manual'">
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
              <strong>Manual entry mode:</strong> You'll enter the diagnosis, goals, and interventions
              directly on the next steps. No AI generation will be used.
            </div>
          </div>

          <!-- Generate error -->
          <div v-if="generateError" class="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle class="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p class="text-sm text-red-700">{{ generateError }}</p>
          </div>
        </div>

        <!-- ── Step 2: Review Diagnosis ──────────────────────────────────────── -->
        <div v-else-if="currentStep === 2" class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Review Diagnosis</h3>
            <p class="text-sm text-gray-500 mt-1">
              Confirm the primary ICD-10 code and description. Edit if the AI extraction was incorrect.
            </p>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">ICD-10 Code</label>
              <input
                v-model="icd10Primary"
                type="text"
                placeholder="e.g. F41.1"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">ICD-10 Description</label>
              <input
                v-model="icd10Description"
                type="text"
                placeholder="e.g. Generalized anxiety disorder"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        <!-- ── Step 3: Treatment Goals ───────────────────────────────────────── -->
        <div v-else-if="currentStep === 3" class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Treatment Goals</h3>
            <p class="text-sm text-gray-500 mt-1">
              Review and edit the individualized treatment goals. Each goal must describe a concrete,
              measurable outcome specific to this client.
            </p>
          </div>

          <div class="space-y-4">
            <div
              v-for="(goal, i) in treatmentGoals"
              :key="i"
              class="border border-gray-200 rounded-lg p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-gray-500">Goal {{ i + 1 }}</span>
                <button
                  v-if="treatmentGoals.length > 1"
                  class="text-xs text-red-500 hover:text-red-700"
                  @click="removeGoal(i)"
                >
                  Remove
                </button>
              </div>
              <textarea
                v-model="goal.goal_text"
                rows="3"
                placeholder="Describe a specific, measurable treatment goal…"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">Measurable Target (optional)</label>
                  <input
                    v-model="goal.measurable_target"
                    type="text"
                    placeholder="e.g. PHQ-9 score below 10"
                    class="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">Target Date (optional)</label>
                  <input
                    v-model="goal.target_date"
                    type="date"
                    :min="todayIso"
                    class="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            class="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
            @click="addGoal"
          >
            + Add Goal
          </button>
        </div>

        <!-- ── Step 4: Planned Interventions ─────────────────────────────────── -->
        <div v-else-if="currentStep === 4" class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Planned Interventions</h3>
            <p class="text-sm text-gray-500 mt-1">
              Review and edit the evidence-based interventions planned for this client.
            </p>
          </div>

          <div class="space-y-4">
            <div
              v-for="(iv, i) in plannedInterventions"
              :key="i"
              class="border border-gray-200 rounded-lg p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-gray-500">Intervention {{ i + 1 }}</span>
                <button
                  v-if="plannedInterventions.length > 1"
                  class="text-xs text-red-500 hover:text-red-700"
                  @click="removeIntervention(i)"
                >
                  Remove
                </button>
              </div>
              <textarea
                v-model="iv.intervention_text"
                rows="2"
                placeholder="Describe the specific intervention…"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <div>
                <label class="block text-xs text-gray-500 mb-1">Modality</label>
                <select
                  v-model="iv.modality"
                  class="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option v-for="m in MODALITIES" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
            </div>
          </div>

          <button
            class="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
            @click="addIntervention"
          >
            + Add Intervention
          </button>
        </div>

        <!-- ── Step 5: Next Review Date ──────────────────────────────────────── -->
        <div v-else-if="currentStep === 5" class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Next Review Date</h3>
            <p class="text-sm text-gray-500 mt-1">
              Set the date when this care plan must be reviewed and confirmed.
              CMS requires review at least every 60 days; we recommend 30 days.
            </p>
          </div>
          <input
            v-model="nextReviewDate"
            type="date"
            :min="todayIso"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <p class="text-xs text-gray-400">
            Recommended: 30 days from today
            ({{ new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }})
          </p>
        </div>

        <!-- ── Step 6: Confirm & Lock ─────────────────────────────────────────── -->
        <div v-else-if="currentStep === 6" class="space-y-4" ref="confirmPanelRef">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Review & Lock Care Plan</h3>
            <p class="text-sm text-gray-500 mt-1">
              Scroll through the complete care plan below. The lock button activates once you
              have reviewed all content.
            </p>
          </div>

          <!-- Full plan summary -->
          <div class="border border-gray-200 rounded-xl divide-y divide-gray-100 text-sm">
            <div class="p-4 space-y-1">
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Diagnosis</p>
              <p class="font-mono text-gray-800">{{ icd10Primary }}</p>
              <p class="text-gray-600">{{ icd10Description }}</p>
            </div>
            <div class="p-4 space-y-2">
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Treatment Goals ({{ treatmentGoals.length }})
              </p>
              <ol class="list-decimal list-inside space-y-1">
                <li v-for="(g, i) in treatmentGoals" :key="i" class="text-gray-700">
                  {{ g.goal_text }}
                  <span v-if="g.measurable_target" class="text-gray-400 text-xs ml-1">
                    (Target: {{ g.measurable_target }})
                  </span>
                </li>
              </ol>
            </div>
            <div class="p-4 space-y-2">
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Planned Interventions ({{ plannedInterventions.length }})
              </p>
              <ol class="list-decimal list-inside space-y-1">
                <li v-for="(iv, i) in plannedInterventions" :key="i" class="text-gray-700">
                  {{ iv.intervention_text }}
                  <span class="text-gray-400 text-xs ml-1">({{ iv.modality }})</span>
                </li>
              </ol>
            </div>
            <div class="p-4">
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Next Review Date</p>
              <p class="text-gray-700">
                {{ new Date(nextReviewDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }}
              </p>
            </div>

            <!-- Attestation (IntersectionObserver target) -->
            <div class="p-4 bg-gray-50" ref="bottomSentinelRef">
              <p class="text-xs text-gray-600">
                By locking this care plan, I attest that this individualized care plan is medically
                necessary, accurate, and reflects my clinical assessment of this patient's needs.
                This plan will be used for G0323 Chronic Care Management billing documentation.
              </p>
            </div>
          </div>

          <div
            v-if="!confirmScrolled"
            class="flex items-center gap-2 text-xs text-gray-400"
          >
            <AlertTriangle class="w-4 h-4 shrink-0" />
            Scroll to the attestation statement above to enable the lock button.
          </div>
          <div
            v-else
            class="flex items-center gap-2 text-xs text-teal-600"
          >
            <CheckCircle2 class="w-4 h-4 shrink-0" />
            Plan reviewed. You may now lock and save.
          </div>

          <div v-if="saveError" class="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle class="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p class="text-sm text-red-700">{{ saveError }}</p>
          </div>
        </div>

      </div>

      <!-- Footer nav -->
      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
        <button
          v-if="currentStep > 1"
          class="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          :disabled="isGenerating || isSaving"
          @click="handleBack"
        >
          <ChevronLeft class="w-4 h-4" /> Back
        </button>
        <div v-else />

        <!-- Step 6: Lock button -->
        <button
          v-if="currentStep === 6"
          :disabled="!confirmScrolled || isSaving"
          class="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          @click="handleSave"
        >
          <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
          <Lock v-else class="w-4 h-4" />
          Lock & Save Care Plan
        </button>

        <!-- Steps 1–5: Continue / Generate -->
        <button
          v-else
          :disabled="!canContinue || isGenerating"
          class="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          @click="handleNext"
        >
          <Loader2 v-if="isGenerating" class="w-4 h-4 animate-spin" />
          {{ currentStep === 1 && sourceTab !== 'manual' ? (isGenerating ? 'Generating…' : 'Generate Plan') : 'Continue' }}
          <ChevronRight v-if="!isGenerating" class="w-4 h-4" />
        </button>
      </div>

    </div>
  </div>
</template>
