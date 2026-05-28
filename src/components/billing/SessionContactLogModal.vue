<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Phone, FileText, AlertTriangle, CheckCircle2, Loader2, ChevronDown } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type ContactType = 'phone_call' | 'video_call' | 'secure_message' | 'in_person'
type ActiveTab = 'manual' | 'ehr'

interface ExtractedData {
  sessionDate: string | null
  modality: ContactType | null
  durationMinutes: number | null
}

// ── Props / emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  clientName: string
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []  // contact was successfully logged; parent should reload widget
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const activeTab = ref<ActiveTab>('manual')
const submitting = ref(false)
const extracting = ref(false)
const error = ref<string | null>(null)

// Manual tab fields
const contactType = ref<ContactType>('phone_call')
const contactDate = ref(todayString())
const durationMinutes = ref<number | null>(null)
const isRetroactive = ref(false)
const retroactiveExplanation = ref('')

// EHR tab fields
const noteText = ref('')
const extractedData = ref<ExtractedData | null>(null)
const ehrContactType = ref<ContactType>('phone_call')
const ehrContactDate = ref(todayString())
const ehrDurationMinutes = ref<number | null>(null)
const ehrIsRetroactive = ref(false)
const ehrRetroactiveExplanation = ref('')
const ehrSourceSystem = ref('')
const therapistConfirmed = ref(false)

// ── Computed ────────────────────────────────────────────────────────────────────

// Duration is not applicable for secure_message
const showDuration = computed(() => contactType.value !== 'secure_message')
const showEhrDuration = computed(() => ehrContactType.value !== 'secure_message')

const manualFormValid = computed(() => {
  if (!contactDate.value) return false
  if (showDuration.value && (!durationMinutes.value || durationMinutes.value < 1)) return false
  if (isRetroactive.value && !retroactiveExplanation.value.trim()) return false
  return true
})

const ehrFormValid = computed(() => {
  if (!ehrContactDate.value) return false
  if (showEhrDuration.value && (!ehrDurationMinutes.value || ehrDurationMinutes.value < 1)) return false
  if (ehrIsRetroactive.value && !ehrRetroactiveExplanation.value.trim()) return false
  if (!therapistConfirmed.value) return false
  return true
})

// Retroactive flag: contact date is not in current billing month
function isDateRetroactive(dateStr: string): boolean {
  if (!dateStr) return false
  const today = new Date()
  const currentMonth = today.toISOString().substring(0, 7)
  return dateStr.substring(0, 7) < currentMonth
}

// Auto-set retroactive flag when date changes
watch(contactDate, (val) => {
  isRetroactive.value = isDateRetroactive(val)
})
watch(ehrContactDate, (val) => {
  ehrIsRetroactive.value = isDateRetroactive(val)
})

// Reset form when modal opens/closes
watch(() => props.isOpen, (open) => {
  if (open) resetForm()
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

function resetForm() {
  activeTab.value = 'manual'
  error.value = null
  contactType.value = 'phone_call'
  contactDate.value = todayString()
  durationMinutes.value = null
  isRetroactive.value = false
  retroactiveExplanation.value = ''
  noteText.value = ''
  extractedData.value = null
  ehrContactType.value = 'phone_call'
  ehrContactDate.value = todayString()
  ehrDurationMinutes.value = null
  ehrIsRetroactive.value = false
  ehrRetroactiveExplanation.value = ''
  ehrSourceSystem.value = ''
  therapistConfirmed.value = false
  submitting.value = false
  extracting.value = false
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
  }
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json() as { message?: string; error?: string }
    return data.message ?? data.error ?? `Error ${res.status}`
  } catch {
    return `Error ${res.status}`
  }
}

// ── Extract from note (EHR tab) ────────────────────────────────────────────────

async function extractFromNote() {
  if (!noteText.value.trim()) return
  extracting.value = true
  error.value = null
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/session-contacts/extract-from-note`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ note_text: noteText.value }),
    })
    if (!res.ok) throw new Error(await extractErrorMessage(res))
    const data = await res.json() as ExtractedData
    extractedData.value = data

    // Pre-fill EHR fields with extracted data
    if (data.modality) ehrContactType.value = data.modality
    if (data.sessionDate) ehrContactDate.value = data.sessionDate
    if (data.durationMinutes) ehrDurationMinutes.value = data.durationMinutes
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Extraction failed — please enter details manually'
  } finally {
    extracting.value = false
  }
}

// ── Submit: manual log ─────────────────────────────────────────────────────────

async function submitManual() {
  if (!manualFormValid.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/session-contacts/log`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        client_id: props.clientId,
        contact_type: contactType.value,
        contact_date: contactDate.value,
        duration_minutes: showDuration.value ? durationMinutes.value : null,
        is_retroactive_flag: isRetroactive.value,
        retroactive_explanation: isRetroactive.value ? retroactiveExplanation.value.trim() : undefined,
      }),
    })
    if (!res.ok) throw new Error(await extractErrorMessage(res))
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save contact'
  } finally {
    submitting.value = false
  }
}

// ── Submit: EHR import ─────────────────────────────────────────────────────────

async function submitEhr() {
  if (!ehrFormValid.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/session-contacts/log-from-ehr-import`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        client_id: props.clientId,
        contact_type: ehrContactType.value,
        contact_date: ehrContactDate.value,
        duration_minutes: showEhrDuration.value ? ehrDurationMinutes.value : null,
        is_retroactive_flag: ehrIsRetroactive.value,
        retroactive_explanation: ehrIsRetroactive.value ? ehrRetroactiveExplanation.value.trim() : undefined,
        ehr_source_system: ehrSourceSystem.value.trim() || null,
        therapist_confirmed: true,
        // note_text is intentionally NOT sent — the raw session note is never transmitted
      }),
    })
    if (!res.ok) throw new Error(await extractErrorMessage(res))
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save EHR-imported contact'
  } finally {
    submitting.value = false
  }
}

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'video_call', label: 'Video Call' },
  { value: 'secure_message', label: 'Secure Message' },
  { value: 'in_person', label: 'In-Person' },
]
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <!-- Overlay -->
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        @click="emit('close')"
      />

      <!-- Modal -->
      <div
        class="relative z-10 w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 class="text-base font-semibold text-gray-900">Log Care Team Contact</h2>
            <p class="text-xs text-gray-500 mt-0.5">{{ clientName }}</p>
          </div>
          <button
            type="button"
            class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            @click="emit('close')"
          >
            <X :size="16" class="text-gray-500" />
          </button>
        </div>

        <!-- Tab bar -->
        <div class="flex border-b border-gray-100 px-6">
          <button
            type="button"
            class="flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 mr-6 transition-colors"
            :class="activeTab === 'manual'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'manual'; error = null"
          >
            <Phone :size="14" />
            Log Directly
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === 'ehr'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'ehr'; error = null"
          >
            <FileText :size="14" />
            Import from EHR Note
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <!-- Error banner -->
          <div v-if="error"
            class="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
            <AlertTriangle :size="15" class="mt-0.5 shrink-0 text-red-500" />
            <p class="text-sm text-red-700">{{ error }}</p>
          </div>

          <!-- ── Manual tab ──────────────────────────────────────────────────── -->
          <template v-if="activeTab === 'manual'">
            <!-- Contact type -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Contact Type</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="ct in CONTACT_TYPES"
                  :key="ct.value"
                  type="button"
                  class="rounded-lg border px-3 py-2 text-sm text-left transition-colors"
                  :class="contactType === ct.value
                    ? 'border-teal-500 bg-teal-50 text-teal-800 font-medium'
                    : 'border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50/50'"
                  @click="contactType = ct.value"
                >
                  {{ ct.label }}
                </button>
              </div>
            </div>

            <!-- Contact date -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Contact Date</label>
              <input
                v-model="contactDate"
                type="date"
                :max="todayString()"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <!-- Duration (hidden for secure_message) -->
            <div v-if="showDuration">
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Duration (minutes)</label>
              <input
                v-model.number="durationMinutes"
                type="number"
                min="1"
                max="480"
                placeholder="e.g. 20"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <!-- Retroactive warning + explanation -->
            <div v-if="isRetroactive"
              class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
              <div class="flex items-start gap-2">
                <AlertTriangle :size="14" class="mt-0.5 shrink-0 text-amber-600" />
                <p class="text-xs text-amber-800">
                  This contact date is from a prior billing month.
                  A brief explanation for the retroactive entry is required.
                </p>
              </div>
              <textarea
                v-model="retroactiveExplanation"
                rows="2"
                placeholder="Reason for retroactive documentation…"
                class="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>
          </template>

          <!-- ── EHR import tab ──────────────────────────────────────────────── -->
          <template v-else>
            <!-- PHI notice -->
            <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
              <strong>PHI notice:</strong> Paste your session note below. Only the contact date, type,
              and duration will be extracted and saved — the raw note text is never stored.
            </div>

            <!-- Note paste area + extract button -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Paste Session Note</label>
              <textarea
                v-model="noteText"
                rows="5"
                placeholder="Paste your session note here. The system will extract the contact date, modality, and duration automatically…"
                maxlength="8000"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
              <div class="flex items-center justify-between mt-1.5">
                <span class="text-xs text-gray-400">{{ noteText.length }}/8000 chars</span>
                <button
                  type="button"
                  :disabled="!noteText.trim() || extracting"
                  class="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  @click="extractFromNote"
                >
                  <Loader2 v-if="extracting" :size="12" class="animate-spin" />
                  <FileText v-else :size="12" />
                  {{ extracting ? 'Extracting…' : 'Extract Details' }}
                </button>
              </div>
            </div>

            <!-- Extracted data confirmation -->
            <div v-if="extractedData"
              class="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800 mb-2">
              <div class="flex items-center gap-1.5 font-medium mb-1">
                <CheckCircle2 :size="13" />
                Details extracted — please review and confirm below.
              </div>
            </div>

            <!-- EHR contact fields (always shown, pre-filled after extraction) -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Contact Type</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="ct in CONTACT_TYPES"
                  :key="ct.value"
                  type="button"
                  class="rounded-lg border px-3 py-2 text-sm text-left transition-colors"
                  :class="ehrContactType === ct.value
                    ? 'border-teal-500 bg-teal-50 text-teal-800 font-medium'
                    : 'border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50/50'"
                  @click="ehrContactType = ct.value"
                >
                  {{ ct.label }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Contact Date</label>
              <input
                v-model="ehrContactDate"
                type="date"
                :max="todayString()"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div v-if="showEhrDuration">
              <label class="block text-xs font-medium text-gray-700 mb-1.5">Duration (minutes)</label>
              <input
                v-model.number="ehrDurationMinutes"
                type="number"
                min="1"
                max="480"
                placeholder="e.g. 20"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <!-- EHR source system (optional) -->
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1.5">
                EHR Source System
                <span class="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                v-model="ehrSourceSystem"
                type="text"
                placeholder="e.g. Epic, Athena, Cerner"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <!-- Retroactive warning + explanation (EHR) -->
            <div v-if="ehrIsRetroactive"
              class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
              <div class="flex items-start gap-2">
                <AlertTriangle :size="14" class="mt-0.5 shrink-0 text-amber-600" />
                <p class="text-xs text-amber-800">
                  This contact date is from a prior billing month.
                  A brief explanation for the retroactive entry is required.
                </p>
              </div>
              <textarea
                v-model="ehrRetroactiveExplanation"
                rows="2"
                placeholder="Reason for retroactive documentation…"
                class="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>

            <!-- Therapist confirmation checkbox -->
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input
                v-model="therapistConfirmed"
                type="checkbox"
                class="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span class="text-xs text-gray-700 leading-relaxed">
                I confirm that I reviewed and verified the contact details extracted above.
                The information accurately reflects a qualifying G0323 care team contact
                that occurred on the stated date, and I attest to its accuracy.
              </span>
            </label>
          </template>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            @click="emit('close')"
          >
            Cancel
          </button>

          <!-- Manual submit -->
          <button
            v-if="activeTab === 'manual'"
            type="button"
            :disabled="!manualFormValid || submitting"
            class="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            @click="submitManual"
          >
            <Loader2 v-if="submitting" :size="14" class="animate-spin" />
            {{ submitting ? 'Saving…' : 'Save Contact' }}
          </button>

          <!-- EHR submit -->
          <button
            v-else
            type="button"
            :disabled="!ehrFormValid || submitting"
            class="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            @click="submitEhr"
          >
            <Loader2 v-if="submitting" :size="14" class="animate-spin" />
            {{ submitting ? 'Saving…' : 'Confirm & Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
