<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

// Password strength calculation
const passwordStrength = computed(() => {
  const p = password.value
  if (!p) return 0
  let score = 0
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  return score
})

const strengthLabel = computed(() => {
  const s = passwordStrength.value
  if (!password.value) return ''
  if (s <= 1) return 'Weak'
  if (s === 2) return 'Fair'
  if (s === 3) return 'Strong'
  return 'Very strong'
})

const strengthColor = computed(() => {
  const s = passwordStrength.value
  if (s <= 1) return 'bg-red-500'
  if (s === 2) return 'bg-orange-400'
  if (s === 3) return 'bg-yellow-400'
  return 'bg-green-500'
})

const strengthTextColor = computed(() => {
  const s = passwordStrength.value
  if (s <= 1) return 'text-red-600'
  if (s === 2) return 'text-orange-500'
  if (s === 3) return 'text-yellow-600'
  return 'text-green-600'
})

const formErrors = computed(() => {
  const errs: Record<string, string> = {}
  if (name.value && name.value.trim().length < 2) errs.name = 'Please enter your full name.'
  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
    errs.email = 'Please enter a valid email address.'
  if (password.value && password.value.length < 12)
    errs.password = 'Password must be at least 12 characters.'
  if (confirmPassword.value && confirmPassword.value !== password.value)
    errs.confirm = 'Passwords do not match.'
  return errs
})

const isValid = computed(() => {
  return (
    name.value.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value) &&
    password.value.length >= 12 &&
    confirmPassword.value === password.value
  )
})

async function handleSignup() {
  if (!isValid.value) return
  error.value = ''
  loading.value = true
  try {
    await auth.signUp(name.value.trim(), email.value.trim(), password.value)
    router.push({ name: 'verify-email', query: { email: email.value.trim() } })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Signup failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-12 px-4">
    <!-- Logo -->
    <div class="text-center mb-8">
      <img src="/logo-teal.png" alt="Datable Health" class="h-8 mx-auto mb-4" />
      <h1 class="text-xl font-semibold text-gray-900">Create your provider account</h1>
      <p class="text-sm text-gray-500 mt-1">Start your 30-day free trial — no credit card required today</p>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-[480px] p-8">
      <form @submit.prevent="handleSignup" class="space-y-5" novalidate>
        <!-- Full name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
          <input
            v-model="name"
            type="text"
            required
            autocomplete="name"
            placeholder="Dr. Jane Smith"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            :class="formErrors.name ? 'border-red-400' : 'border-gray-300'"
          />
          <p v-if="formErrors.name" class="mt-1 text-xs text-red-600">{{ formErrors.name }}</p>
        </div>

        <!-- Email -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Work email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@practice.com"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            :class="formErrors.email ? 'border-red-400' : 'border-gray-300'"
          />
          <p v-if="formErrors.email" class="mt-1 text-xs text-red-600">{{ formErrors.email }}</p>
        </div>

        <!-- Password -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="new-password"
              placeholder="Minimum 12 characters"
              class="w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
              :class="formErrors.password ? 'border-red-400' : 'border-gray-300'"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              @click="showPassword = !showPassword"
            >
              <svg v-if="!showPassword" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>
          </div>

          <!-- Strength bar -->
          <div v-if="password" class="mt-2">
            <div class="flex gap-1">
              <div
                v-for="i in 4"
                :key="i"
                class="h-1 flex-1 rounded-full transition-all"
                :class="i <= passwordStrength ? strengthColor : 'bg-gray-200'"
              />
            </div>
            <p class="mt-1 text-xs font-medium" :class="strengthTextColor">{{ strengthLabel }}</p>
          </div>

          <p v-if="formErrors.password" class="mt-1 text-xs text-red-600">{{ formErrors.password }}</p>
        </div>

        <!-- Confirm password -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
            placeholder="Re-enter your password"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            :class="formErrors.confirm ? 'border-red-400' : 'border-gray-300'"
          />
          <p v-if="formErrors.confirm" class="mt-1 text-xs text-red-600">{{ formErrors.confirm }}</p>
        </div>

        <!-- Global error -->
        <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="!isValid || loading"
          class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg v-if="loading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>
    </div>

    <p class="text-center text-sm text-gray-500 mt-6">
      Already have an account?
      <router-link to="/auth" class="text-teal-600 hover:text-teal-700 font-medium">Sign in →</router-link>
    </p>

    <p class="text-center text-xs text-gray-400 mt-4">
      By creating an account you agree to our Terms of Service and Privacy Policy.
    </p>
  </div>
</template>
