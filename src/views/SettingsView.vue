<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/layouts/AppLayout.vue'

const auth = useAuthStore()

type Tab = 'account' | 'practice' | 'clinician' | 'insurance'
const activeTab = ref<Tab>('account')
const isLegacyAccount = ref(false)

const successMessage = ref('')
const errorMessage = ref('')
const loading = ref(false)

function showSuccess(msg: string) {
  successMessage.value = msg
  errorMessage.value = ''
  setTimeout(() => { successMessage.value = '' }, 3000)
}

// ─── Account tab ───────────────────────────────────────────────────────────────
const accountName = ref('')
const accountEmail = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

function loadAccountFields() {
  accountName.value = auth.profile?.name || (auth.user?.user_metadata?.name as string) || ''
  accountEmail.value = auth.user?.email || ''
}

async function saveAccount() {
  if (!accountName.value.trim()) return
  errorMessage.value = ''
  loading.value = true
  try {
    const updates: { data?: { name: string }; email?: string; password?: string } = {}
    updates.data = { name: accountName.value.trim() }
    if (accountEmail.value.trim() && accountEmail.value !== auth.user?.email) {
      updates.email = accountEmail.value.trim()
    }
    if (newPassword.value) {
      if (!currentPassword.value) {
        errorMessage.value = 'Please enter your current password.'
        return
      }
      if (newPassword.value !== confirmPassword.value) {
        errorMessage.value = 'Passwords do not match.'
        return
      }
      if (newPassword.value.length < 8) {
        errorMessage.value = 'New password must be at least 8 characters.'
        return
      }
      // Verify current password before allowing the change
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: auth.user!.email!,
        password: currentPassword.value,
      })
      if (reauthError) {
        errorMessage.value = 'Current password is incorrect.'
        return
      }
      updates.password = newPassword.value
    }
    const { error } = await supabase.auth.updateUser(updates)
    if (error) throw error

    // Also update name in whichever table this account lives in
    if (auth.user) {
      if (isLegacyAccount.value) {
        await supabase.from('therapists').update({ name: accountName.value.trim() }).eq('id', auth.user.id)
      } else {
        await supabase.from('clinicians').update({ name: accountName.value.trim() }).eq('id', auth.user.id)
      }
    }

    await auth.loadProfile(auth.user!.id)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    showSuccess('Account updated.')
  } catch (e: unknown) {
    errorMessage.value = (e as { message?: string })?.message ?? 'Failed to update account.'
  } finally {
    loading.value = false
  }
}

// ─── Practice tab ──────────────────────────────────────────────────────────────
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
const practiceId = ref<string | null>(null)

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
  phone.value = formatPhone((e.target as HTMLInputElement).value)
}

function formatTaxId(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}
function onTaxIdInput(e: Event) {
  taxId.value = formatTaxId((e.target as HTMLInputElement).value)
}

async function loadPractice() {
  if (!auth.user) return

  // Try clinicians table first (new accounts)
  const { data: clinician } = await supabase
    .from('clinicians')
    .select('practice_id')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (clinician?.practice_id) {
    practiceId.value = clinician.practice_id
    const { data: p } = await supabase.from('practices').select('*').eq('id', clinician.practice_id).single()
    if (!p) return
    practiceName.value = p.name ?? ''
    practiceType.value = p.practice_type ?? 'solo'
    addressStreet.value = p.address_street ?? ''
    addressCity.value = p.address_city ?? ''
    addressState.value = p.address_state ?? ''
    addressZip.value = p.address_zip ?? ''
    phone.value = p.phone ?? ''
    groupNpi.value = p.group_npi ?? ''
    taxId.value = p.tax_id ?? ''
    website.value = p.website ?? ''
    return
  }

  // Fall back to therapists table (legacy accounts)
  const { data: therapist } = await supabase
    .from('therapists')
    .select('name, practice_name, license_type')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (therapist) {
    isLegacyAccount.value = true
    practiceName.value = therapist.practice_name ?? ''
  }
}

const practiceValid = computed(() => {
  const phoneDigits = phone.value.replace(/\D/g, '')
  const taxDigits = taxId.value.replace(/\D/g, '')
  return (
    practiceName.value.trim().length > 0 &&
    addressStreet.value.trim().length > 0 &&
    addressCity.value.trim().length > 0 &&
    addressState.value.length > 0 &&
    /^\d{5}$/.test(addressZip.value) &&
    phoneDigits.length === 10 &&
    taxDigits.length === 9
  )
})

async function savePractice() {
  if (isLegacyAccount.value) {
    if (!practiceName.value.trim() || !auth.user) return
    errorMessage.value = ''
    loading.value = true
    try {
      const { error } = await supabase.from('therapists').update({ practice_name: practiceName.value.trim() }).eq('id', auth.user.id)
      if (error) throw error
      await auth.loadProfile(auth.user.id)
      showSuccess('Practice name updated.')
    } catch (e: unknown) {
      errorMessage.value = (e as { message?: string })?.message ?? 'Failed to update.'
    } finally {
      loading.value = false
    }
    return
  }
  if (!practiceValid.value || !practiceId.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    const updateData: Record<string, unknown> = {
      name: practiceName.value.trim(),
      practice_type: practiceType.value,
      address_street: addressStreet.value.trim(),
      address_city: addressCity.value.trim(),
      address_state: addressState.value,
      address_zip: addressZip.value,
      phone: phone.value,
      tax_id: taxId.value,
      website: website.value.trim() || null,
    }
    if (practiceType.value === 'group' && groupNpi.value.trim()) {
      updateData.group_npi = groupNpi.value.trim()
    }
    const { error } = await supabase.from('practices').update(updateData).eq('id', practiceId.value)
    if (error) throw error
    await auth.loadProfile(auth.user!.id)
    showSuccess('Practice information updated.')
  } catch (e: unknown) {
    errorMessage.value = (e as { message?: string })?.message ?? 'Failed to update practice.'
  } finally {
    loading.value = false
  }
}

// ─── Clinician tab ─────────────────────────────────────────────────────────────
const individualNpi = ref('')
const licenseType = ref('')
const licenseState = ref('')
const licenseNumber = ref('')
const yearsInPractice = ref<number | null>(null)
const npiStatus = ref<'idle' | 'loading' | 'verified' | 'mismatch' | 'not_found' | 'error'>('idle')
const npiVerifiedName = ref('')
const npiTaxonomyCode = ref('')
const npiVerifiedAt = ref<string | null>(null)

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

interface NpiLookupResult {
  found: boolean
  active?: boolean
  first_name?: string
  last_name?: string
  taxonomy_code?: string
}

async function verifyNpi() {
  const npi = individualNpi.value.replace(/\D/g, '')
  if (npi.length !== 10) return
  npiStatus.value = 'loading'
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/npi-lookup?npi=${npi}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    const data: NpiLookupResult = await res.json()

    if (!data.found) { npiStatus.value = 'not_found'; return }
    if (!data.active) { npiStatus.value = 'not_found'; return }

    const providerName = `${data.first_name || ''} ${data.last_name || ''}`.trim().toLowerCase()
    const profileName = (auth.user?.user_metadata?.name as string || '').toLowerCase()
    npiVerifiedName.value = `${data.first_name || ''} ${data.last_name || ''}`.trim()
    npiTaxonomyCode.value = data.taxonomy_code || ''
    npiVerifiedAt.value = new Date().toISOString()
    const profileParts = profileName.split(' ').filter(p => p.length > 1)
    const nameMatches = profileParts.some(part => providerName.includes(part)) || providerName.includes(profileName)
    npiStatus.value = nameMatches ? 'verified' : 'mismatch'
  } catch {
    npiStatus.value = 'error'
  }
}
function onNpiBlur() {
  if (individualNpi.value.replace(/\D/g, '').length === 10) verifyNpi()
}

async function loadClinician() {
  if (!auth.user) return
  if (isLegacyAccount.value) {
    const { data } = await supabase
      .from('therapists')
      .select('license_type')
      .eq('id', auth.user.id)
      .maybeSingle()
    if (data) licenseType.value = data.license_type ?? ''
    return
  }
  const { data } = await supabase
    .from('clinicians')
    .select('individual_npi, license_type, license_state, license_number, years_in_practice')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (!data) return
  individualNpi.value = data.individual_npi ?? ''
  licenseType.value = data.license_type ?? ''
  licenseState.value = data.license_state ?? ''
  licenseNumber.value = data.license_number ?? ''
  yearsInPractice.value = data.years_in_practice ?? null
  if (individualNpi.value.length === 10) npiStatus.value = 'idle'
}

const clinicianValid = computed(() => {
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

async function saveClinician() {
  if (isLegacyAccount.value) {
    if (!licenseType.value || !auth.user) return
    errorMessage.value = ''
    loading.value = true
    try {
      const { error } = await supabase.from('therapists').update({ license_type: licenseType.value }).eq('id', auth.user.id)
      if (error) throw error
      showSuccess('License type updated.')
    } catch (e: unknown) {
      errorMessage.value = (e as { message?: string })?.message ?? 'Failed to update.'
    } finally {
      loading.value = false
    }
    return
  }
  if (!clinicianValid.value || !auth.user) return
  errorMessage.value = ''
  loading.value = true
  try {
    const { error } = await supabase.from('clinicians').update({
      individual_npi: individualNpi.value.replace(/\D/g, ''),
      npi_verified: npiStatus.value === 'verified',
      npi_verification_timestamp: (npiStatus.value === 'verified' || npiStatus.value === 'mismatch') ? npiVerifiedAt.value : null,
      taxonomy_code: npiTaxonomyCode.value || null,
      license_type: licenseType.value,
      license_state: licenseState.value,
      license_number: licenseNumber.value.trim(),
      years_in_practice: yearsInPractice.value,
    }).eq('id', auth.user.id)
    if (error) throw error
    showSuccess('Clinician profile updated.')
  } catch (e: unknown) {
    errorMessage.value = (e as { message?: string })?.message ?? 'Failed to update clinician profile.'
  } finally {
    loading.value = false
  }
}

// ─── Insurance tab ─────────────────────────────────────────────────────────────
type PracticeSegment = 'insurance_primary' | 'mixed' | 'cash_pay' | 'sliding_scale'
type CredentialedStatus = 'yes' | 'no' | 'not_sure'

const practiceSegment = ref<PracticeSegment | null>(null)
const selectedPayers = ref<Set<string>>(new Set())
const payerCredentialing = ref<Record<string, CredentialedStatus>>({})
const medicaidState = ref('')

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

const SEGMENTS = [
  { value: 'insurance_primary' as PracticeSegment, label: 'Primarily insurance-based', description: 'Most of my clients use insurance' },
  { value: 'mixed' as PracticeSegment, label: 'Mixed', description: 'I see both insurance and cash-pay clients' },
  { value: 'cash_pay' as PracticeSegment, label: 'Primarily cash pay', description: 'Most clients pay out of pocket' },
  { value: 'sliding_scale' as PracticeSegment, label: 'Sliding scale / community', description: 'Community mental health or sliding scale' },
]

const showPayerSelection = computed(
  () => practiceSegment.value === 'insurance_primary' || practiceSegment.value === 'mixed'
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

async function loadInsurance() {
  if (!practiceId.value) {
    // Try to load practice_id if not loaded yet
    if (auth.user) {
      const { data } = await supabase.from('clinicians').select('practice_id').eq('id', auth.user.id).maybeSingle()
      if (data?.practice_id) practiceId.value = data.practice_id
    }
  }
  if (!practiceId.value) return

  const { data: p } = await supabase.from('practices').select('practice_segment').eq('id', practiceId.value).single()
  if (p?.practice_segment) practiceSegment.value = p.practice_segment as PracticeSegment

  const { data: insurances } = await supabase
    .from('practice_insurances')
    .select('payer_key, is_credentialed, state')
    .eq('practice_id', practiceId.value)

  if (insurances) {
    const newSet = new Set<string>()
    const newCred: Record<string, CredentialedStatus> = {}
    for (const ins of insurances) {
      newSet.add(ins.payer_key)
      newCred[ins.payer_key] = ins.is_credentialed as CredentialedStatus
      if (ins.payer_key === 'medicaid' && ins.state) medicaidState.value = ins.state
    }
    selectedPayers.value = newSet
    payerCredentialing.value = newCred
  }
}

const insuranceValid = computed(() => {
  if (!practiceSegment.value) return false
  if (showPayerSelection.value && selectedPayers.value.size === 0) return false
  return true
})

async function saveInsurance() {
  if (!insuranceValid.value || !practiceId.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    const { error: segErr } = await supabase
      .from('practices')
      .update({ practice_segment: practiceSegment.value })
      .eq('id', practiceId.value)
    if (segErr) throw segErr

    // Delete existing and re-insert
    await supabase.from('practice_insurances').delete().eq('practice_id', practiceId.value)

    if (selectedPayers.value.size > 0) {
      const rows = [...selectedPayers.value].map(key => ({
        practice_id: practiceId.value!,
        payer_key: key,
        payer_name: PAYERS.find(p => p.key === key)?.name ?? key,
        is_credentialed: payerCredentialing.value[key] ?? 'not_sure',
        state: key === 'medicaid' ? medicaidState.value || null : null,
      }))
      const { error: payerErr } = await supabase.from('practice_insurances').insert(rows)
      if (payerErr) throw payerErr
    }

    showSuccess('Insurance information updated.')
  } catch (e: unknown) {
    errorMessage.value = (e as { message?: string })?.message ?? 'Failed to update insurance information.'
  } finally {
    loading.value = false
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  loadAccountFields()
  await loadPractice()
  await loadClinician()
  await loadInsurance()
})
</script>

<template>
  <AppLayout>
    <div class="px-8 py-8 max-w-3xl">
      <h1 class="text-xl font-semibold text-gray-900 mb-6">Settings</h1>

      <!-- Tabs -->
      <div class="flex gap-0 border-b border-gray-200 mb-8">
        <button
          v-for="tab in [
            { key: 'account', label: 'Account' },
            { key: 'practice', label: 'Practice' },
            { key: 'clinician', label: 'Clinician' },
            { key: 'insurance', label: 'Insurance' },
          ]"
          :key="tab.key"
          @click="activeTab = tab.key as Tab; successMessage = ''; errorMessage = ''"
          class="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
          :class="activeTab === tab.key
            ? 'border-teal-600 text-teal-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Status messages -->
      <div v-if="successMessage" class="mb-5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {{ successMessage }}
      </div>
      <div v-if="errorMessage" class="mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
        {{ errorMessage }}
      </div>

      <!-- ── Account tab ── -->
      <div v-if="activeTab === 'account'" class="space-y-6">
        <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
            <input
              v-model="accountName"
              type="text"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
            <input
              v-model="accountEmail"
              type="email"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <p class="mt-1 text-xs text-gray-400">Changing your email will require re-verification.</p>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h3 class="text-sm font-semibold text-gray-700">Change password</h3>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Current password</label>
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              placeholder="Enter your current password"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="At least 8 characters"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        <button
          @click="saveAccount"
          :disabled="loading"
          class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {{ loading ? 'Saving…' : 'Save changes' }}
        </button>
      </div>

      <!-- ── Practice tab ── -->
      <div v-if="activeTab === 'practice'" class="space-y-6">
        <!-- Legacy account: only practice name is stored -->
        <template v-if="isLegacyAccount">
          <div class="bg-white rounded-xl border border-gray-200 p-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Practice name</label>
              <input v-model="practiceName" type="text" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
          </div>
          <button @click="savePractice" :disabled="loading"
            class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            {{ loading ? 'Saving…' : 'Save changes' }}
          </button>
        </template>
        <div v-else-if="!practiceId" class="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          No practice profile found. Please complete onboarding first.
        </div>
        <template v-else>
          <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Practice details</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Practice name</label>
              <input v-model="practiceName" type="text" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Practice type</label>
              <div class="grid grid-cols-2 gap-3">
                <button type="button" @click="practiceType = 'solo'"
                  class="border-2 rounded-xl p-3 text-left transition-all text-sm font-medium"
                  :class="practiceType === 'solo' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'"
                >Solo practice</button>
                <button type="button" @click="practiceType = 'group'"
                  class="border-2 rounded-xl p-3 text-left transition-all text-sm font-medium"
                  :class="practiceType === 'group' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'"
                >Group practice</button>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Street address</label>
              <input v-model="addressStreet" type="text" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                <input v-model="addressCity" type="text" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">ZIP code</label>
                <input v-model="addressZip" type="text" maxlength="5" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">State</label>
              <select v-model="addressState" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
                <option value="" disabled>Select state</option>
                <option v-for="abbr in US_STATES" :key="abbr" :value="abbr">{{ STATE_NAMES[abbr] || abbr }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Business phone</label>
              <input :value="phone" @input="onPhoneInput" type="tel" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Business information</h3>
            <div v-if="practiceType === 'group'">
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Group NPI / Type 2 NPI</label>
              <input v-model="groupNpi" type="text" maxlength="10" placeholder="10-digit NPI" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Tax ID / EIN</label>
              <input :value="taxId" @input="onTaxIdInput" type="text" maxlength="10" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Practice website <span class="text-gray-400 font-normal">(optional)</span></label>
              <input v-model="website" type="url" placeholder="https://www.yourpractice.com" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400" />
            </div>
          </div>

          <button @click="savePractice" :disabled="!practiceValid || loading"
            class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            {{ loading ? 'Saving…' : 'Save changes' }}
          </button>
        </template>
      </div>

      <!-- ── Clinician tab ── -->
      <div v-if="activeTab === 'clinician'" class="space-y-6">
        <!-- Legacy: only license type is stored -->
        <template v-if="isLegacyAccount">
          <div class="bg-white rounded-xl border border-gray-200 p-6">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">License type</label>
            <select v-model="licenseType" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
              <option value="" disabled>Select license type</option>
              <option v-for="lt in LICENSE_TYPES" :key="lt.value" :value="lt.value">{{ lt.label }}</option>
            </select>
          </div>
          <button @click="saveClinician" :disabled="!licenseType || loading"
            class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            {{ loading ? 'Saving…' : 'Save changes' }}
          </button>
        </template>
        <template v-else>
        <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Individual NPI <span class="text-gray-400 font-normal">(Type 1)</span></label>
            <input
              v-model="individualNpi"
              type="text"
              maxlength="10"
              @blur="onNpiBlur"
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              :class="{
                'border-gray-300': npiStatus === 'idle' || npiStatus === 'loading',
                'border-green-400': npiStatus === 'verified',
                'border-yellow-400': npiStatus === 'mismatch',
                'border-red-400': npiStatus === 'not_found',
              }"
            />
            <div class="mt-1.5">
              <div v-if="npiStatus === 'loading'" class="flex items-center gap-2 text-xs text-gray-500">
                <svg class="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying with NPPES registry…
              </div>
              <p v-else-if="npiStatus === 'verified'" class="text-xs text-green-600 font-medium">✓ Verified — {{ npiVerifiedName }}</p>
              <p v-else-if="npiStatus === 'mismatch'" class="text-xs text-yellow-600">⚠ Found NPI but name on file is <strong>{{ npiVerifiedName }}</strong>. Confirm this is you.</p>
              <p v-else-if="npiStatus === 'not_found'" class="text-xs text-red-600">✗ NPI not found in NPPES registry. Please check the number.</p>
            </div>
          </div>

          <hr class="border-gray-100" />

          <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Licensure</h3>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">License type</label>
            <select v-model="licenseType" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
              <option value="" disabled>Select license type</option>
              <option v-for="lt in LICENSE_TYPES" :key="lt.value" :value="lt.value">{{ lt.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">State of licensure</label>
            <select v-model="licenseState" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
              <option value="" disabled>Select state</option>
              <option v-for="abbr in US_STATES" :key="abbr" :value="abbr">{{ STATE_NAMES[abbr] || abbr }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">State license number</label>
            <input v-model="licenseNumber" type="text" placeholder="e.g. MFT12345" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Years in practice <span class="text-gray-400 font-normal">(optional)</span></label>
            <input v-model.number="yearsInPractice" type="number" min="0" max="60" placeholder="e.g. 8" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400" />
          </div>
        </div>

        <button @click="saveClinician" :disabled="!clinicianValid || loading"
          class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
          {{ loading ? 'Saving…' : 'Save changes' }}
        </button>
        </template>
      </div>

      <!-- ── Insurance tab ── -->
      <div v-if="activeTab === 'insurance'" class="space-y-6">
        <div v-if="isLegacyAccount" class="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          Insurance settings are not available for your account type.
        </div>
        <template v-else>
        <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Practice model</h3>
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

        <div v-if="showPayerSelection" class="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payers</h3>
          <div class="space-y-2">
            <div
              v-for="payer in PAYERS"
              :key="payer.key"
              class="border-2 rounded-xl overflow-hidden transition-all"
              :class="selectedPayers.has(payer.key) ? 'border-teal-600' : 'border-gray-200'"
            >
              <button type="button" @click="togglePayer(payer.key)"
                class="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors">
                <div class="w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center"
                  :class="selectedPayers.has(payer.key) ? 'border-teal-600 bg-teal-600' : 'border-gray-300'">
                  <svg v-if="selectedPayers.has(payer.key)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span class="text-sm text-gray-900">{{ payer.name }}</span>
              </button>
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
                  >{{ opt.label }}</button>
                </div>
                <div v-if="payer.key === 'medicaid'" class="mt-3">
                  <label class="block text-xs text-gray-600 mb-1">Which state's Medicaid?</label>
                  <select v-model="medicaidState" class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
                    <option value="" disabled>Select state</option>
                    <option v-for="abbr in US_STATES" :key="abbr" :value="abbr">{{ STATE_NAMES[abbr] || abbr }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button @click="saveInsurance" :disabled="!insuranceValid || loading"
          class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
          {{ loading ? 'Saving…' : 'Save changes' }}
        </button>
        </template>
      </div>
    </div>
  </AppLayout>
</template>
