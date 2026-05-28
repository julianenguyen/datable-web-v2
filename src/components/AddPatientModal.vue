<script setup lang="ts">
import { ref } from 'vue'
import { X, Loader2 } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

const emit = defineEmits<{
  close: []
  success: [clientId: string]
}>()

const name = ref('')
const email = ref('')
const phone = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function submit() {
  error.value = null
  if (!name.value.trim() || !email.value.trim()) {
    error.value = 'Name and email are required.'
    return
  }

  loading.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(`${EDGE_FUNCTION_URL}/invitations/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim() || undefined,
      }),
    })

    const data = await res.json() as { success: boolean; error?: string; client_id?: string }

    if (!data.success) {
      error.value = data.error ?? 'Something went wrong. Please try again.'
      return
    }

    emit('success', data.client_id!)
    emit('close')
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="emit('close')"
  >
    <!-- Panel -->
    <div class="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
      <!-- Header -->
      <div class="flex items-start justify-between mb-5">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Add a Patient</h2>
          <p class="text-sm text-gray-500 mt-0.5">An invitation will be sent to their email address.</p>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-0.5"
        >
          <X :size="20" />
        </button>
      </div>

      <!-- Error banner -->
      <div
        v-if="error"
        class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
      >
        {{ error }}
      </div>

      <!-- Form -->
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">
            Patient Name <span class="text-red-500">*</span>
          </label>
          <input
            v-model="name"
            type="text"
            placeholder="Sarah Johnson"
            required
            class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">
            Email Address <span class="text-red-500">*</span>
          </label>
          <input
            v-model="email"
            type="email"
            placeholder="sarah@example.com"
            required
            class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">
            Phone Number <span class="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            v-model="phone"
            type="tel"
            placeholder="555-123-4567"
            class="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2 pt-2">
          <button
            type="submit"
            :disabled="loading"
            class="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            <Loader2 v-if="loading" class="animate-spin" :size="15" />
            {{ loading ? 'Sending…' : 'Send Invitation' }}
          </button>
          <button
            type="button"
            @click="emit('close')"
            class="text-sm text-gray-500 hover:text-gray-700 py-1.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
