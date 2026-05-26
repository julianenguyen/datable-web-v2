<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Check } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

interface ConsentRecord {
  id: string
  consentType: string
  consentDate: string
  attestedAt: string
  status: string
  therapistNameSnapshot: string | null
  therapistNpiSnapshot: string | null
}

const props = defineProps<{
  isOpen: boolean
  clientId: string
  clientName: string
  therapistName?: string
  therapistCredential?: string
  therapistNpi?: string
  onComplete: (consentRecord: ConsentRecord) => void
  onCancel: () => void
}>()

type Step = 1 | 2 | 3

const currentStep = ref<Step>(1)

// Step 1
const consentDate = ref('')

// Step 2
const elementBhiServices = ref(false)
const elementCostSharing = ref(false)
const elementSpecialistConsult = ref(false)

// Step 3
const isSubmitting = ref(false)
const error = ref<string | null>(null)

// 409 duplicate modal
const showDuplicateModal = ref(false)

const today = new Date().toISOString().split('T')[0]

// Resolved therapist info (props or fetched)
const resolvedName = ref(props.therapistName ?? '')
const resolvedCredential = ref(props.therapistCredential ?? '')
const resolvedNpi = ref(props.therapistNpi ?? '')
const credentialsFetched = ref(false)

async function fetchCredentials() {
  if (credentialsFetched.value || (props.therapistName && props.therapistNpi)) return
  try {
    const { data } = await supabase
      .from('provider_credentials')
      .select('full_name, credential, npi')
      .single()
    if (data) {
      resolvedName.value = data.full_name ?? ''
      resolvedCredential.value = data.credential ?? ''
      resolvedNpi.value = data.npi ?? ''
    }
  } catch { /* non-fatal */ }
  credentialsFetched.value = true
}

// Reset when opened
watch(() => props.isOpen, (open) => {
  if (open) {
    currentStep.value = 1
    consentDate.value = ''
    elementBhiServices.value = false
    elementCostSharing.value = false
    elementSpecialistConsult.value = false
    isSubmitting.value = false
    error.value = null
    showDuplicateModal.value = false
    fetchCredentials()
  }
})

// Update resolved values if props change
watch(() => props.therapistName, v => { if (v) resolvedName.value = v })
watch(() => props.therapistCredential, v => { if (v) resolvedCredential.value = v })
watch(() => props.therapistNpi, v => { if (v) resolvedNpi.value = v })

const step1Valid = computed(() => !!consentDate.value && consentDate.value <= today)
const step2Valid = computed(() => elementBhiServices.value && elementCostSharing.value && elementSpecialistConsult.value)

function formatDateDisplay(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

async function handleConfirm() {
  isSubmitting.value = true
  error.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/consent/document-verbal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: props.clientId,
        consentDate: consentDate.value,
        elementBhiServices: elementBhiServices.value,
        elementCostSharing: elementCostSharing.value,
        elementSpecialistConsult: elementSpecialistConsult.value,
      }),
    })

    if (res.status === 409) {
      showDuplicateModal.value = true
      return
    }

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to document consent')
    }

    const record = await res.json() as ConsentRecord
    props.onComplete(record)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto">

        <!-- Header -->
        <div class="px-6 pt-6 pb-4 border-b border-gray-100">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold text-gray-900">Document Verbal Consent — BHI Services</h2>
            <button @click="onCancel" class="text-gray-400 hover:text-gray-600">
              <X class="w-5 h-5" />
            </button>
          </div>
          <!-- Step indicator -->
          <div class="flex items-center gap-1.5">
            <template v-for="i in 3" :key="i">
              <div
                class="h-1.5 rounded-full transition-all"
                :class="[
                  i <= currentStep ? 'bg-teal-600' : 'bg-gray-200',
                  i === 2 ? 'flex-1' : 'w-8',
                ]"
              />
            </template>
          </div>
        </div>

        <div class="p-6 space-y-5">

          <!-- Step 1: Consent Date -->
          <template v-if="currentStep === 1">
            <div>
              <h3 class="text-sm font-semibold text-gray-900 mb-1">When was verbal consent obtained?</h3>
              <p class="text-sm text-gray-500 leading-relaxed mb-4">
                Enter the date you discussed BHI services with
                <strong>{{ clientName }}</strong> and obtained their verbal agreement.
                This may be the date of the initiating visit or an earlier date.
              </p>

              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                Date verbal consent was obtained <span class="text-red-500">*</span>
              </label>
              <input
                v-model="consentDate"
                type="date"
                :max="today"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />

              <div class="mt-4 border border-teal-200 bg-teal-50 rounded-lg px-4 py-3 text-sm text-teal-800 leading-relaxed">
                You are documenting that you had a verbal conversation with
                <strong>{{ clientName }}</strong> about BHI services. The date you enter here will appear
                in the patient's medical record as the consent date.
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button
                @click="currentStep = 2"
                :disabled="!step1Valid"
                class="text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </template>

          <!-- Step 2: Confirm Elements -->
          <template v-if="currentStep === 2">
            <div>
              <h3 class="text-sm font-semibold text-gray-900 mb-1">Confirm what you covered in the consent conversation</h3>
              <p class="text-sm text-gray-500 leading-relaxed mb-4">
                Check each item below to confirm you covered it with
                <strong>{{ clientName }}</strong> during your verbal consent conversation.
              </p>

              <div class="space-y-3">
                <label class="flex items-start gap-3 cursor-pointer group">
                  <input
                    v-model="elementBhiServices"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span class="text-sm text-gray-700 leading-relaxed">
                    I explained that <strong>{{ clientName }}</strong> will receive Behavioral Health Integration (BHI)
                    care management services, which include ongoing assessment, care planning, treatment coordination,
                    and follow-up monitoring
                  </span>
                </label>

                <label class="flex items-start gap-3 cursor-pointer">
                  <input
                    v-model="elementCostSharing"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span class="text-sm text-gray-700 leading-relaxed">
                    I informed <strong>{{ clientName }}</strong> that Medicare cost sharing (copayment or coinsurance)
                    will apply to BHI services, including services delivered by phone, video, or other
                    non-face-to-face methods
                  </span>
                </label>

                <label class="flex items-start gap-3 cursor-pointer">
                  <input
                    v-model="elementSpecialistConsult"
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span class="text-sm text-gray-700 leading-relaxed">
                    I informed <strong>{{ clientName }}</strong> that their care may involve consultation with
                    relevant specialists, including a psychiatric consultant
                  </span>
                </label>
              </div>
            </div>

            <div class="flex justify-between pt-1">
              <button
                @click="currentStep = 1"
                class="text-sm font-medium text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                @click="currentStep = 3"
                :disabled="!step2Valid"
                class="text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </template>

          <!-- Step 3: Review and Lock -->
          <template v-if="currentStep === 3">
            <div>
              <h3 class="text-sm font-semibold text-gray-900 mb-1">Review consent statement</h3>
              <p class="text-sm text-gray-500 leading-relaxed mb-4">
                The following consent statement will be locked into <strong>{{ clientName }}</strong>'s
                medical record. This record is permanent and cannot be edited after confirmation.
              </p>

              <!-- Consent statement preview (read-only) -->
              <div class="border border-teal-200 bg-teal-50/40 rounded-lg p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap select-none font-mono text-xs">
I, {{ clientName }}, consent to receive Behavioral Health Integration (BHI) care management
services provided by {{ resolvedName || '[therapist name]' }}, {{ resolvedCredential || '[credential]' }}, NPI {{ resolvedNpi || '[NPI]' }}.

I understand that these services include ongoing care management for my behavioral health
condition, which may involve assessment, care planning, treatment coordination, and
follow-up monitoring.

I understand that Medicare cost sharing (copayment or coinsurance) will apply to these
services, including services delivered by phone, video, or other non-face-to-face methods.

I give permission for my provider to consult with relevant specialists, including a
psychiatric consultant, as part of my care.

Verbal consent obtained: {{ formatDateDisplay(consentDate) }}
Documented by: {{ resolvedName || '[therapist name]' }}, {{ resolvedCredential || '[credential]' }}
Documentation timestamp: [will be set by server at submission]
              </div>

              <p class="text-xs text-gray-400 mt-3">
                This record will be retained for 7 years in accordance with CMS documentation requirements.
              </p>
            </div>

            <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {{ error }}
            </div>

            <div class="flex justify-between pt-1">
              <button
                @click="currentStep = 2"
                class="text-sm font-medium text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                @click="handleConfirm"
                :disabled="isSubmitting"
                class="text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <span
                  v-if="isSubmitting"
                  class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
                />
                <Check v-else class="w-4 h-4" />
                Confirm and Lock
              </button>
            </div>
          </template>

        </div>
      </div>
    </div>

    <!-- 409 duplicate consent info modal -->
    <div
      v-if="showDuplicateModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div class="flex items-start gap-3 mb-4">
          <div class="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <Check class="w-4 h-4 text-teal-700" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-gray-900 mb-1">Consent Already on File</h3>
            <p class="text-sm text-gray-600 leading-relaxed">
              An active consent record already exists for <strong>{{ clientName }}</strong>.
              No new consent is required. If the patient has changed billing practitioners,
              use the practitioner change workflow instead.
            </p>
          </div>
        </div>
        <button
          @click="showDuplicateModal = false; onCancel()"
          class="w-full text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-lg transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  </Teleport>
</template>
