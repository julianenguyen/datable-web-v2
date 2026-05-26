<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import VerbalConsentWizard from './VerbalConsentWizard.vue'

interface ConsentRecord {
  id: string
  consentType: string
  consentDate: string
  attestedAt: string
  status: string
  therapistNameSnapshot: string | null
  therapistNpiSnapshot: string | null
}

interface ConsentStatusResponse {
  status: 'missing' | 'verbal_pending' | 'verbal_only_lapsed' | 'fully_confirmed' | 'revoked' | 'pending_new_practitioner'
  verbalConsentDate: string | null
  patientConfirmedAt: string | null
  revokedAt: string | null
  daysRemainingForPatientConfirm: number | null
}

const props = defineProps<{
  clientId: string
  clientName: string
  therapistName?: string
  therapistCredential?: string
  therapistNpi?: string
  onConsentDocumented?: () => void
  onRevokeRequest?: () => void
}>()

const loading = ref(true)
const fetchError = ref<string | null>(null)
const consentStatus = ref<ConsentStatusResponse | null>(null)
const showWizard = ref(false)

async function fetchStatus() {
  loading.value = true
  fetchError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/consent/status/${props.clientId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to fetch consent status')
    }

    consentStatus.value = await res.json() as ConsentStatusResponse
  } catch (e: unknown) {
    fetchError.value = e instanceof Error ? e.message : 'Failed to load consent status'
  } finally {
    loading.value = false
  }
}

function reload() {
  fetchStatus()
}

defineExpose({ reload })

onMounted(fetchStatus)

function onWizardComplete(record: ConsentRecord) {
  showWizard.value = false
  // Reload status to reflect new consent
  fetchStatus()
  props.onConsentDocumented?.()
  // Suppress unused var warning
  void record
}

function onWizardCancel() {
  showWizard.value = false
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}
</script>

<template>
  <!-- Skeleton while loading -->
  <div v-if="loading" class="flex items-center gap-2 py-1">
    <div class="w-2.5 h-2.5 rounded-full bg-gray-200 animate-pulse" />
    <div class="h-3.5 w-40 bg-gray-200 rounded animate-pulse" />
  </div>

  <!-- Fetch error -->
  <div
    v-else-if="fetchError"
    class="text-xs text-red-600 flex items-center gap-1.5"
  >
    <span class="w-2 h-2 rounded-full bg-red-400 shrink-0" />
    Failed to load consent status
  </div>

  <!-- Status display -->
  <template v-else-if="consentStatus">

    <!-- missing -->
    <div v-if="consentStatus.status === 'missing'" class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
        <span class="text-sm font-medium text-red-700">Consent Not Documented</span>
      </div>
      <p class="text-xs text-gray-500 pl-4 leading-relaxed">
        BHI billing is locked until verbal consent is documented.
      </p>
      <div class="pl-4">
        <button
          @click="showWizard = true"
          class="text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md transition-colors"
        >
          Document Consent
        </button>
      </div>
    </div>

    <!-- verbal_pending -->
    <div v-else-if="consentStatus.status === 'verbal_pending'" class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
        <span class="text-sm font-medium text-amber-700">Verbal Consent Pending</span>
      </div>
      <p class="text-xs text-gray-500 pl-4 leading-relaxed">
        Verbal consent obtained on {{ formatDate(consentStatus.verbalConsentDate) }}.
        <template v-if="consentStatus.daysRemainingForPatientConfirm !== null">
          Patient has {{ consentStatus.daysRemainingForPatientConfirm }} day{{ consentStatus.daysRemainingForPatientConfirm === 1 ? '' : 's' }} remaining to confirm via the patient app.
        </template>
      </p>
    </div>

    <!-- verbal_only_lapsed -->
    <div v-else-if="consentStatus.status === 'verbal_only_lapsed'" class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
        <span class="text-sm font-medium text-amber-700">Verbal Consent – Patient Confirmation Overdue</span>
      </div>
      <p class="text-xs text-gray-500 pl-4 leading-relaxed">
        Verbal consent was obtained on {{ formatDate(consentStatus.verbalConsentDate) }} but the patient has not confirmed in the app.
        Billing is still permitted.
      </p>
      <div v-if="onRevokeRequest" class="pl-4">
        <button
          @click="onRevokeRequest()"
          class="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          Revoke consent
        </button>
      </div>
    </div>

    <!-- fully_confirmed -->
    <div v-else-if="consentStatus.status === 'fully_confirmed'" class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
        <span class="text-sm font-medium text-teal-700">Consent Active</span>
      </div>
      <p class="text-xs text-gray-500 pl-4 leading-relaxed">
        Patient confirmed on {{ formatDate(consentStatus.patientConfirmedAt) }}.
      </p>
      <div v-if="onRevokeRequest" class="pl-4">
        <button
          @click="onRevokeRequest()"
          class="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          Revoke consent
        </button>
      </div>
    </div>

    <!-- revoked -->
    <div v-else-if="consentStatus.status === 'revoked'" class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
        <span class="text-sm font-medium text-red-700">Consent Revoked</span>
      </div>
      <p class="text-xs text-gray-500 pl-4 leading-relaxed">
        Consent was revoked on {{ formatDate(consentStatus.revokedAt) }}.
      </p>
    </div>

    <!-- pending_new_practitioner -->
    <div v-else-if="consentStatus.status === 'pending_new_practitioner'" class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
        <span class="text-sm font-medium text-amber-700">Consent Required – Practitioner Change</span>
      </div>
      <p class="text-xs text-gray-500 pl-4 leading-relaxed">
        A new verbal consent is required because the billing practitioner has changed.
      </p>
      <div class="pl-4">
        <button
          @click="showWizard = true"
          class="text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-md transition-colors"
        >
          Document Consent
        </button>
      </div>
    </div>

  </template>

  <!-- Verbal consent wizard (managed internally) -->
  <VerbalConsentWizard
    :is-open="showWizard"
    :client-id="clientId"
    :client-name="clientName"
    :therapist-name="therapistName"
    :therapist-credential="therapistCredential"
    :therapist-npi="therapistNpi"
    :on-complete="onWizardComplete"
    :on-cancel="onWizardCancel"
  />
</template>
