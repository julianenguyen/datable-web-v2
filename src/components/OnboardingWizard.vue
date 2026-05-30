<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { CheckCircle2, Loader2, AlertTriangle, Info } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { US_STATES } from '@/constants/states'

const emit = defineEmits<{ complete: [] }>()

// Same key used by the onboarding store — written here directly so
// the wizard can suppress itself synchronously on any future mount.
const STORAGE_KEY = 'datable_credential_wizard_done'

// ── Visibility / init ─────────────────────────────────────────────────────────

const isVisible = ref(false)
const isInitializing = ref(true)

// ── Step tracking ─────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4
const currentStep = ref<WizardStep>(1)

const STEP_LABELS = ['NPI Verification', 'License Details', 'Supervision Status', 'Review & Confirm']

// ── Step 1: NPI Verification ──────────────────────────────────────────────────

const npiInput = ref('')
const oigConsent = ref(false)
const licenseType = ref('')
const npiVerified = ref(false)
const isVerifying = ref(false)

interface NpiResult {
  verified: boolean
  taxonomy_code?: string
  taxonomy_description?: string
  nppes_name?: string
  reason?: string
}

const npiVerificationResult = ref<NpiResult | null>(null)

const LICENSE_TYPE_OPTIONS = [
  { value: 'LCSW',         label: 'LCSW — Licensed Clinical Social Worker' },
  { value: 'LMFT',         label: 'LMFT — Licensed Marriage and Family Therapist' },
  { value: 'LPC',          label: 'LPC — Licensed Professional Counselor' },
  { value: 'LMHC',         label: 'LMHC — Licensed Mental Health Counselor' },
  { value: 'Psychologist', label: 'Clinical Psychologist' },
  { value: 'MD',           label: 'MD / Psychiatrist' },
  { value: 'NP',           label: 'NP — Nurse Practitioner' },
  { value: 'PA',           label: 'PA — Physician Assistant' },
]

const npiErrorMessage = computed<string | null>(() => {
  const reason = npiVerificationResult.value?.reason
  if (!reason) return null
  const messages: Record<string, string> = {
    npi_not_found:
      'This NPI was not found in the NPPES registry. Please check the number and try again.',
    taxonomy_mismatch:
      'The license type you selected does not match the taxonomy code on file for this NPI.',
    organization_npi_not_accepted:
      'This appears to be an organization NPI (Type 2). Datable requires an individual provider NPI (Type 1).',
    oig_excluded:
      'Your credentials could not be verified at this time. Our team has been notified.',
  }
  return messages[reason] ?? 'Verification failed. Please try again or contact support.'
})

async function handleNpiBlur() {
  if (
    npiInput.value.length === 10 &&
    oigConsent.value &&
    licenseType.value &&
    !npiVerified.value &&
    !isVerifying.value
  ) {
    await verifyNpi()
  }
}

async function verifyNpi() {
  if (!npiInput.value || npiInput.value.length !== 10 || !licenseType.value) return
  isVerifying.value = true
  npiVerificationResult.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/verify-npi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ npi: npiInput.value, license_type: licenseType.value }),
    })

    const data = await res.json() as NpiResult
    npiVerificationResult.value = data
    npiVerified.value = data.verified === true
  } catch (e: unknown) {
    npiVerificationResult.value = { verified: false, reason: 'network_error' }
    npiVerified.value = false
    console.error('[OnboardingWizard/verify-npi]', String(e))
  } finally {
    isVerifying.value = false
  }
}

// ── Step 2: License Details ───────────────────────────────────────────────────

const licenseNumber = ref('')
const licenseExpirationDate = ref('')
const stateOfLicensure = ref('')
const stateOfPractice = ref('')
const telehealthStates = ref<string[]>([])

const todayIso = new Date().toISOString().split('T')[0]

const step2Valid = computed(() =>
  licenseNumber.value.trim().length > 0 &&
  licenseExpirationDate.value.length > 0 &&
  stateOfLicensure.value.length > 0 &&
  stateOfPractice.value.length > 0
)

function toggleTelehealthState(code: string) {
  const idx = telehealthStates.value.indexOf(code)
  if (idx >= 0) telehealthStates.value.splice(idx, 1)
  else telehealthStates.value.push(code)
}

// ── Step 3: Supervision Status ────────────────────────────────────────────────

const isIndependentlyLicensed = ref<boolean | null>(null)
const isSaving = ref(false)
const saveError = ref<string | null>(null)

// Save credentials (called at step 3) and optionally emit complete
async function saveAndContinue(toDashboard: boolean) {
  if (isIndependentlyLicensed.value === null) return
  isSaving.value = true
  saveError.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/save`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        npi_individual: npiInput.value,
        license_type: licenseType.value,
        license_number: licenseNumber.value,
        license_state: stateOfLicensure.value,
        license_expiration_date: licenseExpirationDate.value,
        is_independently_licensed: isIndependentlyLicensed.value,
        verification_consent_given: true,
      }),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to save credentials')
    }

    // Also save billing-profile fields if collected
    if (stateOfPractice.value) {
      const profileRes = await fetch(`${EDGE_FUNCTION_URL}/credentials/billing-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state_of_practice: stateOfPractice.value,
          telehealth_states: telehealthStates.value,
          state_of_licensure: stateOfLicensure.value,
        }),
      })
      // Non-fatal if this fails — log and continue
      if (!profileRes.ok) {
        console.warn('[OnboardingWizard/billing-profile]', await profileRes.text().catch(() => ''))
      }
    }

    if (toDashboard || !isIndependentlyLicensed.value) {
      // Supervised users or explicit "go to dashboard" → wizard complete
      emit('complete')
    } else {
      // Independently licensed → advance to review step
      currentStep.value = 4
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'An error occurred. Please try again.'
  } finally {
    isSaving.value = false
  }
}

// ── Mount: load status to resume wizard ───────────────────────────────────────

interface CredentialStatus {
  phase1_complete: boolean
  current_phase1_step: number
  npi_verified: boolean
  npi: string | null
  license_type: string | null
  license_number: string | null
  license_expiration_date: string | null
  state_of_licensure: string | null
  is_independently_licensed: boolean | null
}

onMounted(async () => {
  // Fast path: if we already know credentials are done, skip the network
  // call and signal the parent immediately.
  if (localStorage.getItem(STORAGE_KEY)) {
    isInitializing.value = false
    emit('complete')
    return
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    if (!token) {
      isVisible.value = true
      return
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })

    if (!res.ok) {
      // No credentials record yet — show wizard from step 1
      isVisible.value = true
      return
    }

    const status = await res.json() as CredentialStatus

    if (status.phase1_complete) {
      // Phase 1 already complete — persist immediately so future mounts
      // skip this async check entirely, then signal the parent.
      localStorage.setItem(STORAGE_KEY, '1')
      emit('complete')
      return
    }

    // Pre-populate fields from existing record
    if (status.npi) npiInput.value = status.npi
    if (status.license_type) licenseType.value = status.license_type
    if (status.license_number) licenseNumber.value = status.license_number
    if (status.license_expiration_date) licenseExpirationDate.value = status.license_expiration_date
    if (status.state_of_licensure) stateOfLicensure.value = status.state_of_licensure
    if (status.is_independently_licensed !== null && status.is_independently_licensed !== undefined) {
      isIndependentlyLicensed.value = status.is_independently_licensed
    }

    if (status.npi_verified) {
      npiVerified.value = true
      oigConsent.value = true // Consent was already given for the initial verification
    }

    // Resume at correct step
    if (status.current_phase1_step >= 3 && status.npi_verified) {
      currentStep.value = 3
    } else if (status.npi_verified) {
      currentStep.value = 2
    } else {
      currentStep.value = 1
    }

    isVisible.value = true
  } catch (e: unknown) {
    console.error('[OnboardingWizard/init]', String(e))
    isVisible.value = true // Fallback: show wizard
  } finally {
    isInitializing.value = false
  }
})
</script>

<template>
  <!-- Initializing: invisible placeholder so the app doesn't flash -->
  <div v-if="isInitializing" />

  <!-- Full-screen blocking wizard overlay -->
  <Teleport to="body">
    <div
      v-if="isVisible && !isInitializing"
      class="fixed inset-0 z-[9999] bg-white overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Provider Credential Setup"
    >
      <div class="max-w-2xl mx-auto px-6 py-10">
        <!-- Header -->
        <div class="mb-8">
          <img src="/logo-teal.png" alt="Datable Health" class="h-7 mb-6" />
          <h1 class="text-2xl font-semibold text-gray-900">Provider Credential Setup</h1>
          <p class="text-sm text-gray-500 mt-1">
            Complete your credential verification to access Datable. This is required before using the platform.
          </p>
        </div>

        <!-- Step indicator -->
        <div class="flex items-center gap-0 mb-10">
          <template v-for="(label, idx) in STEP_LABELS" :key="idx">
            <div class="flex flex-col items-center">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors"
                :class="
                  currentStep === idx + 1
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : currentStep > idx + 1
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                "
              >
                <CheckCircle2 v-if="currentStep > idx + 1" class="w-4 h-4" />
                <span v-else>{{ idx + 1 }}</span>
              </div>
              <span
                class="mt-1 text-xs font-medium whitespace-nowrap"
                :class="currentStep >= idx + 1 ? 'text-teal-700' : 'text-gray-400'"
              >
                {{ label }}
              </span>
            </div>
            <div
              v-if="idx < STEP_LABELS.length - 1"
              class="flex-1 h-0.5 mb-5"
              :class="currentStep > idx + 1 ? 'bg-teal-500' : 'bg-gray-200'"
            />
          </template>
        </div>

        <!-- ── Step 1: NPI Verification ─────────────────────────────────────── -->
        <div v-if="currentStep === 1" class="bg-white rounded-xl border border-gray-200 p-6">
          <div class="border-l-4 border-teal-600 pl-4 mb-5">
            <h2 class="text-xl font-semibold text-gray-900">NPI Verification</h2>
          </div>

          <!-- OIG consent (must be first) -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
            <div class="flex items-start gap-2">
              <Info class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p class="text-sm text-blue-800">
                To access Datable, you authorize Datable Health to verify your credentials with the
                NPPES NPI Registry and the OIG List of Excluded Individuals and Entities. This
                verification is required by CMS and commercial payer compliance standards.
              </p>
            </div>
          </div>

          <label class="flex items-start gap-3 cursor-pointer mb-6">
            <input
              v-model="oigConsent"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span class="text-sm text-gray-700">
              I authorize Datable Health to verify my credentials with the NPPES NPI Registry and
              OIG List of Excluded Individuals and Entities.
            </span>
          </label>

          <div class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">License Type</label>
              <select
                v-model="licenseType"
                :disabled="npiVerified"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="" disabled>Select license type</option>
                <option v-for="opt in LICENSE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">NPI Number</label>
              <input
                v-model="npiInput"
                type="text"
                maxlength="10"
                placeholder="10-digit individual NPI"
                :disabled="npiVerified"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
                @blur="handleNpiBlur"
              />
              <p class="text-xs text-gray-400 mt-1">
                Verification runs automatically when you leave this field (10 digits + consent required).
              </p>
            </div>
          </div>

          <!-- Verify button -->
          <button
            v-if="!npiVerified"
            :disabled="!npiInput || npiInput.length !== 10 || !licenseType || !oigConsent || isVerifying"
            @click="verifyNpi"
            class="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
          >
            <Loader2 v-if="isVerifying" class="w-4 h-4 animate-spin" />
            <span>{{ isVerifying ? 'Verifying with NPPES and OIG…' : 'Verify Credentials' }}</span>
          </button>

          <!-- Verification success -->
          <div
            v-if="npiVerified && npiVerificationResult"
            class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4"
          >
            <div class="flex items-center gap-2 mb-1">
              <CheckCircle2 class="w-4 h-4 text-green-600" />
              <span class="text-sm font-semibold text-green-800">NPI Verified</span>
            </div>
            <p class="text-sm text-green-700">
              <span v-if="npiVerificationResult.nppes_name">
                <strong>{{ npiVerificationResult.nppes_name }}</strong> —
              </span>
              {{ npiVerificationResult.taxonomy_description ?? licenseType }}
            </p>
          </div>

          <!-- Verification error -->
          <div
            v-if="npiVerificationResult && !npiVerificationResult.verified"
            class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
          >
            <div class="flex items-start gap-2">
              <AlertTriangle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p class="text-sm text-red-700">{{ npiErrorMessage }}</p>
            </div>
          </div>

          <div class="flex justify-end mt-4">
            <button
              :disabled="!npiVerified"
              @click="currentStep = 2"
              class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>

        <!-- ── Step 2: License Details ───────────────────────────────────────── -->
        <div v-if="currentStep === 2" class="bg-white rounded-xl border border-gray-200 p-6">
          <h2 class="text-xl font-semibold text-gray-900 mb-5">License Details</h2>

          <div class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">License Number</label>
              <input
                v-model="licenseNumber"
                type="text"
                placeholder="e.g. TX-12345"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                License Expiration Date
              </label>
              <input
                v-model="licenseExpirationDate"
                type="date"
                :min="todayIso"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                State of Licensure
              </label>
              <select
                v-model="stateOfLicensure"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="" disabled>Select state</option>
                <option
                  v-for="s in US_STATES"
                  :key="s.abbreviation"
                  :value="s.abbreviation"
                >
                  {{ s.abbreviation }} — {{ s.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Primary State of Practice
              </label>
              <select
                v-model="stateOfPractice"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="" disabled>Select state</option>
                <option
                  v-for="s in US_STATES"
                  :key="s.abbreviation"
                  :value="s.abbreviation"
                >
                  {{ s.abbreviation }} — {{ s.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Additional Telehealth States — Optional
              </label>
              <p class="text-xs text-gray-500 mb-2">
                Select any other states where you see patients via telehealth.
              </p>
              <div class="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                <label
                  v-for="s in US_STATES"
                  :key="s.abbreviation"
                  class="flex items-center gap-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="telehealthStates.includes(s.abbreviation)"
                    @change="toggleTelehealthState(s.abbreviation)"
                    class="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span class="text-xs text-gray-700">{{ s.abbreviation }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="flex justify-between">
            <button
              @click="currentStep = 1"
              class="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              :disabled="!step2Valid"
              @click="currentStep = 3"
              class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>

        <!-- ── Step 3: Supervision Status ────────────────────────────────────── -->
        <div v-if="currentStep === 3" class="bg-white rounded-xl border border-gray-200 p-6">
          <h2 class="text-xl font-semibold text-gray-900 mb-2">Supervision Status</h2>
          <p class="text-sm text-gray-500 mb-5">
            This determines whether billing features will be available for your account.
          </p>

          <div class="space-y-3 mb-5">
            <label class="flex items-start gap-3 cursor-pointer border border-gray-200 rounded-lg p-4 hover:border-teal-400 transition-colors"
              :class="isIndependentlyLicensed === true ? 'border-teal-500 bg-teal-50' : ''">
              <input
                v-model="isIndependentlyLicensed"
                type="radio"
                :value="true"
                class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
              />
              <div>
                <p class="text-sm font-medium text-gray-900">I am fully independently licensed</p>
                <p class="text-xs text-gray-500 mt-0.5">
                  Billing features will be enabled when setup is complete.
                </p>
              </div>
            </label>

            <label class="flex items-start gap-3 cursor-pointer border border-gray-200 rounded-lg p-4 hover:border-amber-400 transition-colors"
              :class="isIndependentlyLicensed === false ? 'border-amber-400 bg-amber-50' : ''">
              <input
                v-model="isIndependentlyLicensed"
                type="radio"
                :value="false"
                class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
              />
              <div>
                <p class="text-sm font-medium text-gray-900">I am currently under clinical supervision</p>
                <p class="text-xs text-gray-500 mt-0.5">
                  All clinical features are available. Billing features unlock when your supervision status changes.
                </p>
              </div>
            </label>
          </div>

          <!-- Supervision warning -->
          <div
            v-if="isIndependentlyLicensed === false"
            class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5"
          >
            <div class="flex items-start gap-2">
              <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div class="text-sm text-amber-800">
                <p class="font-medium mb-1">Billing features will be locked until you update your status.</p>
                <p>
                  You can use all clinical features of Datable now. When you receive your
                  independent license, update your status in Settings → Credentials to unlock billing.
                </p>
              </div>
            </div>
          </div>

          <div v-if="saveError" class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {{ saveError }}
          </div>

          <div class="flex justify-between">
            <button
              @click="currentStep = 2"
              class="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>

            <div class="flex gap-3">
              <!-- Supervised: "Save & Go to Dashboard" -->
              <button
                v-if="isIndependentlyLicensed === false"
                :disabled="isSaving"
                @click="saveAndContinue(true)"
                class="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
                Save &amp; Go to Dashboard
              </button>

              <!-- Independently licensed: "Continue" to review -->
              <button
                v-if="isIndependentlyLicensed === true"
                :disabled="isSaving"
                @click="saveAndContinue(false)"
                class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
                Continue
              </button>
            </div>
          </div>
        </div>

        <!-- ── Step 4: Review & Confirm ──────────────────────────────────────── -->
        <div v-if="currentStep === 4" class="bg-white rounded-xl border border-gray-200 p-6">
          <div class="flex items-center gap-2 mb-5">
            <CheckCircle2 class="w-5 h-5 text-teal-600" />
            <h2 class="text-xl font-semibold text-gray-900">Review & Confirm</h2>
          </div>

          <p class="text-sm text-gray-600 mb-6">
            Your credentials have been saved and verified. Review your information before going to the dashboard.
          </p>

          <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-6">
            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">NPI</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-900 font-mono">{{ npiInput }}</span>
                <CheckCircle2 class="w-3.5 h-3.5 text-teal-600" />
                <button
                  @click="currentStep = 1"
                  class="text-xs text-teal-600 hover:text-teal-700 underline ml-2"
                >
                  Edit
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">License Type</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-900">{{ licenseType }}</span>
                <button
                  @click="currentStep = 1"
                  class="text-xs text-teal-600 hover:text-teal-700 underline"
                >
                  Edit
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">License Number</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-900">{{ licenseNumber }}</span>
                <button
                  @click="currentStep = 2"
                  class="text-xs text-teal-600 hover:text-teal-700 underline"
                >
                  Edit
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">License Expiration</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-900">{{ licenseExpirationDate }}</span>
                <button
                  @click="currentStep = 2"
                  class="text-xs text-teal-600 hover:text-teal-700 underline"
                >
                  Edit
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">State of Licensure</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-900">{{ stateOfLicensure }}</span>
                <button
                  @click="currentStep = 2"
                  class="text-xs text-teal-600 hover:text-teal-700 underline"
                >
                  Edit
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">Supervision Status</span>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-900">
                  {{ isIndependentlyLicensed ? 'Independently Licensed' : 'Under Supervision' }}
                </span>
                <button
                  @click="currentStep = 3"
                  class="text-xs text-teal-600 hover:text-teal-700 underline"
                >
                  Edit
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-xs text-gray-500 uppercase tracking-wide">Billing Status</span>
              <span class="text-sm font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                Enabled
              </span>
            </div>
          </div>

          <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div class="flex items-start gap-2">
              <CheckCircle2 class="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              <p class="text-sm text-green-800">
                Your credentials are verified. You can now access all of Datable's clinical and
                billing features. Complete your billing profile setup to enable insurance claims.
              </p>
            </div>
          </div>

          <div class="flex justify-end">
            <button
              @click="emit('complete')"
              class="bg-teal-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-teal-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>
