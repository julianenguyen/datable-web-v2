<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { Plus, X, ArrowLeft } from 'lucide-vue-next'
import { MOCK_CLIENTS } from '@/data/mockClients'

const router = useRouter()
const route = useRoute()

const clientId = route.params.clientId as string
const client = MOCK_CLIENTS.find(c => c.id === clientId)

const themes = ref('')
const strategies = ref('')
const commitments = ref<string[]>([''])
const watchFors = ref('')
const notes = ref('')
const loading = ref(false)
const error = ref('')

function addCommitment() {
  commitments.value.push('')
}

function removeCommitment(index: number) {
  if (commitments.value.length > 1) {
    commitments.value.splice(index, 1)
  }
}

async function handleSubmit() {
  const filled = commitments.value.filter(c => c.trim())
  if (!themes.value.trim() || !strategies.value.trim() || filled.length === 0) {
    error.value = 'Please fill in all required fields and at least one commitment.'
    return
  }

  error.value = ''
  loading.value = true

  try {
    // 1. Create or use existing session cycle
    let cycleId = route.query.cycleId as string | undefined

    if (!cycleId) {
      const { data: cycle, error: cycleError } = await supabase
        .from('session_cycles')
        .insert({
          client_id: clientId,
          therapist_id: (await supabase.auth.getUser()).data.user?.id,
          session_date: new Date().toISOString().split('T')[0],
          status: 'active',
        })
        .select()
        .single()

      if (cycleError) throw cycleError
      cycleId = cycle.id
    }

    // 2. Save session summary
    const { error: summaryError } = await supabase
      .from('session_summaries')
      .insert({
        cycle_id: cycleId,
        themes: themes.value.trim(),
        strategies: strategies.value.trim(),
        commitments: filled,
        watch_fors: watchFors.value.trim() || null,
        notes: notes.value.trim() || null,
      })

    if (summaryError) throw summaryError

    // 3. Call AI edge function to generate check-in list
    const { data: aiData, error: aiError } = await supabase.functions.invoke('generate-checkin-list', {
      body: {
        cycleId,
        themes: themes.value.trim(),
        strategies: strategies.value.trim(),
        commitments: filled,
        watchFors: watchFors.value.trim(),
      },
    })

    if (aiError) throw new Error('AI generation failed. Please try again.')

    // 4. Navigate to approval screen
    router.push({
      name: 'checkin-approval',
      params: { clientId },
      query: { cycleId, listId: aiData.listId },
    })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppLayout>
    <div class="flex-1 max-w-2xl mx-auto w-full p-8">
      <!-- Back -->
      <button
        @click="router.back()"
        class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Back to roster
      </button>

      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-xl font-semibold text-gray-900">Post-Session Summary</h1>
        <p v-if="client" class="text-sm text-gray-500 mt-0.5">{{ client.name }}</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-5">
        <!-- Session themes -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">
            Session themes <span class="text-red-500">*</span>
          </label>
          <p class="text-xs text-gray-500 mb-3">What was discussed? (2–3 sentences)</p>
          <textarea
            v-model="themes"
            rows="3"
            required
            placeholder="e.g., Explored the pattern of avoidance around difficult conversations at work. Client connected this to childhood dynamics with a critical parent…"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
        </div>

        <!-- Strategies -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">
            Strategies or tools introduced <span class="text-red-500">*</span>
          </label>
          <p class="text-xs text-gray-500 mb-3">Techniques assigned or practiced in session</p>
          <textarea
            v-model="strategies"
            rows="3"
            required
            placeholder="e.g., Introduced the STOP technique for moments of reactive anger. Practiced a brief body scan together. Discussed journaling as a nightly wind-down…"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
        </div>

        <!-- Commitments -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">
            Client commitments / action items <span class="text-red-500">*</span>
          </label>
          <p class="text-xs text-gray-500 mb-3">Specific things the client agreed to do before the next session</p>

          <div class="space-y-2">
            <div
              v-for="(commitment, index) in commitments"
              :key="index"
              class="flex items-center gap-2"
            >
              <input
                v-model="commitments[index]"
                type="text"
                :placeholder="`Action item ${index + 1}…`"
                class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
              />
              <button
                v-if="commitments.length > 1"
                type="button"
                @click="removeCommitment(index)"
                class="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            @click="addCommitment"
            class="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 mt-3 transition-colors"
          >
            <Plus class="w-4 h-4" />
            Add another
          </button>
        </div>

        <!-- Watch-fors -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">Watch-fors</label>
          <p class="text-xs text-gray-500 mb-3">Things to monitor before the next session (optional)</p>
          <textarea
            v-model="watchFors"
            rows="2"
            placeholder="e.g., Watch for signs of isolation — client mentioned feeling disconnected from friends this week…"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
        </div>

        <!-- Notes -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">Notes</label>
          <p class="text-xs text-gray-500 mb-3">Private clinical notes — not visible to the client (optional)</p>
          <textarea
            v-model="notes"
            rows="3"
            placeholder="e.g., Client showed signs of progress around emotional regulation. Consider revisiting attachment framework next session…"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
        </div>

        <!-- Error -->
        <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {{ error }}
        </div>

        <!-- Submit -->
        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="loading"
            class="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <span v-if="loading" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            {{ loading ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
      </form>
    </div>
  </AppLayout>
</template>
