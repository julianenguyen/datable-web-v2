<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle2 } from 'lucide-vue-next'

const router = useRouter()

const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMessage = ref('')
const success = ref(false)

const passwordsMatch = computed(
  () => !confirmPassword.value || password.value === confirmPassword.value
)
const isValid = computed(
  () => password.value.length >= 8 && password.value === confirmPassword.value
)

function strengthLabel(pwd: string): { label: string; color: string } | null {
  if (!pwd) return null
  if (pwd.length < 6) return { label: 'Too short', color: 'text-red-500' }
  if (pwd.length < 8) return { label: 'Weak', color: 'text-orange-500' }
  const hasUpper = /[A-Z]/.test(pwd)
  const hasDigit = /\d/.test(pwd)
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd)
  const extras = [hasUpper, hasDigit, hasSpecial].filter(Boolean).length
  if (extras >= 2) return { label: 'Strong', color: 'text-teal-600' }
  if (extras === 1) return { label: 'Fair', color: 'text-amber-500' }
  return { label: 'Weak', color: 'text-orange-500' }
}

const strength = computed(() => strengthLabel(password.value))

async function handleSubmit() {
  errorMessage.value = ''
  if (!isValid.value || loading.value) return

  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value })
    if (error) throw error
    success.value = true
    // Redirect to dashboard after a short delay
    setTimeout(() => router.replace('/'), 2000)
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : ''
    if (msg.includes('same password') || msg.includes('should be different')) {
      errorMessage.value = 'Your new password must be different from your current password.'
    } else if (msg.includes('token') || msg.includes('expired') || msg.includes('invalid')) {
      errorMessage.value = 'This reset link has expired or is invalid. Please request a new one.'
    } else {
      errorMessage.value = 'Something went wrong. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="flex justify-center mb-6">
        <span class="text-2xl font-bold text-teal-600 tracking-tight">Datable</span>
      </div>
      <h2 class="text-center text-2xl font-bold text-gray-900">Set a new password</h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-6 shadow-sm rounded-xl border border-gray-200 sm:px-10">

        <!-- Success state -->
        <template v-if="success">
          <div class="text-center">
            <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              <CheckCircle2 class="text-teal-600" :size="24" />
            </div>
            <h3 class="text-base font-semibold text-gray-900 mb-2">Password updated</h3>
            <p class="text-sm text-gray-500">Your password has been changed. Redirecting you to the dashboard…</p>
          </div>
        </template>

        <!-- Form -->
        <template v-else>
          <p class="text-sm text-gray-500 mb-6">Choose a strong password of at least 8 characters.</p>

          <form class="space-y-5" @submit.prevent="handleSubmit">

            <!-- Error banner -->
            <div
              v-if="errorMessage"
              class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {{ errorMessage }}
            </div>

            <!-- New password -->
            <div>
              <label for="new-password" class="block text-sm font-medium text-gray-700 mb-1">
                New password
              </label>
              <input
                id="new-password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                required
                minlength="8"
                class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                       placeholder-gray-400 shadow-sm focus:border-teal-500 focus:ring-1
                       focus:ring-teal-500 focus:outline-none"
                placeholder="At least 8 characters"
              />
              <!-- Strength indicator -->
              <p v-if="strength" class="mt-1 text-xs" :class="strength.color">
                {{ strength.label }}
              </p>
            </div>

            <!-- Confirm password -->
            <div>
              <label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-1">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                type="password"
                autocomplete="new-password"
                required
                class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                       placeholder-gray-400 shadow-sm focus:border-teal-500 focus:ring-1
                       focus:ring-teal-500 focus:outline-none"
                :class="!passwordsMatch ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''"
                placeholder="Re-enter your password"
              />
              <p v-if="!passwordsMatch" class="mt-1 text-xs text-red-500">
                Passwords do not match.
              </p>
            </div>

            <button
              type="submit"
              :disabled="loading || !isValid"
              class="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5
                     text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Loader2 v-if="loading" class="animate-spin" :size="16" />
              {{ loading ? 'Updating…' : 'Update password' }}
            </button>
          </form>
        </template>

      </div>
    </div>
  </div>
</template>
