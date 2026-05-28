<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { AlertTriangle, X, Loader2, CheckCircle2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { US_STATES } from '@/constants/states'

// ── Status types ──────────────────────────────────────────────────────────────

type WarningTier = 'yellow' | 'orange' | 'locked'

interface StatusData {
  expiration_warning_tier: WarningTier | null
  days_until_expiration: number | null
  license_number: string | null
  state_of_licensure: string | null
  license_expiration_date: string | null
  npi: string | null
  license_type: string | null
}

const status = ref<StatusData | null>(null)
const loaded = ref(false)

// ── Yellow tier dismissal (localStorage, 24-hour window) ──────────────────────

const DISMISS_KEY = 'expiration_banner_dismissed_until'

const isYellowDismissed = computed(() => {
  const until = localStorage.getItem(DISMISS_KEY)
  if (!until) return false
  return new Date(until) > new Date()
})

function dismissYellow() {
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  localStorage.setItem(DISMISS_KEY, until)
  // Force reactivity by reloading the status to re-evaluate computed
  loaded.value = false
  loaded.value = true
}

// ── Inline edit form (orange / locked) ───────────────────────────────────────

const showInlineForm = ref(false)
const editLicenseNumber = ref('')
const editLicenseExpiration = ref('')
const editLicenseState = ref('')
const isSaving = ref(false)
const saveSuccess = ref(false)
const saveError = ref<string | null>(null)

const todayIso = new Date().toISOString().split('T')[0]

const formValid = computed(() =>
  editLicenseNumber.value.trim().length > 0 &&
  editLicenseExpiration.value.length > 0 &&
  editLicenseState.value.length > 0
)

function openInlineForm() {
  editLicenseNumber.value = status.value?.license_number ?? ''
  editLicenseExpiration.value = status.value?.license_expiration_date ?? ''
  editLicenseState.value = status.value?.state_of_licensure ?? ''
  saveSuccess.value = false
  saveError.value = null
  showInlineForm.value = true
}

async function handleSave() {
  if (!formValid.value || !status.value) return
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
        npi_individual: status.value.npi ?? '',
        license_type: status.value.license_type ?? '',
        license_number: editLicenseNumber.value.trim(),
        license_state: editLicenseState.value,
        license_expiration_date: editLicenseExpiration.value,
        is_independently_licensed: true, // Updating license — assume independent (existing status)
        verification_consent_given: true,
      }),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to save credentials')
    }

    saveSuccess.value = true
    showInlineForm.value = false

    // Reload status to re-evaluate tier
    await loadStatus()
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'An error occurred. Please try again.'
  } finally {
    isSaving.value = false
  }
}

// ── Load status ───────────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    if (!token) return

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) return

    const data = await res.json() as StatusData
    status.value = data
  } catch {
    // Non-fatal — banner simply does not render
  } finally {
    loaded.value = true
  }
}

onMounted(loadStatus)

// ── Computed visibility ────────────────────────────────────────────────────────

const activeTier = computed<WarningTier | null>(() => {
  if (!loaded.value || !status.value) return null
  const tier = status.value.expiration_warning_tier
  if (!tier) return null
  if (tier === 'yellow' && isYellowDismissed.value) return null
  return tier
})
</script>

<template>
  <template v-if="activeTier !== null">

    <!-- ── Yellow: dismissible soft warning ──────────────────────────────────── -->
    <div
      v-if="activeTier === 'yellow'"
      class="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-start gap-3 text-sm"
      role="alert"
    >
      <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
      <span class="text-yellow-800 flex-1">
        Your license expires in
        <strong>{{ status!.days_until_expiration }} days</strong>.
        Please renew your license soon to avoid billing interruption.
        <a
          href="/settings/credentials"
          class="underline font-medium text-yellow-700 hover:text-yellow-900 ml-1"
          @click.prevent="$router.push('/settings/credentials')"
        >
          Update credentials
        </a>
      </span>
      <button
        @click="dismissYellow"
        class="text-yellow-500 hover:text-yellow-700 transition-colors shrink-0"
        title="Dismiss for 24 hours"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- ── Orange: urgent, non-dismissible, inline form ──────────────────────── -->
    <div
      v-else-if="activeTier === 'orange'"
      class="bg-amber-50 border-b border-amber-300"
      role="alert"
    >
      <div class="px-4 py-3 flex items-start gap-3 text-sm">
        <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div class="flex-1">
          <span class="text-amber-900 font-medium">
            License expires in {{ status!.days_until_expiration }} days.
          </span>
          <span class="text-amber-800 ml-1">
            Billing features will be suspended on your expiration date. Update your license to
            prevent service interruption.
          </span>

          <!-- Inline form toggle -->
          <div class="mt-2">
            <button
              v-if="!showInlineForm"
              @click="openInlineForm"
              class="text-xs font-medium text-amber-700 underline hover:text-amber-900"
            >
              Update license now
            </button>
          </div>

          <!-- Inline form -->
          <div v-if="showInlineForm" class="mt-3 bg-white border border-amber-200 rounded-lg p-4 space-y-3">
            <p class="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Update License Details
            </p>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">License Number</label>
              <input
                v-model="editLicenseNumber"
                type="text"
                placeholder="e.g. TX-12345"
                class="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">
                New Expiration Date
              </label>
              <input
                v-model="editLicenseExpiration"
                type="date"
                :min="todayIso"
                class="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">State of Licensure</label>
              <select
                v-model="editLicenseState"
                class="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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

            <div v-if="saveError" class="text-xs text-red-600">{{ saveError }}</div>

            <div class="flex gap-2">
              <button
                :disabled="!formValid || isSaving"
                @click="handleSave"
                class="bg-amber-600 text-white px-4 py-1.5 rounded-md text-xs font-medium hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Loader2 v-if="isSaving" class="w-3 h-3 animate-spin" />
                Save License
              </button>
              <button
                @click="showInlineForm = false"
                class="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>

          <div v-if="saveSuccess" class="mt-2 flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle2 class="w-3.5 h-3.5" />
            License updated successfully.
          </div>
        </div>
      </div>
    </div>

    <!-- ── Locked: critical, non-dismissible, inline form ────────────────────── -->
    <div
      v-else-if="activeTier === 'locked'"
      class="bg-red-50 border-b border-red-300"
      role="alert"
    >
      <div class="px-4 py-3 flex items-start gap-3 text-sm">
        <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
        <div class="flex-1">
          <span class="text-red-900 font-semibold">License expired — billing features are locked.</span>
          <span class="text-red-800 ml-1">
            Update your license expiration date to restore billing access.
          </span>

          <!-- Inline form toggle -->
          <div class="mt-2">
            <button
              v-if="!showInlineForm"
              @click="openInlineForm"
              class="text-xs font-medium text-red-700 underline hover:text-red-900"
            >
              Update license now
            </button>
          </div>

          <!-- Inline form -->
          <div v-if="showInlineForm" class="mt-3 bg-white border border-red-200 rounded-lg p-4 space-y-3">
            <p class="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Update License Details
            </p>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">License Number</label>
              <input
                v-model="editLicenseNumber"
                type="text"
                placeholder="e.g. TX-12345"
                class="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">
                New Expiration Date
              </label>
              <input
                v-model="editLicenseExpiration"
                type="date"
                :min="todayIso"
                class="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">State of Licensure</label>
              <select
                v-model="editLicenseState"
                class="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
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

            <div v-if="saveError" class="text-xs text-red-600">{{ saveError }}</div>

            <div class="flex gap-2">
              <button
                :disabled="!formValid || isSaving"
                @click="handleSave"
                class="bg-red-600 text-white px-4 py-1.5 rounded-md text-xs font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Loader2 v-if="isSaving" class="w-3 h-3 animate-spin" />
                Save License
              </button>
              <button
                @click="showInlineForm = false"
                class="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>

          <div v-if="saveSuccess" class="mt-2 flex items-center gap-1.5 text-xs text-green-700">
            <CheckCircle2 class="w-3.5 h-3.5" />
            License updated. Billing access restored.
          </div>
        </div>
      </div>
    </div>

  </template>
</template>
