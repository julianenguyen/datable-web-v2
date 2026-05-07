<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { CheckCircle2, Clock, Eye, AlertCircle, ClipboardCopy, Check } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { logPhiAccess } from '@/lib/audit'
import { generateConsentText, CONSENT_TEXT_VERSION, type ConsentProgram } from '@/lib/consentText'

interface ConsentStatus {
  consentId: string
  status: 'pending' | 'viewed' | 'signed' | 'declined'
  programs: string[]
  sentAt: string | null
  viewedAt: string | null
  signedAt: string | null
  declinedAt: string | null
  signedName: string | null
  consentTextVersion: string | null
  disenrolledAt: string | null
}

interface FullConsentRecord extends ConsentStatus {
  consentText: string | null
  ipAddress: string | null
}

const props = defineProps<{
  clientId: string
  clientName: string
}>()

const PROGRAM_LABELS: Record<string, string> = {
  bhi: 'BHI',
  ccm: 'CCM',
  rtm: 'RTM',
  cocm: 'CoCM',
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// undefined = loading, null = no record, object = has record
const consentStatus = ref<ConsentStatus | null | undefined>(undefined)
const fullRecord = ref<FullConsentRecord | null>(null)
const isSending = ref(false)
const isDisenrolling = ref(false)
const showDisenrollConfirm = ref(false)
const showConsentRecord = ref(false)
const error = ref<string | null>(null)
const copySuccess = ref(false)
const loadingFullRecord = ref(false)

const programList = computed(() =>
  (consentStatus.value?.programs ?? [])
    .map((p) => PROGRAM_LABELS[p] ?? p.toUpperCase())
    .join(' · ')
)

async function loadConsentStatus() {
  const { data, error: err } = await supabase
    .from('billing_consent_records')
    .select('id, status, programs, sent_at, viewed_at, signed_at, declined_at, signed_name, consent_text_version, disenrolled_at')
    .eq('client_id', props.clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (err) {
    console.error('Failed to load consent status', err)
    consentStatus.value = null
    return
  }

  if (!data) {
    consentStatus.value = null
    return
  }

  consentStatus.value = {
    consentId: data.id,
    status: data.status,
    programs: data.programs ?? [],
    sentAt: data.sent_at,
    viewedAt: data.viewed_at,
    signedAt: data.signed_at,
    declinedAt: data.declined_at,
    signedName: data.signed_name,
    consentTextVersion: data.consent_text_version,
    disenrolledAt: data.disenrolled_at,
  }

  logPhiAccess(props.clientId, 'billing_consent_status_read', 'read', data.id)
}

async function loadFullRecord() {
  if (!consentStatus.value?.consentId) return
  loadingFullRecord.value = true
  const { data, error: err } = await supabase
    .from('billing_consent_records')
    .select('id, status, programs, sent_at, viewed_at, signed_at, declined_at, signed_name, consent_text_version, disenrolled_at, consent_text, ip_address')
    .eq('id', consentStatus.value.consentId)
    .single()

  loadingFullRecord.value = false
  if (err || !data) return

  fullRecord.value = {
    consentId: data.id,
    status: data.status,
    programs: data.programs ?? [],
    sentAt: data.sent_at,
    viewedAt: data.viewed_at,
    signedAt: data.signed_at,
    declinedAt: data.declined_at,
    signedName: data.signed_name,
    consentTextVersion: data.consent_text_version,
    disenrolledAt: data.disenrolled_at,
    consentText: data.consent_text,
    ipAddress: data.ip_address,
  }

  logPhiAccess(props.clientId, 'billing_consent_full_record_read', 'read', data.id)
}

async function sendConsent(programs: ConsentProgram[] = ['bhi', 'ccm', 'rtm']) {
  isSending.value = true
  error.value = null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Check for existing pending or signed record
    const { data: existing } = await supabase
      .from('billing_consent_records')
      .select('id, status, programs')
      .eq('client_id', props.clientId)
      .in('status', ['pending', 'signed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.status === 'signed') {
      const same =
        JSON.stringify([...(programs as string[])].sort()) ===
        JSON.stringify([...(existing.programs ?? [])].sort())
      if (same) {
        error.value = 'Patient has already signed consent for these programs.'
        return
      }
    }

    if (existing?.status === 'pending') {
      // Resend: update sent_at
      await supabase
        .from('billing_consent_records')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', existing.id)

      logPhiAccess(props.clientId, 'billing_consent_sent', 'write', existing.id)
      await loadConsentStatus()
      return
    }

    // New record
    const consentText = generateConsentText(programs)
    const { data: newRecord, error: insertErr } = await supabase
      .from('billing_consent_records')
      .insert({
        client_id: props.clientId,
        therapist_id: user.id,
        programs,
        consent_text_version: CONSENT_TEXT_VERSION,
        consent_text: consentText,
        status: 'pending',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr) throw insertErr
    logPhiAccess(props.clientId, 'billing_consent_sent', 'write', newRecord.id)
    await loadConsentStatus()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send consent'
  } finally {
    isSending.value = false
  }
}

async function disenrollPatient() {
  if (!consentStatus.value?.consentId) return
  isDisenrolling.value = true
  error.value = null
  try {
    const { error: err } = await supabase
      .from('billing_consent_records')
      .update({ disenrolled_at: new Date().toISOString() })
      .eq('id', consentStatus.value.consentId)
      .eq('status', 'signed')

    if (err) throw err
    logPhiAccess(props.clientId, 'billing_consent_disenrolled', 'write', consentStatus.value.consentId)
    showDisenrollConfirm.value = false
    await loadConsentStatus()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to disenroll patient'
  } finally {
    isDisenrolling.value = false
  }
}

function openConsentRecord() {
  showConsentRecord.value = true
  loadFullRecord()
}

function copyToClipboard() {
  if (!fullRecord.value) return
  const text = [
    'SIGNED CONSENT RECORD',
    `Patient: ${props.clientName}`,
    `Signed by: ${fullRecord.value.signedName ?? '—'}`,
    `Signed on: ${formatDate(fullRecord.value.signedAt)}`,
    `IP Address: ${fullRecord.value.ipAddress ?? '—'}`,
    `Version: ${fullRecord.value.consentTextVersion ?? '—'}`,
    '',
    fullRecord.value.consentText ?? '',
  ].join('\n')
  navigator.clipboard.writeText(text)
  copySuccess.value = true
  setTimeout(() => { copySuccess.value = false }, 2000)
}

watch(showConsentRecord, (val) => {
  if (!val) fullRecord.value = null
})

onMounted(loadConsentStatus)
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-gray-900">Billing Enrollment</h3>

      <!-- Status badge -->
      <template v-if="consentStatus !== undefined && consentStatus !== null">
        <span
          v-if="consentStatus.status === 'signed' && !consentStatus.disenrolledAt"
          class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-teal-600 text-white"
        >
          <CheckCircle2 class="w-3.5 h-3.5" />
          Enrolled
        </span>
        <span
          v-else-if="consentStatus.status === 'signed' && consentStatus.disenrolledAt"
          class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600"
        >
          Disenrolled
        </span>
        <span
          v-else-if="consentStatus.status === 'pending'"
          class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600"
        >
          Pending
        </span>
        <span
          v-else-if="consentStatus.status === 'viewed'"
          class="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700"
        >
          Viewed
        </span>
        <span
          v-else-if="consentStatus.status === 'declined'"
          class="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700"
        >
          Declined
        </span>
      </template>
    </div>

    <!-- Error -->
    <div v-if="error" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <template v-if="consentStatus === undefined">
      <div class="space-y-2 animate-pulse">
        <div class="h-4 bg-gray-100 rounded w-full" />
        <div class="h-3 bg-gray-100 rounded w-2/3" />
      </div>
    </template>

    <!-- No record -->
    <template v-else-if="consentStatus === null">
      <p class="text-sm text-gray-500 mb-4">
        This patient is not enrolled in any billing programs.
      </p>
      <button
        @click="sendConsent()"
        :disabled="isSending"
        class="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {{ isSending ? 'Sending…' : 'Send Enrollment Consent' }}
      </button>
    </template>

    <!-- Pending -->
    <template v-else-if="consentStatus.status === 'pending'">
      <p class="text-sm text-gray-600 mb-1">
        Consent sent on <span class="font-medium text-gray-800">{{ formatDate(consentStatus.sentAt) }}</span>.
        Waiting for patient to sign.
      </p>
      <p class="text-xs text-gray-400 mb-4">Programs: {{ programList }}</p>
      <button
        @click="sendConsent(consentStatus.programs as ConsentProgram[])"
        :disabled="isSending"
        class="text-xs font-medium px-4 py-2 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50 disabled:opacity-60 transition-colors"
      >
        {{ isSending ? 'Resending…' : 'Resend Consent' }}
      </button>
    </template>

    <!-- Viewed -->
    <template v-else-if="consentStatus.status === 'viewed'">
      <p class="text-sm text-gray-600 mb-1">
        Patient has opened the consent form. Waiting for signature.
      </p>
      <p class="text-xs text-gray-400 mb-4">Programs: {{ programList }}</p>
      <button
        @click="sendConsent(consentStatus.programs as ConsentProgram[])"
        :disabled="isSending"
        class="text-xs font-medium px-4 py-2 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50 disabled:opacity-60 transition-colors"
      >
        {{ isSending ? 'Resending…' : 'Resend Consent' }}
      </button>
    </template>

    <!-- Signed / Enrolled -->
    <template v-else-if="consentStatus.status === 'signed'">
      <template v-if="!consentStatus.disenrolledAt">
        <p class="text-sm text-gray-600 mb-0.5">
          Signed by <span class="font-medium text-gray-800">{{ consentStatus.signedName ?? '—' }}</span>
          on {{ formatDate(consentStatus.signedAt) }}.
        </p>
        <p class="text-xs text-gray-400 mb-1">Programs: {{ programList }}</p>
        <p class="text-xs text-gray-400 mb-4">Consent version: {{ consentStatus.consentTextVersion ?? '—' }}</p>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            @click="openConsentRecord"
            class="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View Signed Record
          </button>
          <button
            @click="showDisenrollConfirm = true"
            class="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            Disenroll Patient
          </button>
        </div>
      </template>
      <template v-else>
        <p class="text-sm text-gray-500 mb-4">
          Disenrolled on {{ formatDate(consentStatus.disenrolledAt) }}. Billing stopped at end of that month.
        </p>
        <button
          @click="sendConsent()"
          :disabled="isSending"
          class="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {{ isSending ? 'Sending…' : 'Send New Enrollment Consent' }}
        </button>
      </template>
    </template>

    <!-- Declined -->
    <template v-else-if="consentStatus.status === 'declined'">
      <p class="text-sm text-gray-500 mb-4">
        Patient declined enrollment on {{ formatDate(consentStatus.declinedAt) }}.
      </p>
      <button
        @click="sendConsent()"
        :disabled="isSending"
        class="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {{ isSending ? 'Sending…' : 'Send New Consent Request' }}
      </button>
    </template>
  </div>

  <!-- View Signed Record Modal -->
  <Teleport to="body">
    <div
      v-if="showConsentRecord"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="showConsentRecord = false"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 class="text-base font-semibold text-gray-900">Signed Consent Record</h2>
          <button @click="showConsentRecord = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div class="px-6 py-4 flex-1 overflow-y-auto">
          <template v-if="loadingFullRecord">
            <div class="space-y-2 animate-pulse">
              <div class="h-4 bg-gray-100 rounded w-3/4" />
              <div class="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </template>
          <template v-else-if="fullRecord">
            <div class="space-y-1 mb-4">
              <p class="text-xs text-gray-500">Patient: <span class="text-gray-800 font-medium">{{ clientName }}</span></p>
              <p class="text-xs text-gray-500">Signed by: <span class="text-gray-800 font-medium">{{ fullRecord.signedName ?? '—' }}</span></p>
              <p class="text-xs text-gray-500">Signed on: <span class="text-gray-800 font-medium">{{ formatDate(fullRecord.signedAt) }}</span></p>
              <p class="text-xs text-gray-500">IP Address: <span class="text-gray-800 font-medium">{{ fullRecord.ipAddress ?? '—' }}</span></p>
              <p class="text-xs text-gray-500">Version: <span class="text-gray-800 font-medium">{{ fullRecord.consentTextVersion ?? '—' }}</span></p>
            </div>
            <pre class="text-xs text-gray-700 font-mono bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">{{ fullRecord.consentText }}</pre>
          </template>
        </div>

        <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            @click="copyToClipboard"
            :disabled="!fullRecord"
            class="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <Check v-if="copySuccess" class="w-3.5 h-3.5 text-teal-600" />
            <ClipboardCopy v-else class="w-3.5 h-3.5" />
            {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
          </button>
          <button
            @click="showConsentRecord = false"
            class="text-xs font-medium px-4 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Disenrollment Confirmation Dialog -->
  <Teleport to="body">
    <div
      v-if="showDisenrollConfirm"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="showDisenrollConfirm = false"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 class="text-base font-semibold text-gray-900 mb-2">Disenroll Patient from Billing Programs</h2>
        <p class="text-sm text-gray-600 mb-6 leading-relaxed">
          This will end billing for <span class="font-medium text-gray-800">{{ clientName }}</span> at the end of the current calendar month.
          The signed consent record will be preserved. This action cannot be undone.
        </p>
        <div class="flex items-center gap-3 justify-end">
          <button
            @click="showDisenrollConfirm = false"
            class="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            @click="disenrollPatient"
            :disabled="isDisenrolling"
            class="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white transition-colors"
          >
            <svg v-if="isDisenrolling" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {{ isDisenrolling ? 'Disenrolling…' : 'Confirm Disenrollment' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
