<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { Loader2, ArrowLeft } from 'lucide-vue-next'

const email = ref('')
const loading = ref(false)
// Always shown after submission — never reveals whether the address exists
const submitted = ref(false)

async function handleSubmit() {
  if (!email.value.trim() || loading.value) return

  loading.value = true
  try {
    // Fire-and-forget — we intentionally ignore any error to avoid leaking
    // whether an email address is registered in the system.
    await supabase.auth.resetPasswordForEmail(email.value.trim(), {
      redirectTo: window.location.origin + '/update-password',
    })
  } catch {
    // Swallow — same confirmation shown regardless of outcome
  } finally {
    loading.value = false
    submitted.value = true
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="flex justify-center mb-6">
        <span class="text-2xl font-bold text-teal-600 tracking-tight">Datable</span>
      </div>
      <h2 class="text-center text-2xl font-bold text-gray-900">Reset your password</h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-6 shadow-sm rounded-xl border border-gray-200 sm:px-10">

        <!-- Success state — always shown after submit, regardless of whether email exists -->
        <template v-if="submitted">
          <div class="text-center">
            <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              <svg class="h-6 w-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h3 class="text-base font-semibold text-gray-900 mb-2">Check your email</h3>
            <p class="text-sm text-gray-500 mb-6">
              If that email address is associated with an account, we've sent a link to reset your password. The link expires in 1 hour.
            </p>
            <router-link
              to="/login"
              class="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              <ArrowLeft :size="15" />
              Back to login
            </router-link>
          </div>
        </template>

        <!-- Request form -->
        <template v-else>
          <p class="text-sm text-gray-500 mb-6">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <form class="space-y-5" @submit.prevent="handleSubmit">
            <div>
              <label for="reset-email" class="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="reset-email"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                       placeholder-gray-400 shadow-sm focus:border-teal-500 focus:ring-1
                       focus:ring-teal-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              :disabled="loading || !email.trim()"
              class="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5
                     text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Loader2 v-if="loading" class="animate-spin" :size="16" />
              {{ loading ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>

          <p class="mt-6 text-center text-sm text-gray-500">
            <router-link
              to="/login"
              class="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium"
            >
              <ArrowLeft :size="13" />
              Back to login
            </router-link>
          </p>
        </template>

      </div>
    </div>
  </div>
</template>
