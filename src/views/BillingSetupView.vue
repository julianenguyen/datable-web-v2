<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, Loader2, AlertTriangle, ChevronRight, Plus, Trash2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/layouts/AppLayout.vue'

const router = useRouter()
const auth = useAuthStore()

// ── Step state ────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5
const currentStep = ref<Step>(1)

const STEP_LABELS = [
  'Authorization',
  'NPI Verification',
  'License Details',
  'Billing Profile',
  'Payer Credentials',
]

// ── Step 1: Consent ───────────────────────────────────────────────────────────

const verificationConsent = ref(false)

// ── Step 2: NPI Verification ──────────────────────────────────────────────────

const npiInput = ref('')
const licenseType = ref('')
const npiVerified = ref(false)
const isVerifying = ref(false)
const npiVerificationResult = ref<{
  verified: boolean
  taxonomy_code?: string
  taxonomy_description?: string
  nppes_name?: string
  reason?: string
} | null>(null)

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

const npiVerificationErrorMessage = computed<string | null>(() => {
  const reason = npiVerificationResult.value?.reason
  if (!reason) return null
  const messages: Record<string, string> = {
    npi_not_found:
      'This NPI was not found in the NPPES registry. Please check the number and try again.',
    taxonomy_mismatch:
      'The license type you selected does not match the taxonomy code on file for this NPI in the NPPES registry. Please verify your license type.',
    organization_npi_not_accepted:
      'This appears to be an organization NPI (Type 2). Datable requires an individual provider NPI (Type 1).',
    oig_excluded:
      'We were unable to verify your credentials. Please contact support@datable.health for assistance.',
  }
  return messages[reason] ?? 'Verification failed. Please try again or contact support.'
})

async function handleVerifyNpi() {
  if (!npiInput.value || !licenseType.value) return
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

    const data = await res.json() as { verified: boolean; reason?: string; taxonomy_code?: string; taxonomy_description?: string; nppes_name?: string }
    npiVerificationResult.value = data
    npiVerified.value = data.verified === true
  } catch (e: unknown) {
    npiVerificationResult.value = { verified: false, reason: 'network_error' }
    npiVerified.value = false
    console.error('[BillingSetup/verify-npi]', String(e))
  } finally {
    isVerifying.value = false
  }
}

// ── Step 3: License Details ───────────────────────────────────────────────────

const licenseNumber = ref('')
const licenseState = ref('')
const licenseExpirationDate = ref('')
const groupNpi = ref('')
const isIndependentlyLicensed = ref<boolean | null>(null)

const todayIso = new Date().toISOString().split('T')[0]

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['DC','Washington DC'],
] as [string, string][]

const step3Valid = computed(() =>
  licenseNumber.value.trim().length > 0 &&
  licenseState.value.length > 0 &&
  licenseExpirationDate.value.length > 0 &&
  isIndependentlyLicensed.value !== null
)

// ── Step 4: Billing Profile ───────────────────────────────────────────────────

const tin = ref('')
const tinType = ref<'ssn' | 'ein'>('ein')
const tinSubmitted = ref(false)
const showUpdateTinModal = ref(false)
const tinUpdateInput = ref('')

const placeOfService = ref<'11' | '02' | '10'>('11')
const stateOfLicensure = ref('')
const stateOfPractice = ref('')
const telehealthStates = ref<string[]>([])
const medicaidProviderId = ref('')
const medicaidState = ref('')
const caqhId = ref('')
const billingContactEmail = ref('')

const step4Valid = computed(() =>
  (tinSubmitted.value || /^\d{9}$/.test(tin.value.replace(/\D/g, ''))) &&
  stateOfLicensure.value.length > 0 &&
  stateOfPractice.value.length > 0
)

function toggleTelehealthState(code: string) {
  const idx = telehealthStates.value.indexOf(code)
  if (idx >= 0) {
    telehealthStates.value.splice(idx, 1)
  } else {
    telehealthStates.value.push(code)
  }
}

function handleUpdateTin() {
  tin.value = tinUpdateInput.value.replace(/\D/g, '')
  tinSubmitted.value = false
  showUpdateTinModal.value = false
  tinUpdateInput.value = ''
}

// ── Step 5: Payer Credentials ─────────────────────────────────────────────────

interface PayerCredential {
  id?: string
  payer_name: string
  payer_type: string
  credentialing_effective_date: string
  payer_provider_id: string
  telehealth_modifier: string
}

const payers = ref<PayerCredential[]>([])
const showPayerForm = ref(false)
const payerForm = ref<PayerCredential>({
  payer_name: '',
  payer_type: 'commercial',
  credentialing_effective_date: '',
  payer_provider_id: '',
  telehealth_modifier: '',
})

const isSavingPayer = ref(false)
const payerError = ref<string | null>(null)

function resetPayerForm() {
  payerForm.value = {
    payer_name: '',
    payer_type: 'commercial',
    credentialing_effective_date: '',
    payer_provider_id: '',
    telehealth_modifier: '',
  }
  payerError.value = null
}

async function handleAddPayer() {
  if (!payerForm.value.payer_name || !payerForm.value.credentialing_effective_date) return
  isSavingPayer.value = true
  payerError.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/payer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payer_name: payerForm.value.payer_name,
        payer_type: payerForm.value.payer_type,
        credentialing_effective_date: payerForm.value.credentialing_effective_date,
        payer_provider_id: payerForm.value.payer_provider_id || undefined,
        telehealth_modifier: payerForm.value.telehealth_modifier || undefined,
      }),
    })

    const data = await res.json() as { success?: boolean; id?: string; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to save payer')

    payers.value.push({ ...payerForm.value, id: data.id })
    showPayerForm.value = false
    resetPayerForm()
  } catch (e: unknown) {
    payerError.value = e instanceof Error ? e.message : 'Failed to save payer'
  } finally {
    isSavingPayer.value = false
  }
}

async function handleDeletePayer(index: number) {
  const payer = payers.value[index]
  if (!payer.id) {
    payers.value.splice(index, 1)
    return
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    await fetch(`${EDGE_FUNCTION_URL}/credentials/payer/${payer.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    payers.value.splice(index, 1)
  } catch (e: unknown) {
    console.error('[BillingSetup/delete-payer]', String(e))
  }
}

// ── Global save ───────────────────────────────────────────────────────────────

const isSaving = ref(false)
const saveError = ref<string | null>(null)

async function handleComplete() {
  isSaving.value = true
  saveError.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    // 1. Save credentials
    const saveRes = await fetch(`${EDGE_FUNCTION_URL}/credentials/save`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        npi_individual: npiInput.value,
        npi_group: groupNpi.value || undefined,
        license_type: licenseType.value,
        license_number: licenseNumber.value,
        license_state: licenseState.value,
        license_expiration_date: licenseExpirationDate.value,
        is_independently_licensed: isIndependentlyLicensed.value ?? false,
        verification_consent_given: true,
      }),
    })
    if (!saveRes.ok) {
      const d = await saveRes.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to save credentials')
    }

    // 2. Save billing profile
    const rawTin = tin.value.replace(/\D/g, '')
    const profileRes = await fetch(`${EDGE_FUNCTION_URL}/credentials/billing-profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tin: rawTin,
        tin_type: tinType.value,
        default_place_of_service: placeOfService.value,
        caqh_id: caqhId.value || undefined,
        billing_contact_email: billingContactEmail.value || undefined,
        state_of_licensure: stateOfLicensure.value,
        state_of_practice: stateOfPractice.value,
        telehealth_states: telehealthStates.value,
        medicaid_provider_id: medicaidProviderId.value || undefined,
        medicaid_state: medicaidState.value || undefined,
      }),
    })
    if (!profileRes.ok) {
      const d = await profileRes.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to save billing profile')
    }

    tinSubmitted.value = true

    // 3. Mark billing onboarding complete
    const userId = auth.user?.id
    if (userId) {
      await supabase
        .from('therapists')
        .update({
          onboarding_billing_completed: true,
          onboarding_billing_completed_at: new Date().toISOString(),
        })
        .eq('id', userId)
    }

    router.push('/')
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'An error occurred. Please try again.'
  } finally {
    isSaving.value = false
  }
}

function goToStep(step: Step) {
  currentStep.value = step
}

function nextStep() {
  if (currentStep.value < 5) currentStep.value = (currentStep.value + 1) as Step
}
</script>

<template>
  <AppLayout>
    <div class="max-w-3xl mx-auto px-6 py-8">
      <!-- Step indicator -->
      <div class="flex items-center gap-0 mb-10">
        <template v-for="(label, idx) in STEP_LABELS" :key="idx">
          <div class="flex flex-col items-center">
            <button
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors"
              :class="
                currentStep === idx + 1
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : currentStep > idx + 1
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white border-gray-300 text-gray-400'
              "
              :disabled="currentStep <= idx"
              @click="currentStep > idx ? goToStep((idx + 1) as Step) : undefined"
            >
              <CheckCircle2 v-if="currentStep > idx + 1" class="w-4 h-4" />
              <span v-else>{{ idx + 1 }}</span>
            </button>
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

      <!-- ── Step 1: Authorization ─────────────────────────────────────────── -->
      <div v-if="currentStep === 1" class="bg-white rounded-xl border border-gray-200 p-6">
        <div class="border-l-4 border-teal-600 pl-4 mb-5">
          <h2 class="text-xl font-semibold text-gray-900">Credential Verification Authorization</h2>
        </div>
        <p class="text-sm text-gray-600 leading-relaxed mb-6">
          To access billing features, Datable Health is required to verify your professional credentials.
          By checking the box below, you authorize Datable Health to verify your credentials with the
          NPPES NPI Registry and the OIG List of Excluded Individuals and Entities as a condition of
          accessing billing features. This verification is required by CMS and commercial payer
          compliance standards.
        </p>
        <label class="flex items-start gap-3 cursor-pointer mb-8">
          <input
            v-model="verificationConsent"
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span class="text-sm text-gray-700">
            I authorize Datable Health to verify my credentials with the NPPES NPI Registry and the
            OIG List of Excluded Individuals and Entities.
          </span>
        </label>
        <div class="flex justify-end">
          <button
            :disabled="!verificationConsent"
            @click="nextStep"
            class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>

      <!-- ── Step 2: NPI Verification ──────────────────────────────────────── -->
      <div v-if="currentStep === 2" class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-5">NPI and License Verification</h2>

        <div class="space-y-4 mb-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">NPI Number</label>
            <input
              v-model="npiInput"
              type="text"
              maxlength="10"
              placeholder="10-digit NPI"
              :disabled="npiVerified"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

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
        </div>

        <!-- Verify button -->
        <button
          v-if="!npiVerified"
          :disabled="!npiInput || npiInput.length !== 10 || !licenseType || isVerifying"
          @click="handleVerifyNpi"
          class="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
        >
          <Loader2 v-if="isVerifying" class="w-4 h-4 animate-spin" />
          <span>{{ isVerifying ? 'Verifying with NPPES and OIG…' : 'Verify Credentials' }}</span>
        </button>

        <!-- Success state -->
        <div
          v-if="npiVerified && npiVerificationResult"
          class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4"
        >
          <div class="flex items-center gap-2 mb-2">
            <CheckCircle2 class="w-4 h-4 text-green-600" />
            <span class="text-sm font-semibold text-green-800">NPI Verified</span>
          </div>
          <p class="text-sm text-green-700">
            <strong>{{ npiVerificationResult.nppes_name }}</strong>
            — {{ npiVerificationResult.taxonomy_description }}
          </p>
        </div>

        <!-- Error state -->
        <div
          v-if="npiVerificationResult && !npiVerificationResult.verified"
          class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
        >
          <div class="flex items-start gap-2">
            <AlertTriangle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p class="text-sm text-red-700">{{ npiVerificationErrorMessage }}</p>
          </div>
        </div>

        <div class="flex justify-between mt-4">
          <button @click="goToStep(1)" class="text-sm text-gray-500 hover:text-gray-700">
            Back
          </button>
          <button
            :disabled="!npiVerified"
            @click="nextStep"
            class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>

      <!-- ── Step 3: License Details ────────────────────────────────────────── -->
      <div v-if="currentStep === 3" class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-5">License Details and Supervision Status</h2>

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
            <label class="block text-sm font-medium text-gray-700 mb-1">License State</label>
            <select
              v-model="licenseState"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" disabled>Select state</option>
              <option v-for="[code, name] in US_STATES" :key="code" :value="code">
                {{ code }} — {{ name }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">License Expiration Date</label>
            <input
              v-model="licenseExpirationDate"
              type="date"
              :min="todayIso"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Group Practice NPI (Type 2) — Optional
            </label>
            <input
              v-model="groupNpi"
              type="text"
              maxlength="10"
              placeholder="10-digit group NPI"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Supervision Status</label>
            <div class="space-y-2">
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="isIndependentlyLicensed"
                  type="radio"
                  :value="true"
                  class="h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                />
                <span class="text-sm text-gray-700">I am fully independently licensed</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="isIndependentlyLicensed"
                  type="radio"
                  :value="false"
                  class="h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                />
                <span class="text-sm text-gray-700">I am currently under clinical supervision</span>
              </label>
            </div>
          </div>

          <!-- Supervision warning -->
          <div
            v-if="isIndependentlyLicensed === false"
            class="bg-amber-50 border border-amber-200 rounded-lg p-4"
          >
            <div class="flex items-start gap-2">
              <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p class="text-sm text-amber-700">
                Billing features require independent licensure. You can still use all clinical
                features of Datable. Billing features will unlock automatically once you update your
                status to independently licensed.
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-between">
          <button @click="goToStep(2)" class="text-sm text-gray-500 hover:text-gray-700">
            Back
          </button>
          <button
            :disabled="!step3Valid"
            @click="nextStep"
            class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>

      <!-- ── Step 4: Billing Profile ────────────────────────────────────────── -->
      <div v-if="currentStep === 4" class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-5">Billing Profile</h2>

        <div class="space-y-5 mb-6">
          <!-- TIN -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Tax Identification Number (TIN)
            </label>
            <p class="text-xs text-gray-500 mb-2">
              Required for insurance billing. Stored encrypted and never displayed after entry.
            </p>
            <div v-if="tinSubmitted" class="flex items-center gap-3">
              <span class="text-sm text-gray-600 font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                TIN on file — ••••••••• (encrypted)
              </span>
              <button
                @click="showUpdateTinModal = true"
                class="text-xs text-teal-600 hover:text-teal-700 underline"
              >
                Update TIN
              </button>
            </div>
            <input
              v-else
              v-model="tin"
              type="password"
              maxlength="9"
              placeholder="9-digit TIN (no dashes)"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <!-- TIN Type -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">TIN Type</label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="tinType" type="radio" value="ssn" class="h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500" />
                <span class="text-sm text-gray-700">SSN (Sole Proprietor)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="tinType" type="radio" value="ein" class="h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500" />
                <span class="text-sm text-gray-700">EIN (Practice / Business)</span>
              </label>
            </div>
          </div>

          <!-- Place of Service -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Default Place of Service</label>
            <select
              v-model="placeOfService"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="11">11 — Office (In-Person)</option>
              <option value="02">02 — Telehealth (Patient Not at Home)</option>
              <option value="10">10 — Telehealth (Patient at Home)</option>
            </select>
          </div>

          <!-- State of Licensure -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">State of Licensure</label>
            <select
              v-model="stateOfLicensure"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" disabled>Select state</option>
              <option v-for="[code, name] in US_STATES" :key="code" :value="code">{{ code }} — {{ name }}</option>
            </select>
          </div>

          <!-- State of Practice -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">State of Practice</label>
            <select
              v-model="stateOfPractice"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" disabled>Select state</option>
              <option v-for="[code, name] in US_STATES" :key="code" :value="code">{{ code }} — {{ name }}</option>
            </select>
          </div>

          <!-- Telehealth States -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Additional Telehealth States — Optional
            </label>
            <p class="text-xs text-gray-500 mb-2">Select states where you see patients via telehealth.</p>
            <div class="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
              <label
                v-for="[code] in US_STATES"
                :key="code"
                class="flex items-center gap-1.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="telehealthStates.includes(code)"
                  @change="toggleTelehealthState(code)"
                  class="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span class="text-xs text-gray-700">{{ code }}</span>
              </label>
            </div>
          </div>

          <!-- Medicaid Provider ID -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              State Medicaid Provider ID — Optional
            </label>
            <input
              v-model="medicaidProviderId"
              type="text"
              placeholder="e.g. TX-MED-12345"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <!-- Medicaid State (shown only if Medicaid Provider ID is entered) -->
          <div v-if="medicaidProviderId.trim().length > 0">
            <label class="block text-sm font-medium text-gray-700 mb-1">Medicaid State</label>
            <select
              v-model="medicaidState"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="" disabled>Select state</option>
              <option v-for="[code, name] in US_STATES" :key="code" :value="code">{{ code }} — {{ name }}</option>
            </select>
          </div>

          <!-- CAQH ProView ID -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              CAQH ProView ID — Optional
            </label>
            <p class="text-xs text-gray-500 mb-2">
              If provided, Datable will remind you to re-attest every 110 days.
            </p>
            <input
              v-model="caqhId"
              type="text"
              placeholder="8-digit CAQH ID"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <!-- Billing Contact Email -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Billing Contact Email — Optional
            </label>
            <p class="text-xs text-gray-500 mb-2">Defaults to your account email.</p>
            <input
              v-model="billingContactEmail"
              type="email"
              placeholder="billing@practice.com"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div class="flex justify-between">
          <button @click="goToStep(3)" class="text-sm text-gray-500 hover:text-gray-700">
            Back
          </button>
          <button
            :disabled="!step4Valid"
            @click="nextStep"
            class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>

      <!-- ── Step 5: Payer Credentials ──────────────────────────────────────── -->
      <div v-if="currentStep === 5" class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-1">Commercial Payer Credentialing</h2>
        <p class="text-sm text-gray-500 mb-5">
          Add any payers you are currently credentialed with. You can skip this step and add payers later.
        </p>

        <!-- Payer table -->
        <div v-if="payers.length > 0" class="mb-4">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200">
                <th class="text-left text-xs font-medium text-gray-500 pb-2">Payer Name</th>
                <th class="text-left text-xs font-medium text-gray-500 pb-2">Type</th>
                <th class="text-left text-xs font-medium text-gray-500 pb-2">Effective Date</th>
                <th class="text-left text-xs font-medium text-gray-500 pb-2">Modifier</th>
                <th class="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(payer, idx) in payers"
                :key="idx"
                class="border-b border-gray-100 last:border-0"
              >
                <td class="py-2 text-gray-900">{{ payer.payer_name }}</td>
                <td class="py-2 capitalize text-gray-600">{{ payer.payer_type }}</td>
                <td class="py-2 text-gray-600">{{ payer.credentialing_effective_date }}</td>
                <td class="py-2 text-gray-600">{{ payer.telehealth_modifier || '—' }}</td>
                <td class="py-2">
                  <button
                    @click="handleDeletePayer(idx)"
                    class="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Add payer button -->
        <button
          v-if="!showPayerForm"
          @click="showPayerForm = true"
          class="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium mb-4"
        >
          <Plus class="w-4 h-4" />
          Add Payer
        </button>

        <!-- Add payer form -->
        <div v-if="showPayerForm" class="border border-gray-200 rounded-lg p-4 mb-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Payer Name</label>
            <input
              v-model="payerForm.payer_name"
              type="text"
              placeholder="e.g. Blue Cross Blue Shield of Texas"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Payer Type</label>
            <select
              v-model="payerForm.payer_type"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="medicare">Medicare</option>
              <option value="medicaid">Medicaid</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Credentialing Effective Date</label>
            <input
              v-model="payerForm.credentialing_effective_date"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Payer Provider ID — Optional</label>
            <input
              v-model="payerForm.payer_provider_id"
              type="text"
              placeholder="e.g. BCBS-TX-98765"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Telehealth Modifier</label>
            <select
              v-model="payerForm.telehealth_modifier"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">None</option>
              <option value="95">95 — Synchronous Telehealth</option>
              <option value="GT">GT — Interactive Audio/Video</option>
            </select>
          </div>

          <div v-if="payerError" class="text-sm text-red-600">{{ payerError }}</div>

          <div class="flex gap-3">
            <button
              :disabled="!payerForm.payer_name || !payerForm.credentialing_effective_date || isSavingPayer"
              @click="handleAddPayer"
              class="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Loader2 v-if="isSavingPayer" class="w-3.5 h-3.5 animate-spin" />
              Save Payer
            </button>
            <button
              @click="showPayerForm = false; resetPayerForm()"
              class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Skip link -->
        <p class="text-xs text-gray-400 mb-6">
          <a href="#" @click.prevent="handleComplete" class="underline hover:text-gray-600">
            Skip for now
          </a>
          — you can add payers later in Settings.
        </p>

        <div v-if="saveError" class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p class="text-sm text-red-700">{{ saveError }}</p>
        </div>

        <div class="flex justify-between">
          <button @click="goToStep(4)" class="text-sm text-gray-500 hover:text-gray-700">
            Back
          </button>
          <button
            :disabled="isSaving"
            @click="handleComplete"
            class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
            Complete Billing Setup
          </button>
        </div>
      </div>
    </div>

    <!-- Update TIN modal -->
    <Teleport to="body">
      <div
        v-if="showUpdateTinModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
        @click.self="showUpdateTinModal = false"
      >
        <div class="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm">
          <h3 class="text-base font-semibold text-gray-900 mb-3">Update TIN</h3>
          <p class="text-sm text-gray-500 mb-4">
            Enter your new 9-digit Tax Identification Number. This will replace the existing TIN on file.
          </p>
          <input
            v-model="tinUpdateInput"
            type="password"
            maxlength="9"
            placeholder="9-digit TIN (no dashes)"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div class="flex gap-3 justify-end">
            <button
              @click="showUpdateTinModal = false"
              class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
            >
              Cancel
            </button>
            <button
              :disabled="!/^\d{9}$/.test(tinUpdateInput)"
              @click="handleUpdateTin"
              class="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Update
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </AppLayout>
</template>
