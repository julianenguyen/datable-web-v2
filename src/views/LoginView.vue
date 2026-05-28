<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Loader2 } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

// Map Supabase auth errors to user-friendly messages.
// Never expose raw error text — it may reveal whether an account exists.
function mapAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    message.includes('invalid email or password') ||
    message.includes('email not confirmed')
  ) {
    return 'Incorrect email or password. Please try again.'
  }
  if (message.includes('too many requests') || message.includes('rate limit')) {
    return 'Too many login attempts. Please wait a moment and try again.'
  }
  return 'Something went wrong. Please try again.'
}

async function handleSubmit() {
  errorMessage.value = ''
  if (!email.value.trim() || !password.value) return

  loading.value = true
  try {
    await auth.signIn(email.value.trim(), password.value)

    // Restore any saved redirect path (set by router guard when unauthenticated
    // user tried to access a protected route)
    const redirectPath = sessionStorage.getItem('login_redirect_path')
    sessionStorage.removeItem('login_redirect_path')
    await router.replace(redirectPath ?? '/')
  } catch (err) {
    errorMessage.value = mapAuthError(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <!-- Logo / Brand -->
      <div class="flex justify-center mb-6">
        <span class="text-2xl font-bold text-teal-600 tracking-tight">Datable</span>
      </div>
      <h2 class="text-center text-2xl font-bold text-gray-900">Sign in to your account</h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-6 shadow-sm rounded-xl border border-gray-200 sm:px-10">
        <form class="space-y-5" @submit.prevent="handleSubmit">

          <!-- Error Banner -->
          <div
            v-if="errorMessage"
            class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {{ errorMessage }}
          </div>

          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
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

          <!-- Password -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="password" class="block text-sm font-medium text-gray-700">
                Password
              </label>
              <router-link
                to="/reset-password"
                class="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                Forgot password?
              </router-link>
            </div>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                     placeholder-gray-400 shadow-sm focus:border-teal-500 focus:ring-1
                     focus:ring-teal-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading || !email.trim() || !password"
            class="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5
                   text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 v-if="loading" class="animate-spin" :size="16" />
            {{ loading ? 'Signing in…' : 'Log In' }}
          </button>

        </form>

        <!-- Footer link -->
        <p class="mt-6 text-center text-sm text-gray-500">
          Don't have an account?
          <router-link to="/signup" class="text-teal-600 hover:text-teal-700 font-medium ml-1">
            Create one
          </router-link>
        </p>
      </div>
    </div>
  </div>
</template>
