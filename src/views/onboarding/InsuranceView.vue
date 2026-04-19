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

type PracticeSegment = 'insurance_primary' | 'mixed' | 'cash_pay' | 'sliding_scale'
type CredentialedStatus = 'yes' | 'no' | 'not_sure'

const practiceSegment = ref<PracticeSegment | null>(null)

const PAYERS: Array<{ key: string; name: string }> = [
  { key: 'aetna', name: 'Aetna' },
  { key: 'anthem', name: 'Anthem / Blue Cross Blue Shield' },
  { key: 'cigna', name: 'Cigna / Evernorth' },
  { key: 'united', name: 'UnitedHealthcare / Optum' },
  { key: 'humana', name: 'Humana' },
  { key: 'magellan', name: 'Magellan Health' },
  { key: 'beacon', name: 'Beacon Health Options / Carelon' },
  { key: 'medicare', name: 'Medicare' },
  { key: 'medicaid', name: 'Medicaid' },
  { key: 'tricare', name: 'Tricare' },
  { key: 'other', name: 'Other commercial insurance' },
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

// Track selected payers and their credentialing status
const selectedPayers = ref<Set<string>>(new Set())
const payerCredentialing = ref<Record<string, CredentialedStatus>>({})
const medicaidState = ref('')

const error = ref('')
const loading = ref(false)

const showPayerSelection = computed(
  () => practiceSegment.value === 'insurance_primary' || practiceSegment.value === 'mixed'
)

const showRoiEstimate = computed(
  () => practiceSegment.value !== null && selectedPayers.value.size > 0 && showPayerSelection.value
)

const showCashBenefits = computed(
  () => practiceSegment.value === 'cash_pay' || practiceSegment.value === 'sliding_scale'
)

function togglePayer(key: string) {
  if (selectedPayers.value.has(key)) {
    selectedPayers.value.delete(key)
    delete payerCredentialing.value[key]
  } else {
    selectedPayers.value.add(key)
    payerCredentialing.value[key] = 'not_sure'
  }
}

const SEGMENTS = [
  {
    value: 'insurance_primary' as PracticeSegment,
    label: 'Primarily insurance-based',
    description: 'Most of my clients use insurance',
    icon: '🏥',
  },
  {
    value: 'mixed' as PracticeSegment,
    label: 'Mixed',
    description: 'I see both insurance and cash-pay clients',
    icon: '⚖️',
  },
  {
    value: 'cash_pay' as PracticeSegment,
    label: 'Primarily cash pay',
    description: 'Most clients pay out of pocket',
    icon: '💳',
  },
  {
    value: 'sliding_scale' as PracticeSegment,
    label: 'Sliding scale / community',
    description: 'Community mental health or sliding scale',
    icon: '🤝',
  },
]

const isValid = computed(() => {
  if (!practiceSegment.value) return false
  if (showPayerSelection.value && selectedPayers.value.size === 0) return false
  // All selected payers must have a credentialing status
  for (const key of selectedPayers.value) {
    if (!payerCredentialing.value[key]) return false
  }
  return true
})

async function handleContinue() {
  if (!isValid.value || !onboarding.practiceId) return
  error.value = ''
  loading.value = true
  try {
    // Save practice_segment to practices table
    const { error: practiceErr } = await supabase
      .from('practices')
      .update({ practice_segment: practiceSegment.value })
      .eq('id', onboarding.practiceId)

    if (practiceErr) throw practiceErr

    // Save selected payers
    if (selectedPayers.value.size > 0) {
      const rows = [...selectedPayers.value].map(key => ({
        practice_id: onboarding.practiceId!,
        payer_key: key,
        payer_name: PAYERS.find(p => p.key === key)?.name ?? key,
        is_credentialed: payerCredentialing.value[key] ?? 'not_sure',
        state: key === 'medicaid' ? medicaidState.value || null : null,
      }))

      const { error: payerErr } = await supabase.from('practice_insurances').insert(rows)
      if (payerErr) throw payerErr
    }

    onboarding.practiceSegment = practiceSegment.value
    await onboarding.markStep('step_insurance_selected')
    router.push('/onboarding/baa')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to save insurance information. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <OnboardingLayout
    :current-step="4"
    title="Insurance &amp; billing model"
    subtitle="Tell us how your practice is structured so we can tailor your experience."
  >
    <template #back>
      <router-link
        to="/onboarding/clinician"
        class="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5 -mt-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </router-link>
    </template>

    <form @submit.prevent="handleContinue" class="space-y-6" novalidate>
      <!-- Part A: Practice segment -->
      <div>
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">How is your practice structured?</h3>
        <div class="grid grid-cols-1 gap-2">
          <button
            v-for="seg in SEGMENTS"
            :key="seg.value"
            type="button"
            @click="practiceSegment = seg.value"
            class="flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-all"
            :class="practiceSegment === seg.value ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'"
          >
            <div class="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
              :class="practiceSegment === seg.value ? 'border-teal-600' : 'border-gray-300'">
              <div v-if="practiceSegment === seg.value" class="w-2 h-2 rounded-full bg-teal-600" />
            </div>
            <div>
              <p class="text-sm font-medium text-gray-900">{{ seg.label }}</p>
              <p class="text-xs text-gray-500 mt-0.5">{{ seg.description }}</p>
            </div>
          </button>
        </div>
      </div>

      <!-- Part B: Payer selection (insurance or mixed) -->
      <div v-if="showPayerSelection">
        <hr class="border-gray-100 mb-6" />
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Which payers do you work with?</h3>
        <p class="text-xs text-gray-500 mb-4">Select all that apply. We'll use this to tailor documentation and CPT code suggestions.</p>

        <div class="space-y-2">
          <div
            v-for="payer in PAYERS"
            :key="payer.key"
            class="border-2 rounded-xl overflow-hidden transition-all"
            :class="selectedPayers.has(payer.key) ? 'border-teal-600' : 'border-gray-200'"
          >
            <!-- Payer row -->
            <button
              type="button"
              @click="togglePayer(payer.key)"
              class="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div class="w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all"
                :class="selectedPayers.has(payer.key) ? 'border-teal-600 bg-teal-600' : 'border-gray-300'">
                <svg v-if="selectedPayers.has(payer.key)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span class="text-sm text-gray-900">{{ payer.name }}</span>
            </button>

            <!-- Credentialing question — shown when selected -->
            <div v-if="selectedPayers.has(payer.key)" class="px-3 pb-3 bg-teal-50 border-t border-teal-100">
              <p class="text-xs text-gray-600 mt-2 mb-2">Are you credentialed with {{ payer.name }}?</p>
              <div class="flex gap-2">
                <button
                  v-for="opt in [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }] as Array<{ value: CredentialedStatus; label: string }>"
                  :key="opt.value"
                  type="button"
                  @click="payerCredentialing[payer.key] = opt.value"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border-2 transition-all"
                  :class="payerCredentialing[payer.key] === opt.value
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-gray-300 text-gray-600 hover:border-teal-400'"
                >
                  {{ opt.label }}
                </button>
              </div>

              <!-- Medicaid state dropdown -->
              <div v-if="payer.key === 'medicaid'" class="mt-3">
                <label class="block text-xs text-gray-600 mb-1">Which state's Medicaid?</label>
                <select
                  v-model="medicaidState"
                  class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                >
                  <option value="" disabled>Select state</option>
                  <option v-for="abbr in US_STATES" :key="abbr" :value="abbr">
                    {{ STATE_NAMES[abbr] || abbr }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- ROI Estimate -->
        <div v-if="showRoiEstimate" class="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p class="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Estimated billing potential</p>
          <p class="text-sm text-blue-800 font-medium">Based on 20 active clients</p>
          <p class="text-sm text-blue-900 font-semibold mt-1">$2,400 – $4,800 / month</p>
          <p class="text-xs text-blue-600 mt-2 leading-relaxed">
            Estimated CPT 99484 / 99492–99494 billing range. Based on published CMS reimbursement rates. Actual reimbursement varies by payer and region.
          </p>
        </div>
      </div>

      <!-- Cash-pay / sliding scale benefits -->
      <div v-if="showCashBenefits" class="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">What Datable Health offers your practice</p>
        <ul class="space-y-2">
          <li class="flex items-start gap-2 text-sm text-gray-700">
            <span class="text-teal-600 mt-0.5">✓</span>
            <span>AI-powered session documentation reduces admin time by up to 70%</span>
          </li>
          <li class="flex items-start gap-2 text-sm text-gray-700">
            <span class="text-teal-600 mt-0.5">✓</span>
            <span>Automated between-session check-ins keep clients engaged and accountable</span>
          </li>
          <li class="flex items-start gap-2 text-sm text-gray-700">
            <span class="text-teal-600 mt-0.5">✓</span>
            <span>Pre-session briefs mean you walk in prepared — every single session</span>
          </li>
        </ul>
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
