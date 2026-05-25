<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Info, Check } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

type WizardMode = 'onboarding' | 'renewal'
type Step = 1 | 2 | 3 | 4 | 5
type Modality = 'in_person' | 'telehealth' | ''

interface ConsentValidation {
  valid: boolean
  consentRecordId?: string
  consentedAt?: string
  reason?: string
  message?: string
}

interface TelehealthPolicy {
  isExpired: boolean
  isExpiringSoon: boolean
  expirationDate: string
  daysRemaining?: number
  message?: string
}

const props = defineProps<{
  clientId: string
  clientName: string
  mode: WizardMode
  onComplete: (initiatingVisitId: string) => void
  onCancel: () => void
}>()

// ── Step state ────────────────────────────────────────────────────────────────
const currentStep = ref<Step>(props.mode === 'renewal' ? 1 : 2)

// Step 1 (renewal only)
const lastSessionDate = ref('')

// Step 2
const visitDate = ref('')
const visitModality = ref<Modality>('')
const icd10Primary = ref('')
const icd10Description = ref('')

// Step 3
const bhiDiscussed = ref(false)
const patientAgreed = ref(false)

// Step 4
const ehrReminderAcknowledged = ref(false)

// Retroactive
const isRetroactiveFlag = ref(false)
const retroactiveExplanation = ref('')

// API state
const consentValidation = ref<ConsentValidation | null>(null)
const telehealthPolicy = ref<TelehealthPolicy | null>(null)
const attestationPreview = ref('')
const isSubmitting = ref(false)
const error = ref<string | null>(null)
const createdVisitId = ref<string | null>(null)
const lockedAttestation = ref<string | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
  }
}

function formatDateLong(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

const icd10Pattern = /^[A-Z]\d{2}(\.\d{1,4})?$/

// ── Computed validations ──────────────────────────────────────────────────────
const lastSessionMoreThan12Months = computed(() => {
  if (!lastSessionDate.value) return false
  const last = new Date(lastSessionDate.value)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
  return last < twelveMonthsAgo
})

const step2Valid = computed(() =>
  visitDate.value.length > 0 &&
  visitModality.value !== '' &&
  icd10Pattern.test(icd10Primary.value) &&
  icd10Description.value.trim().length > 0 &&
  consentValidation.value?.valid === true &&
  (!isRetroactiveFlag.value || retroactiveExplanation.value.trim().length > 0) &&
  !(visitModality.value === 'telehealth' && telehealthPolicy.value?.isExpired)
)

const step3Valid = computed(() => bhiDiscussed.value && patientAgreed.value)

const step4Valid = computed(() => ehrReminderAcknowledged.value)

// ── Telehealth policy fetch ───────────────────────────────────────────────────
async function fetchTelehealthPolicy() {
  try {
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/initiating-visit/telehealth-policy/status`,
      { headers: await authHeaders() }
    )
    if (res.ok) {
      telehealthPolicy.value = await res.json() as TelehealthPolicy
    }
  } catch {
    // Non-fatal — policy check is best-effort
  }
}

// Fetch policy when telehealth is selected
watch(visitModality, (val) => {
  if (val === 'telehealth' && !telehealthPolicy.value) {
    fetchTelehealthPolicy()
  }
})

// ── Step 2 → Step 3 validation ────────────────────────────────────────────────
async function validateStep2() {
  if (!visitDate.value || !icd10Pattern.test(icd10Primary.value)) return
  error.value = null

  try {
    const headers = await authHeaders()

    // Consent validation
    const consentRes = await fetch(
      `${EDGE_FUNCTION_URL}/initiating-visit/validate-consent`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: props.clientId,
          proposedVisitDate: visitDate.value,
        }),
      }
    )
    const consentData = await consentRes.json() as ConsentValidation
    consentValidation.value = consentData

    if (!consentData.valid) {
      error.value = consentData.message ?? 'Consent validation failed.'
      return
    }

    // Retroactive check
    const retroRes = await fetch(
      `${EDGE_FUNCTION_URL}/initiating-visit/check-retroactive`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: props.clientId,
          proposedVisitDate: visitDate.value,
        }),
      }
    )
    const retroData = await retroRes.json() as {
      isRetroactive: boolean
      message?: string
    }
    if (retroData.isRetroactive) {
      isRetroactiveFlag.value = true
      if (!error.value) {
        error.value = retroData.message ?? 'This visit date appears retroactive. Please provide an explanation.'
      }
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Validation failed. Please try again.'
  }
}

// Build attestation preview (client-side copy of server format)
function buildAttestationPreview(): string {
  const modalityLabel =
    visitModality.value === 'telehealth' ? 'Telehealth (audio-video)' : 'In-person'
  return (
    `On ${formatDateLong(visitDate.value)}, [your name] conducted a psychiatric diagnostic evaluation (CPT 90791) with ${props.clientName}. ` +
    `Behavioral health integration care management services were discussed and the patient agreed to participate. ` +
    `Primary diagnosis: ${icd10Primary.value} — ${icd10Description.value}. Visit modality: ${modalityLabel}.`
  )
}

// ── Navigation ────────────────────────────────────────────────────────────────
async function goNext() {
  error.value = null

  if (currentStep.value === 1) {
    currentStep.value = 2
    return
  }

  if (currentStep.value === 2) {
    await validateStep2()
    if (!consentValidation.value?.valid) return
    if (isRetroactiveFlag.value && !retroactiveExplanation.value.trim()) return
    if (visitModality.value === 'telehealth' && telehealthPolicy.value?.isExpired) return
    attestationPreview.value = buildAttestationPreview()
    currentStep.value = 3
    return
  }

  if (currentStep.value === 3) {
    if (!step3Valid.value) return
    currentStep.value = 4
    return
  }

  if (currentStep.value === 4) {
    await submitVisit()
    return
  }
}

function goBack() {
  if (currentStep.value === 2 && props.mode === 'onboarding') return
  if (currentStep.value > 1) currentStep.value = (currentStep.value - 1) as Step
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitVisit() {
  if (!step4Valid.value) return
  isSubmitting.value = true
  error.value = null

  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/initiating-visit/create`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        clientId: props.clientId,
        visitDate: visitDate.value,
        visitModality: visitModality.value,
        icd10Primary: icd10Primary.value,
        icd10Description: icd10Description.value,
        bhiDiscussed: bhiDiscussed.value,
        patientAgreed: patientAgreed.value,
        consentRecordId: consentValidation.value?.consentRecordId ?? '',
        isRetroactiveFlag: isRetroactiveFlag.value,
        retroactiveExplanation: retroactiveExplanation.value || null,
        ehrReminderAcknowledged: ehrReminderAcknowledged.value,
      }),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to create initiating visit')
    }

    const data = await res.json() as {
      id: string
      attestationStatement: string
    }
    createdVisitId.value = data.id
    lockedAttestation.value = data.attestationStatement
    currentStep.value = 5
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'An error occurred. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}

function handleComplete() {
  if (createdVisitId.value) {
    props.onComplete(createdVisitId.value)
  }
}

const STEP_LABELS = ['Begin', 'Visit Details', 'BHI Confirmation', 'Review & Lock', 'Complete']
const startStep = props.mode === 'renewal' ? 1 : 2
const totalSteps = props.mode === 'renewal' ? 5 : 4
</script>

<template>
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl my-auto">

      <!-- Progress header -->
      <div class="px-6 pt-6 pb-4 border-b border-gray-100">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold text-gray-900">
            Document Initiating Visit (CPT 90791)
          </h2>
          <button
            v-if="currentStep !== 5"
            @click="onCancel"
            class="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>

        <!-- Step indicator -->
        <div class="flex items-center gap-1.5">
          <template v-for="i in (mode === 'renewal' ? 5 : 4)" :key="i">
            <div
              class="h-1.5 flex-1 rounded-full transition-colors"
              :class="(mode === 'renewal' ? i : i + 1) <= currentStep ? 'bg-teal-600' : 'bg-gray-200'"
            />
          </template>
        </div>
        <p class="text-xs text-gray-400 mt-2">
          Step {{ mode === 'onboarding' ? currentStep - 1 : currentStep }} of {{ totalSteps }}
        </p>
      </div>

      <div class="p-6 space-y-5">

        <!-- ── STEP 1: Last Session Date (renewal only) ── -->
        <template v-if="currentStep === 1 && mode === 'renewal'">
          <div>
            <h3 class="text-base font-semibold text-gray-900 mb-1">Before We Begin</h3>
            <p class="text-sm text-gray-500">When was your most recent session with <strong>{{ clientName }}</strong>?</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Date of last session</label>
            <input
              v-model="lastSessionDate"
              type="date"
              :max="new Date().toISOString().split('T')[0]"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <!-- 12-month flag -->
          <div
            v-if="lastSessionDate && lastSessionMoreThan12Months"
            class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800"
          >
            Because your last session with this patient was more than 12 months ago, a new
            initiating visit (CPT 90791) is required before G0323 billing can begin.
          </div>
          <div
            v-else-if="lastSessionDate && !lastSessionMoreThan12Months"
            class="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800"
          >
            Your session history is current. Proceed to document the initiating visit.
          </div>

          <button
            :disabled="!lastSessionDate"
            @click="goNext"
            class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Continue
          </button>
        </template>

        <!-- ── STEP 2: Visit Details ── -->
        <template v-if="currentStep === 2">
          <div>
            <h3 class="text-base font-semibold text-gray-900 mb-0.5">Initiating Visit Details</h3>
            <p class="text-xs text-gray-500">
              Document the psychiatric diagnostic evaluation (CPT 90791) that qualifies as the
              initiating visit for G0323 billing.
            </p>
          </div>

          <!-- Visit date -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Date of 90791 evaluation <span class="text-red-500">*</span>
            </label>
            <input
              v-model="visitDate"
              type="date"
              :max="new Date().toISOString().split('T')[0]"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <!-- Modality -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              How was this visit conducted? <span class="text-red-500">*</span>
            </label>
            <div class="space-y-2">
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="visitModality"
                  type="radio"
                  value="in_person"
                  class="h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                />
                <span class="text-sm text-gray-700">In-person</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="visitModality"
                  type="radio"
                  value="telehealth"
                  class="h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                />
                <span class="text-sm text-gray-700">Telehealth (audio-video)</span>
              </label>
            </div>

            <!-- Telehealth policy expiring soon -->
            <div
              v-if="visitModality === 'telehealth' && telehealthPolicy?.isExpiringSoon && !telehealthPolicy.isExpired"
              class="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800"
            >
              {{ telehealthPolicy.message }}
            </div>

            <!-- Telehealth policy expired — hard block -->
            <div
              v-if="visitModality === 'telehealth' && telehealthPolicy?.isExpired"
              class="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800"
            >
              {{ telehealthPolicy.message }}
            </div>
          </div>

          <!-- ICD-10 code -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Primary ICD-10 diagnosis code <span class="text-red-500">*</span>
            </label>
            <input
              v-model="icd10Primary"
              type="text"
              placeholder="e.g., F32.1"
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-gray-400"
              :class="icd10Primary && !icd10Pattern.test(icd10Primary)
                ? 'border-red-300'
                : 'border-gray-300'"
            />
            <p
              v-if="icd10Primary && !icd10Pattern.test(icd10Primary)"
              class="text-xs text-red-600 mt-1"
            >
              Invalid ICD-10 format. Use format like F32.1 or Z00
            </p>
          </div>

          <!-- ICD-10 description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Diagnosis description <span class="text-red-500">*</span>
            </label>
            <input
              v-model="icd10Description"
              type="text"
              placeholder="e.g., Major depressive disorder, single episode, moderate"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-gray-400"
            />
          </div>

          <!-- Retroactive explanation (shown when flagged) -->
          <div v-if="isRetroactiveFlag" class="space-y-2">
            <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              The visit date you entered is after the first billing summary report for this patient.
              Please provide an explanation for this documentation sequence.
            </div>
            <textarea
              v-model="retroactiveExplanation"
              rows="3"
              placeholder="Explain why the initiating visit is being documented after the first billing report…"
              class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none placeholder:text-gray-400"
            />
          </div>

          <!-- Consent/validation error -->
          <div
            v-if="error"
            class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"
          >
            {{ error }}
          </div>

          <button
            @click="goNext"
            :disabled="!visitDate || visitModality === '' || !icd10Pattern.test(icd10Primary) || !icd10Description.trim() || (visitModality === 'telehealth' && telehealthPolicy?.isExpired)"
            class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Continue
          </button>
        </template>

        <!-- ── STEP 3: BHI Discussion ── -->
        <template v-if="currentStep === 3">
          <div>
            <h3 class="text-base font-semibold text-gray-900 mb-0.5">Confirm BHI Discussion</h3>
            <p class="text-sm text-gray-500 leading-relaxed">
              CMS requires that behavioral health integration services were discussed with the
              patient at the initiating visit and that the patient agreed to participate. Please
              confirm both of the following:
            </p>
          </div>

          <div class="space-y-4">
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                v-model="bhiDiscussed"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span class="text-sm text-gray-700 leading-relaxed">
                I discussed behavioral health integration care management services with
                <strong>{{ clientName }}</strong> during this visit.
              </span>
            </label>

            <label class="flex items-start gap-3 cursor-pointer">
              <input
                v-model="patientAgreed"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span class="text-sm text-gray-700 leading-relaxed">
                <strong>{{ clientName }}</strong> agreed to participate in behavioral health
                integration care management services.
              </span>
            </label>
          </div>

          <div class="flex gap-3">
            <button
              @click="goBack"
              class="flex-1 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 py-2.5 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              @click="goNext"
              :disabled="!step3Valid"
              class="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        </template>

        <!-- ── STEP 4: Attestation Preview ── -->
        <template v-if="currentStep === 4">
          <div>
            <h3 class="text-base font-semibold text-gray-900 mb-0.5">Review Attestation Statement</h3>
            <p class="text-sm text-gray-500 leading-relaxed">
              The following statement will be permanently recorded and locked as your attestation.
              It cannot be edited after you confirm.
            </p>
          </div>

          <!-- Attestation preview box -->
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 leading-relaxed">
            {{ attestationPreview }}
          </div>

          <!-- EHR reminder -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-3">
            <div class="flex items-start gap-2">
              <Info class="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p class="text-sm text-blue-800 leading-relaxed">
                Make sure your session note for <strong>{{ formatDateLong(visitDate) }}</strong> in
                your primary EHR documents the BHI discussion. Auditors may request your full
                medical record.
              </p>
            </div>
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                v-model="ehrReminderAcknowledged"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-blue-300 text-teal-600 focus:ring-teal-500"
              />
              <span class="text-sm text-blue-800">I understand and will confirm this in my EHR.</span>
            </label>
          </div>

          <!-- Error -->
          <div
            v-if="error"
            class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"
          >
            {{ error }}
          </div>

          <div class="flex gap-3">
            <button
              @click="goBack"
              class="text-sm font-medium text-gray-500 hover:text-gray-700 underline"
            >
              Go Back
            </button>
            <button
              @click="submitVisit"
              :disabled="!step4Valid || isSubmitting"
              class="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span
                v-if="isSubmitting"
                class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
              />
              {{ isSubmitting ? 'Locking attestation…' : 'Confirm and Lock Attestation' }}
            </button>
          </div>
        </template>

        <!-- ── STEP 5: Confirmation ── -->
        <template v-if="currentStep === 5">
          <div class="text-center">
            <div class="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check class="w-6 h-6 text-teal-700" />
            </div>
            <h3 class="text-base font-semibold text-gray-900 mb-1">
              Initiating Visit Documented
            </h3>
            <p class="text-sm text-gray-500 leading-relaxed">
              The initiating visit for <strong>{{ clientName }}</strong> has been recorded and
              locked. G0323 billing is now available for this patient.
            </p>
          </div>

          <!-- Locked attestation -->
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 leading-relaxed">
            {{ lockedAttestation }}
          </div>

          <!-- Retention notice -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            This record will be retained for a minimum of 7 years in compliance with CMS
            documentation requirements.
          </div>

          <button
            @click="handleComplete"
            class="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Continue to Patient Profile
          </button>
        </template>

      </div>
    </div>
  </div>
</template>
