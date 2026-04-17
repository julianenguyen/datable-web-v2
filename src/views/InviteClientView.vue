<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, CheckCircle2 } from 'lucide-vue-next'

const router = useRouter()

const name = ref('')
const email = ref('')
const phone = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function handleInvite() {
  if (!name.value.trim()) {
    error.value = 'Client name is required.'
    return
  }
  error.value = ''
  loading.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated.')

    // Create client record with pending status
    const { error: clientError } = await supabase
      .from('clients')
      .insert({
        therapist_id: user.id,
        name: name.value.trim(),
        email: email.value.trim() || null,
        phone: phone.value.trim() || null,
        status: 'pending',
      })

    if (clientError) throw clientError

    // Trigger invite SMS/email via edge function
    await supabase.functions.invoke('send-client-invite', {
      body: {
        name: name.value.trim(),
        email: email.value.trim() || null,
        phone: phone.value.trim() || null,
      },
    })

    success.value = true
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppLayout>
    <div class="flex-1 max-w-lg mx-auto w-full p-8">
      <button
        @click="router.push('/')"
        class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Back to roster
      </button>

      <div class="mb-6">
        <h1 class="text-xl font-semibold text-gray-900">Invite New Client</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          The client will receive a link to download the Datable app and complete onboarding.
        </p>
      </div>

      <!-- Success state -->
      <div v-if="success" class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle2 class="w-10 h-10 text-green-500 mx-auto mb-3" />
        <h2 class="text-base font-semibold text-gray-900 mb-1">Invite sent!</h2>
        <p class="text-sm text-gray-600 mb-4">
          {{ name }} will receive a link to join Datable. Their status will show as "Invite pending" until they complete onboarding.
        </p>
        <button
          @click="router.push('/')"
          class="text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          Back to roster →
        </button>
      </div>

      <form v-else @submit.prevent="handleInvite" class="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">
            Client name <span class="text-red-500">*</span>
          </label>
          <input
            v-model="name"
            type="text"
            required
            placeholder="Full name"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
          <input
            v-model="email"
            type="email"
            placeholder="client@email.com"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
          <input
            v-model="phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
          <p class="text-xs text-gray-400 mt-1">Used to send the invite link via SMS</p>
        </div>

        <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span v-if="loading" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          {{ loading ? 'Sending invite…' : 'Send Invite' }}
        </button>
      </form>
    </div>
  </AppLayout>
</template>
