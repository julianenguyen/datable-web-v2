<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Activity types (must match server-side enum exactly) ──────────────────────
const ACTIVITY_TYPES = [
  { value: 'care_plan_review',         label: 'Care Plan Review' },
  { value: 'care_coordination',        label: 'Care Coordination' },
  { value: 'medication_review',        label: 'Medication Review' },
  { value: 'patient_communication',    label: 'Patient Communication' },
  { value: 'referral_coordination',    label: 'Referral Coordination' },
  { value: 'caregiver_communication',  label: 'Caregiver Communication' },
  { value: 'health_education',         label: 'Health Education' },
] as const

type ActivityTypeValue = typeof ACTIVITY_TYPES[number]['value']

// ── Props / emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

// ── Form state ─────────────────────────────────────────────────────────────────
const activityType = ref<ActivityTypeValue | ''>('')
const durationMinutes = ref<number | null>(null)
const activityDate = ref<string>(todayIso())
const note = ref('')
const isRetroactive = ref(false)
const retroactiveExplanation = ref('')

const saving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)

// ── Validation ─────────────────────────────────────────────────────────────────
const validationErrors = computed<string[]>(() => {
  const errs: string[] = []
  if (!activityType.value) errs.push('Activity type is required.')
  if (!durationMinutes.value || durationMinutes.value < 1 || durationMinutes.value > 120) {
    errs.push('Duration must be between 1 and 120 minutes.')
  }
  if (!activityDate.value || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate.value)) {
    errs.push('Activity date is required.')
  }
  if (isRetroactive.value && !retroactiveExplanation.value.trim()) {
    errs.push('Retroactive explanation is required when documenting prior activity.')
  }
  return errs
})

const canSave = computed(() => validationErrors.value.length === 0 && !saving.value)

// ── Retroactive detection ──────────────────────────────────────────────────────
// Auto-check retroactive if date is more than 1 day in the past
watch(activityDate, (val) => {
  if (!val) return
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selected = new Date(val + 'T00:00:00')
  const diffDays = Math.floor((today.getTime() - selected.getTime()) / 86400000)
  if (diffDays > 1) {
    isRetroactive.value = true
  } else {
    isRetroactive.value = false
    retroactiveExplanation.value = ''
  }
})

// Reset form when modal opens
watch(() => props.open, (open) => {
  if (open) resetForm()
})

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayIso(): string {
  return new Date().toISOString().substring(0, 10)
}

function maxDate(): string {
  return todayIso()
}

function resetForm() {
  activityType.value = ''
  durationMinutes.value = null
  activityDate.value = todayIso()
  note.value = ''
  isRetroactive.value = false
  retroactiveExplanation.value = ''
  saveError.value = null
  saveSuccess.value = false
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const body: Record<string, unknown> = {
      client_id: props.clientId,
      activity_type: activityType.value,
      duration_minutes: durationMinutes.value,
      activity_date: activityDate.value,
      note: note.value.trim() || null,
      is_retroactive: isRetroactive.value,
    }
    if (isRetroactive.value) {
      body.retroactive_explanation = retroactiveExplanation.value.trim()
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/clinical-time/log`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json() as { error?: string }

    if (!res.ok) {
      saveError.value = data.error ?? `Error ${res.status}`
      return
    }

    saveSuccess.value = true
    emit('saved')
    // Close after brief success state
    setTimeout(() => {
      emit('close')
    }, 800)
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save time entry'
  } finally {
    saving.value = false
  }
}

function close() {
  if (saving.value) return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        @click.self="close"
      >
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <div class="flex items-center gap-2">
              <Clock :size="18" class="text-teal-600" />
              <h2 class="text-lg font-semibold text-gray-900">Log Clinical Time</h2>
            </div>
            <button
              type="button"
              class="rounded-full p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              :disabled="saving"
              @click="close"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <!-- Attestation statement -->
            <div class="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 leading-relaxed">
              I attest that the time documented below was spent providing qualifying behavioral health integration
              services directly benefiting this patient, consistent with CMS G0323 requirements.
            </div>

            <!-- Activity type -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                Activity Type <span class="text-red-500">*</span>
              </label>
              <select
                v-model="activityType"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              >
                <option value="" disabled>Select activity type…</option>
                <option v-for="type in ACTIVITY_TYPES" :key="type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
            </div>

            <!-- Duration + Date row -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">
                  Duration (minutes) <span class="text-red-500">*</span>
                </label>
                <input
                  v-model.number="durationMinutes"
                  type="number"
                  min="1"
                  max="120"
                  placeholder="e.g. 15"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                />
                <p class="mt-1 text-xs text-gray-400">1–120 minutes</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">
                  Date <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="activityDate"
                  type="date"
                  :max="maxDate()"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>

            <!-- Retroactive banner (auto-shown when date > 1 day ago) -->
            <div
              v-if="isRetroactive"
              class="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"
            >
              <div class="flex items-center gap-2">
                <AlertTriangle :size="14" class="text-amber-600 shrink-0" />
                <span class="text-sm font-medium text-amber-800">Retroactive Documentation</span>
              </div>
              <p class="text-xs text-amber-700 leading-relaxed">
                This entry is dated more than one day in the past. Per CMS guidelines, retroactive documentation
                should include a brief explanation of why the activity was not recorded contemporaneously.
              </p>
              <div>
                <label class="block text-xs font-medium text-amber-800 mb-1">
                  Explanation <span class="text-red-500">*</span>
                </label>
                <textarea
                  v-model="retroactiveExplanation"
                  rows="2"
                  placeholder="e.g. Documentation delayed due to back-to-back appointments…"
                  class="w-full rounded-lg border border-amber-300 px-3 py-2 text-xs text-gray-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none resize-none"
                />
              </div>
            </div>

            <!-- Clinical note -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                Clinical Note
                <span class="text-gray-400 font-normal">(optional — stored in full for audit)</span>
              </label>
              <textarea
                v-model="note"
                rows="3"
                placeholder="Brief description of services provided…"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none resize-none"
              />
            </div>

            <!-- Validation errors -->
            <ul v-if="validationErrors.length" class="space-y-1">
              <li
                v-for="err in validationErrors"
                :key="err"
                class="flex items-start gap-1.5 text-xs text-red-600"
              >
                <span class="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {{ err }}
              </li>
            </ul>

            <!-- Save error -->
            <div v-if="saveError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {{ saveError }}
            </div>

            <!-- Save success -->
            <div v-if="saveSuccess" class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 :size="16" />
              Time entry saved.
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              :disabled="saving"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              :disabled="!canSave"
              @click="save"
            >
              <Loader2 v-if="saving" :size="14" class="animate-spin" />
              <Clock v-else :size="14" />
              {{ saving ? 'Saving…' : 'Save Entry' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
