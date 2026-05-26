<script setup lang="ts">
import { ref } from 'vue'
import { X, AlertTriangle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

const props = defineProps<{
  isOpen: boolean
  clientId: string
  clientName: string
  onRevoked: () => void
  onCancel: () => void
}>()

const isSubmitting = ref(false)
const error = ref<string | null>(null)
const confirmed = ref(false)

async function handleRevoke() {
  if (!confirmed.value) return
  isSubmitting.value = true
  error.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/consent/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: props.clientId,
        revokedBy: 'therapist',
      }),
    })

    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? 'Failed to revoke consent')
    }

    props.onRevoked()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  confirmed.value = false
  error.value = null
  props.onCancel()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">

        <!-- Header -->
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle class="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-900 mb-0.5">Revoke BHI Consent</h3>
              <p class="text-xs text-gray-500">{{ clientName }}</p>
            </div>
          </div>
          <button @click="handleCancel" class="text-gray-400 hover:text-gray-600 mt-0.5">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Warning -->
        <div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <p class="text-sm text-red-700 leading-relaxed">
            <strong>This action will immediately lock BHI billing for {{ clientName }}.</strong>
            A revocation record will be added to the patient's medical record. This action
            cannot be undone — a new consent must be documented to resume billing.
          </p>
        </div>

        <!-- Confirmation checkbox -->
        <label class="flex items-start gap-3 cursor-pointer mb-5">
          <input
            v-model="confirmed"
            type="checkbox"
            class="mt-0.5 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
          />
          <span class="text-sm text-gray-700 leading-relaxed">
            I confirm that <strong>{{ clientName }}</strong> has verbally requested to withdraw
            their consent for BHI services. I understand this will lock billing until a new
            consent is documented.
          </span>
        </label>

        <!-- Error -->
        <div
          v-if="error"
          class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-4"
        >
          {{ error }}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button
            @click="handleCancel"
            class="flex-1 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            @click="handleRevoke"
            :disabled="!confirmed || isSubmitting"
            class="flex-1 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span
              v-if="isSubmitting"
              class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
            />
            Revoke Consent
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>
