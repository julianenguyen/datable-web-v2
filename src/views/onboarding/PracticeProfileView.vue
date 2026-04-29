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

const practiceName = ref('')
const practiceType = ref<'solo' | 'group'>('solo')
const addressStreet = ref('')
const addressCity = ref('')
const addressState = ref('')
const addressZip = ref('')
const phone = ref('')
const groupNpi = ref('')
const taxId = ref('')
const website = ref('')

const error = ref('')
const loading = ref(false)

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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function onPhoneInput(e: Event) {
  const input = e.target as HTMLInputElement
  phone.value = formatPhone(input.value)
}

function formatTaxId(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

function onTaxIdInput(e: Event) {
  const input = e.target as HTMLInputElement
  taxId.value = formatTaxId(input.value)
}

const isValid = computed(() => {
  const phoneDigits = phone.value.replace(/\D/g, '')
  const taxDigits = taxId.value.replace(/\D/g, '')
  const hasGroupNpi = practiceType.value === 'group' ? groupNpi.value.replace(/\D/g, '').length === 10 : true
  return (
    practiceName.value.trim().length > 0 &&
    addressStreet.value.trim().length > 0 &&
    addressCity.value.trim().length > 0 &&
    addressState.value.length > 0 &&
    /^\d{5}$/.test(addressZip.value) &&
    phoneDigits.length === 10 &&
    taxDigits.length === 9 &&
    hasGroupNpi
  )
})

async function handleContinue() {
  if (!isValid.value || !auth.user) return
  error.value = ''
  loading.value = true
  try {
    const insertData: Record<string, unknown> = {
      owner_id: auth.user.id,
      name: practiceName.value.trim(),
      practice_type: practiceType.value,
      address_street: addressStreet.value.trim(),
      address_city: addressCity.value.trim(),
      address_state: addressState.value,
      address_zip: addressZip.value,
      phone: phone.value,
      tax_id: taxId.value,
    }
    if (website.value.trim()) insertData.website = website.value.trim()
    if (practiceType.value === 'group' && groupNpi.value.trim()) {
      insertData.group_npi = groupNpi.value.trim()
    }

    const { data, error: dbError } = await supabase
      .from('practices')
      .insert(insertData)
      .select('id')
      .single()

    if (dbError) throw dbError

    onboarding.practiceId = data.id
    await onboarding.markStep('step_practice_profile', { practice_id: data.id })
    router.push('/onboarding/clinician')
  } catch (e: unknown) {
    error.value = (e as { message?: string })?.message ?? 'Failed to save practice. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <OnboardingLayout
    :current-step="2"
    title="Practice profile"
    subtitle="Tell us about your practice. This information is used for billing and HIPAA compliance."
  >
    <form @submit.prevent="handleContinue" class="space-y-6" novalidate>
      <!-- Practice Details section -->
      <div>
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Practice details</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Practice name</label>
            <input
              v-model="practiceName"
              type="text"
              required
              placeholder="Smith Therapy Group"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Practice type</label>
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                @click="practiceType = 'solo'"
                class="relative border-2 rounded-xl p-4 text-left transition-all"
                :class="practiceType === 'solo' ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'"
              >
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                    :class="practiceType === 'solo' ? 'border-teal-600' : 'border-gray-300'">
                    <div v-if="practiceType === 'solo'" class="w-2 h-2 rounded-full bg-teal-600" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">Solo practice</p>
                    <p class="text-xs text-gray-500 mt-0.5">Just me</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                @click="practiceType = 'group'"
                class="relative border-2 rounded-xl p-4 text-left transition-all"
                :class="practiceType === 'group' ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'"
              >
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                    :class="practiceType === 'group' ? 'border-teal-600' : 'border-gray-300'">
                    <div v-if="practiceType === 'group'" class="w-2 h-2 rounded-full bg-teal-600" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">Group practice</p>
                    <p class="text-xs text-gray-500 mt-0.5">Multiple clinicians</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <hr class="border-gray-100" />

      <!-- Location section -->
      <div>
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Location</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
            <input
              v-model="addressStreet"
              type="text"
              required
              placeholder="123 Main St, Suite 200"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">City</label>
              <input
                v-model="addressCity"
                type="text"
                required
                placeholder="San Francisco"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">ZIP code</label>
              <input
                v-model="addressZip"
                type="text"
                maxlength="5"
                pattern="\d{5}"
                required
                placeholder="94102"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">State</label>
            <select
              v-model="addressState"
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
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Business phone</label>
            <input
              :value="phone"
              @input="onPhoneInput"
              type="tel"
              required
              placeholder="(415) 555-0100"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      <!-- Divider -->
      <hr class="border-gray-100" />

      <!-- Business Information section -->
      <div>
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Business information</h3>
        <div class="space-y-4">
          <!-- Group NPI — only for group practices -->
          <div v-if="practiceType === 'group'">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Group NPI / Type 2 NPI
            </label>
            <input
              v-model="groupNpi"
              type="text"
              maxlength="10"
              placeholder="10-digit NPI"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
            <p class="mt-1 text-xs text-gray-400">Required for group practices billing under a Type 2 NPI.</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Tax ID / EIN</label>
            <input
              :value="taxId"
              @input="onTaxIdInput"
              type="text"
              maxlength="10"
              required
              placeholder="XX-XXXXXXX"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Practice website <span class="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              v-model="website"
              type="url"
              placeholder="https://www.yourpractice.com"
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
