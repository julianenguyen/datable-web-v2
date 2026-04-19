<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import OnboardingLayout from './OnboardingLayout.vue'

const router = useRouter()
const auth = useAuthStore()
const onboarding = useOnboardingStore()

const individualNpi = ref('')
const licenseType = ref('')
const licenseState = ref('')
const licenseNumber = ref('')
const yearsInPractice = ref<number | null>(null)

const npiStatus = ref<'idle' | 'loading' | 'verified' | 'mismatch' | 'not_found' | 'error'>('idle')
const npiVerifiedName = ref('')
const npiTaxonomyCode = ref('')
const npiVerifiedAt = ref<string | null>(null)

const error = ref('')
const loading = ref(false)

const LICENSE_TYPES = [
  { value: 'LMFT', label: 'LMFT — Licensed Marriage & Family Therapist' },
  { value: 'LCSW', label: 'LCSW — Licensed Clinical Social Worker' },
  { value: 'LPC', label: 'LPC — Licensed Professional Counselor' },
  { value: 'PhD', label: 'PhD — Psychology' },
  { value: 'PsyD', label: 'PsyD — Psychology' },
  { value: 'MD', label: 'MD — Psychiatry' },
  { value: 'DO', label: 'DO — Osteopathic Medicine' },
  { value: 'NP', label: 'NP — Nurse Practitioner (Psych)' },
  { value: 'PA', label: 'PA — Physician Assistant' },
  { value: 'Other', label: 'Other' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'Washington DC',
}

interface NppesResult {
  result_count: number
  results: Array<{
    basic: {
      first_name: string
      last_name: string
      name?: string
      status: string
    }
    addresses: Array<{ city: string; state: string }>
    taxonomies: Array<{ code: string; primary: boolean }>
  }>
}

async function verifyNpi() {
  const npi = individualNpi.value.replace(/\D/g, '')
  if (npi.length !== 10) return

  npiStatus.value = 'loading'
  try {
    const res = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?number=${npi}&version=2.1`
    )
    const json: NppesResult = await res.json()

    if (!json.result_count || json.result_count === 0) {
      npiStatus.value = 'not_found'
      return
    }

    const provider = json.results[0]
    if (provider.basic.status !== 'A') {
      npiStatus.value = 'not_found'
      return
    }

    const providerName = `${provider.basic.first_name || ''} ${provider.basic.last_name || ''}`.trim().toLowerCase()
    const profileName = (auth.user?.user_metadata?.name as string || '').toLowerCase()

    npiVerifiedName.value = `${provider.basic.first_name || ''} ${provider.basic.last_name || ''}`.trim()
    npiTaxonomyCode.value = provider.taxonomies?.[0]?.code || ''
    npiVerifiedAt.value = new Date().toISOString()

    // Simple name match: check if either name includes a major part of the other
    const profileParts = profileName.split(' ').filter(p => p.length > 1)
    const nameMatches = profileParts.some(part => providerName.includes(part)) || providerName.includes(profileName)

    npiStatus.value = nameMatches ? 'verified' : 'mismatch'
  } catch {
    npiStatus.value = 'error'
    // Silently fail — NPI not required to be verified
  }
}

function onNpiBlur() {
  const npi = individualNpi.value.replace(/\D/g, '')
  if (npi.length === 10) {
    verifyNpi()
  }
}

const npiIsVerified = computed(() => npiStatus.value === 'verified' || npiStatus.value === 'mismatch')

const isValid = computed(() => {
  const npi = individualNpi.value.replace(/\D/g, '')
  return (
    npi.length === 10 &&
    npiStatus.value !== 'loading' &&
    npiStatus.value !== 'not_found' &&
    licenseType.value.length > 0 &&
    licenseState.value.length > 0 &&
    licenseNumber.value.trim().length > 0
  )
})

async function handleContinue() {
  if (!isValid.value || !auth.user || !onboarding.practiceId) return
  error.value = ''
  loading.value = true
  try {
    const profileName = (auth.user.user_metadata?.name as string) || ''
    const { error: dbError } = await supabase
      .from('clinicians')
      .insert({
        id: auth.user.id,
        practice_id: onboarding.practiceId,
        role: 'owner',
        name: profileName,
        email: auth.user.email!,
        individual_npi: individualNpi.value.replace(/\D/g, ''),
        npi_verified: npiStatus.value === 'verified',
        npi_verification_timestamp: npiIsVerified.value ? npiVerifiedAt.value : null,
        taxonomy_code: npiTaxonomyCode.value || null,
        license_type: licenseType.value,
        license_state: licenseState.value,
        license_number: licenseNumber.value.trim(),
        years_in_practice: yearsInPractice.value,
      })

    if (dbError) throw dbError

    onboarding.clinicianId = auth.user.id
    await onboarding.markStep('step_clinician_profile')
    router.push('/onboarding/insurance')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to save clinician profile. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <OnboardingLayout
    :current-step="3"
    title="Your clinician profile"
    subtitle="This information is used for credentialing and insurance documentation."
  >
    <template #back>
      <router-link
        to="/onboarding/practice"
        class="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5 -mt-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </router-link>
    </template>

    <form @submit.prevent="handleContinue" class="space-y-5" novalidate>
      <!-- NPI -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1.5">
          Individual NPI <span class="text-gray-400 font-normal">(Type 1)</span>
        </label>
        <input
          v-model="individualNpi"
          type="text"
          maxlength="10"
          required
          placeholder="10-digit NPI number"
          @blur="onNpiBlur"
          class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          :class="{
            'border-gray-300': npiStatus === 'idle' || npiStatus === 'loading',
            'border-green-400': npiStatus === 'verified',
            'border-yellow-400': npiStatus === 'mismatch',
            'border-red-400': npiStatus === 'not_found',
          }"
        />

        <!-- NPI status feedback -->
        <div class="mt-1.5">
          <div v-if="npiStatus === 'loading'" class="flex items-center gap-2 text-xs text-gray-500">
            <svg class="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Verifying with NPPES registry…
          </div>

          <p v-else-if="npiStatus === 'verified'" class="text-xs text-green-600 font-medium">
            ✓ Verified — {{ npiVerifiedName }}
          </p>

          <p v-else-if="npiStatus === 'mismatch'" class="text-xs text-yellow-600">
            ⚠ Found NPI but name on file is <strong>{{ npiVerifiedName }}</strong>. Confirm this is you.
          </p>

          <p v-else-if="npiStatus === 'not_found'" class="text-xs text-red-600">
            ✗ NPI not found in NPPES registry. Please check the number.
          </p>
        </div>
      </div>

      <hr class="border-gray-100" />

      <!-- License -->
      <div>
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Licensure</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">License type</label>
            <select
              v-model="licenseType"
              required
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            >
              <option value="" disabled>Select license type</option>
              <option v-for="lt in LICENSE_TYPES" :key="lt.value" :value="lt.value">{{ lt.label }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">State of licensure</label>
            <select
              v-model="licenseState"
              required
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            >
              <option value="" disabled>Select state</option>
              <option v-for="abbr in US_STATES" :key="abbr" :value="abbr">
                {{ STATE_NAMES[abbr] || abbr }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">State license number</label>
            <input
              v-model="licenseNumber"
              type="text"
              required
              placeholder="e.g. MFT12345"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Years in practice <span class="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              v-model.number="yearsInPractice"
              type="number"
              min="0"
              max="60"
              placeholder="e.g. 8"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {{ error }}
      </div>

      <!-- Continue -->
      <button
        type="submit"
        :disabled="!isValid || loading"
        class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
      >
        <svg v-if="loading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {{ loading ? 'Saving…' : 'Continue' }}
      </button>
    </form>
  </OnboardingLayout>
</template>
