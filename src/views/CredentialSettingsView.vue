<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/layouts/AppLayout.vue'

const auth = useAuthStore()

interface CredentialData {
  npi_verified: boolean
  npi_individual: string
  license_type: string
  license_number: string
  license_state: string
  license_expiration_date: string
  is_independently_licensed: boolean
  oig_excluded: boolean
  billing_enabled: boolean
  billing_lock_reason: string | null
  caqh_id: string | null
}

const credential = ref<CredentialData | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)

// Edit state
const licenseExpirationDate = ref('')
const isIndependentlyLicensed = ref<boolean>(true)
const caqhId = ref('')

const isSaving = ref(false)
const saveSuccess = ref(false)
const saveError = ref<string | null>(null)

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

async function loadCredentials() {
  loading.value = true
  loadError.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })

    if (!res.ok) throw new Error('Failed to load credential status')
    const statusData = await res.json() as { onboarding_complete: boolean; [key: string]: unknown }

    if (!statusData.onboarding_complete) {
      loadError.value = 'No credential record found. Please complete billing setup first.'
      return
    }

    // Fetch full credentials from Supabase directly (therapist can read own row via RLS)
    const userId = auth.user?.id
    if (!userId) return

    const { data, error } = await supabase
      .from('provider_credentials')
      .select(
        'npi_verified, npi_individual, license_type, license_number, license_state, ' +
        'license_expiration_date, is_independently_licensed, oig_excluded, ' +
        'billing_enabled, billing_lock_reason'
      )
      .eq('therapist_id', userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      loadError.value = 'No credential record found.'
      return
    }

    const { data: profileData } = await supabase
      .from('provider_billing_profile')
      .select('caqh_id')
      .eq('therapist_id', userId)
      .maybeSingle()

    credential.value = {
      ...(data as Omit<CredentialData, 'caqh_id'>),
      caqh_id: profileData?.caqh_id ?? null,
    }

    // Pre-populate edit fields
    licenseExpirationDate.value = data.license_expiration_date ?? ''
    isIndependentlyLicensed.value = data.is_independently_licensed ?? true
    caqhId.value = profileData?.caqh_id ?? ''
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load credentials'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!credential.value) return
  isSaving.value = true
  saveSuccess.value = false
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
        npi_individual: credential.value.npi_individual,
        license_type: credential.value.license_type,
        license_number: credential.value.license_number,
        license_state: credential.value.license_state,
        license_expiration_date: licenseExpirationDate.value,
        is_independently_licensed: isIndependentlyLicensed.value,
        verification_consent_given: true,
      }),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to save credentials')
    }

    // Update CAQH ID in billing profile if changed
    if (caqhId.value !== (credential.value.caqh_id ?? '')) {
      const userId = auth.user?.id
      if (userId) {
        await supabase
          .from('provider_billing_profile')
          .update({ caqh_id: caqhId.value || null, updated_at: new Date().toISOString() })
          .eq('therapist_id', userId)
      }
    }

    await loadCredentials()
    saveSuccess.value = true
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    isSaving.value = false
  }
}

onMounted(loadCredentials)
</script>

<template>
  <AppLayout>
    <div class="max-w-2xl mx-auto px-6 py-8">
      <div class="mb-6">
        <h1 class="text-2xl font-semibold text-gray-900">Credential Settings</h1>
        <p class="text-sm text-gray-500 mt-1">
          Update your license expiration date, supervision status, and CAQH ID.
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <Loader2 class="w-5 h-5 text-gray-400 animate-spin" />
      </div>

      <!-- Load error -->
      <div
        v-else-if="loadError"
        class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700"
      >
        {{ loadError }}
      </div>

      <!-- Content -->
      <div v-else-if="credential" class="space-y-6">
        <!-- Read-only NPI info -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Verified Credentials
          </h2>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-xs text-gray-500 mb-0.5">NPI (Individual)</p>
              <div class="flex items-center gap-1.5">
                <p class="text-gray-900 font-mono">{{ credential.npi_individual }}</p>
                <CheckCircle2
                  v-if="credential.npi_verified"
                  class="w-3.5 h-3.5 text-teal-600"
                />
              </div>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">License Type</p>
              <p class="text-gray-900">{{ credential.license_type }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">License Number</p>
              <p class="text-gray-900">{{ credential.license_number || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 mb-0.5">License State</p>
              <p class="text-gray-900">{{ credential.license_state || '—' }}</p>
            </div>
          </div>

          <!-- Billing status badge -->
          <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">Billing Status:</span>
              <span
                :class="[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  credential.billing_enabled
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-amber-50 text-amber-700',
                ]"
              >
                {{ credential.billing_enabled ? 'Enabled' : credential.billing_lock_reason ?? 'Locked' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Editable fields -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Update Details
          </h2>
          <div class="space-y-5">
            <!-- License Expiration Date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                License Expiration Date
              </label>
              <input
                v-model="licenseExpirationDate"
                type="date"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <!-- Supervision Status -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Supervision Status
              </label>
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
              <div
                v-if="!isIndependentlyLicensed"
                class="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3"
              >
                <div class="flex items-start gap-2">
                  <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p class="text-xs text-amber-700">
                    Billing features require independent licensure. Saving this status will lock
                    billing until you update to independently licensed.
                  </p>
                </div>
              </div>
            </div>

            <!-- CAQH ID -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">CAQH ProView ID</label>
              <p class="text-xs text-gray-500 mb-2">
                Datable will remind you to re-attest every 110 days if a CAQH ID is on file.
              </p>
              <input
                v-model="caqhId"
                type="text"
                placeholder="8-digit CAQH ProView ID"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        <!-- Save feedback -->
        <div
          v-if="saveSuccess"
          class="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-sm text-green-700"
        >
          <CheckCircle2 class="w-4 h-4" />
          Credentials updated successfully.
        </div>
        <div
          v-if="saveError"
          class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"
        >
          {{ saveError }}
        </div>

        <div class="flex justify-end">
          <button
            :disabled="isSaving || !licenseExpirationDate"
            @click="handleSave"
            class="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
