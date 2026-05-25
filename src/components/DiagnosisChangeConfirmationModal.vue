<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

const props = defineProps<{
  isOpen: boolean
  clientId: string
  clientName: string
  previousIcd10: string
  newIcd10: string
  newIcd10Description: string
  initiatingVisitDate: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

type CoverageAnswer = 'yes' | 'no' | ''

const coverageAnswer = ref<CoverageAnswer>('')
const confirmationNote = ref('')
const isSubmitting = ref(false)
const error = ref<string | null>(null)

// Reset state when modal opens
watch(() => props.isOpen, (open) => {
  if (open) {
    coverageAnswer.value = ''
    confirmationNote.value = ''
    error.value = null
    isSubmitting.value = false
  }
})

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

async function handleConfirm() {
  if (!coverageAnswer.value) return
  if (coverageAnswer.value === 'yes' && !confirmationNote.value.trim()) return

  isSubmitting.value = true
  error.value = null

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/initiating-visit/diagnosis-change`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: props.clientId,
        previousIcd10: props.previousIcd10,
        newIcd10: props.newIcd10,
        newIcd10Description: props.newIcd10Description,
        existingInitiatingVisitCoversNewDiagnosis: coverageAnswer.value === 'yes',
        therapistConfirmationNote: confirmationNote.value.trim(),
      }),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to record diagnosis change')
    }

    emit('confirm')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    isSubmitting.value = false
  }
}

const canConfirm = () =>
  coverageAnswer.value !== '' &&
  (coverageAnswer.value !== 'yes' || confirmationNote.value.trim().length > 0)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="emit('cancel')"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <!-- Header -->
        <div class="flex items-start justify-between p-6 pb-0">
          <h2 class="text-base font-semibold text-gray-900 leading-snug pr-4">
            Diagnosis Update — Confirm Initiating Visit Coverage
          </h2>
          <button @click="emit('cancel')" class="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 space-y-5">
          <!-- Context -->
          <p class="text-sm text-gray-600 leading-relaxed">
            You are updating the primary diagnosis for
            <strong>{{ clientName }}</strong> from
            <span class="font-mono text-gray-800">{{ previousIcd10 }}</span> to
            <span class="font-mono text-gray-800">{{ newIcd10 }}</span>
            ({{ newIcd10Description }}). An initiating visit was documented on
            <strong>{{ formatDate(initiatingVisitDate) }}</strong>.
          </p>

          <!-- Question -->
          <div class="space-y-3">
            <p class="text-sm font-medium text-gray-900">
              Does your existing initiating visit documentation cover this updated diagnosis?
            </p>

            <label class="flex items-start gap-3 cursor-pointer">
              <input
                v-model="coverageAnswer"
                type="radio"
                value="yes"
                class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
              />
              <span class="text-sm text-gray-700">
                Yes — my initiating visit documentation covers this updated diagnosis
              </span>
            </label>

            <label class="flex items-start gap-3 cursor-pointer">
              <input
                v-model="coverageAnswer"
                type="radio"
                value="no"
                class="mt-0.5 h-4 w-4 text-teal-600 border-gray-300 focus:ring-teal-500"
              />
              <span class="text-sm text-gray-700">
                No — I need to document a new initiating visit for this diagnosis
              </span>
            </label>
          </div>

          <!-- Yes: explanation required -->
          <div v-if="coverageAnswer === 'yes'" class="space-y-2">
            <label class="block text-sm font-medium text-gray-700">
              Briefly note how the existing documentation covers the new diagnosis
              <span class="text-gray-400 font-normal">(recorded for audit purposes)</span>
              <span class="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              v-model="confirmationNote"
              rows="3"
              placeholder="e.g. Patient's presentation has evolved; existing initiating visit documentation covers the updated diagnosis."
              class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none placeholder:text-gray-400"
            />
          </div>

          <!-- No: info box -->
          <div
            v-if="coverageAnswer === 'no'"
            class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800"
          >
            After confirming, you will be prompted to document a new initiating visit before
            G0323 billing can continue for this patient.
          </div>

          <!-- Error -->
          <div
            v-if="error"
            class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"
          >
            {{ error }}
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-3 pt-1">
            <button
              @click="emit('cancel')"
              class="text-sm font-medium text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="handleConfirm"
              :disabled="!canConfirm() || isSubmitting"
              class="text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span
                v-if="isSubmitting"
                class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
              />
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
