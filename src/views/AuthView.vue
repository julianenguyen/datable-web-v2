<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSignIn() {
  error.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    router.push('/')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Sign in failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <img src="/logo-teal.png" alt="Datable Health" class="h-9 mx-auto mb-4" />
        <h1 class="text-xl font-semibold text-gray-900">Datable Health</h1>
        <p class="text-sm text-gray-500 mt-1">Provider portal</p>
      </div>

      <!-- Card -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        <h2 class="text-base font-semibold text-gray-900 mb-6">Sign in to your account</h2>

        <form @submit.prevent="handleSignIn" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@practice.com"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ error }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>

      <p class="text-center text-sm text-gray-500 mt-5">
        New provider?
        <router-link to="/signup" class="text-teal-600 hover:text-teal-700 font-medium">Create an account →</router-link>
      </p>

      <p class="text-center text-xs text-gray-400 mt-4">
        Datable Health is a HIPAA-compliant clinical tool.<br />
        Unauthorized access is prohibited.
      </p>
    </div>
  </div>
</template>
