<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { Plus, X, ArrowLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

const clientId = route.params.clientId as string
const cycleId = route.query.cycleId as string | undefined
const summaryId = route.query.summaryId as string | undefined
const isEditing = computed(() => !!summaryId)

const clientName = ref<string>('')
const title = ref('')
const themes = ref('')
const strategies = ref('')
const commitments = ref<string[]>([''])
const watchFors = ref('')
const wins = ref('')
const publicNotes = ref('')
const notes = ref('')
const loading = ref(false)
const submitted = ref(false)
const error = ref('')
const showConfirm = ref(false)

onMounted(async () => {
  const { data } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single()
  if (data) clientName.value = data.name

  if (summaryId) {
    const { data: summary } = await supabase
      .from('session_summaries')
      .select('title, themes, strategies, commitments, watch_fors, wins, public_notes, notes')
      .eq('id', summaryId)
      .single()
    if (summary) {
      title.value = summary.title ?? ''
      themes.value = summary.themes ?? ''
      strategies.value = summary.strategies ?? ''
      commitments.value = (summary.commitments as string[]).length > 0 ? summary.commitments as string[] : ['']
      watchFors.value = summary.watch_fors ?? ''
      wins.value = summary.wins ?? ''
      publicNotes.value = summary.public_notes ?? ''
      notes.value = summary.notes ?? ''
    }
  }
})

function addCommitment() {
  commitments.value.push('')
}

function removeCommitment(index: number) {
  if (commitments.value.length > 1) {
    commitments.value.splice(index, 1)
  }
}

function handleSubmit() {
  const filled = commitments.value.filter(c => c.trim())
  if (!themes.value.trim() || !strategies.value.trim() || filled.length === 0) {
    error.value = 'Please fill in all required fields and at least one commitment.'
    return
  }
  error.value = ''
  showConfirm.value = true
}

async function confirmSave() {
  const filled = commitments.value.filter(c => c.trim())
  showConfirm.value = false
  loading.value = true

  try {
    if (isEditing.value) {
      // Update existing summary
      const { error: updateError } = await supabase
        .from('session_summaries')
        .update({
          title: title.value.trim() || null,
          themes: themes.value.trim(),
          strategies: strategies.value.trim(),
          commitments: filled,
          watch_fors: watchFors.value.trim() || null,
          wins: wins.value.trim() || null,
          public_notes: publicNotes.value.trim() || null,
          notes: notes.value.trim() || null,
        })
        .eq('id', summaryId!)

      if (updateError) throw updateError
    } else {
      // Create new cycle if needed, then insert summary
      let resolvedCycleId = cycleId

      if (!resolvedCycleId) {
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
        resolvedCycleId = cycle.id
      }

      const { error: summaryError } = await supabase
        .from('session_summaries')
        .insert({
          cycle_id: resolvedCycleId,
          title: title.value.trim() || null,
          themes: themes.value.trim(),
          strategies: strategies.value.trim(),
          commitments: filled,
          watch_fors: watchFors.value.trim() || null,
          wins: wins.value.trim() || null,
          public_notes: publicNotes.value.trim() || null,
          notes: notes.value.trim() || null,
        })

      if (summaryError) throw summaryError
    }

    submitted.value = true
    await new Promise(r => setTimeout(r, 1500))
    router.push({ name: 'client-detail', params: { clientId } })
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
        Back
      </button>

      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-xl font-semibold text-gray-900">
          {{ isEditing ? 'Edit Post-Session Summary' : 'Post-Session Summary' }}
        </h1>
        <p v-if="clientName" class="text-sm text-gray-500 mt-0.5">{{ clientName }}</p>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-5">
        <!-- Title -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">Summary title</label>
          <p class="text-xs text-gray-500 mb-3">Shown to the client. Defaults to "Session Summary" if left blank.</p>
          <input
            v-model="title"
            type="text"
            placeholder="Session Summary"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

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
            Action items <span class="text-red-500">*</span>
          </label>
          <p class="text-xs text-gray-500 mb-3">Suggestions that might be helpful to try before the next session</p>

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

        <!-- Wins -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">Wins</label>
          <p class="text-xs text-gray-500 mb-3">Progress or breakthroughs to celebrate — visible to the client (optional)</p>
          <textarea
            v-model="wins"
            rows="3"
            placeholder="e.g., Client initiated a difficult conversation with their partner for the first time. Noticed and named their anxiety before it escalated…"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
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

        <!-- Public notes -->
        <div class="bg-white border border-gray-200 rounded-xl p-5">
          <label class="block text-sm font-semibold text-gray-900 mb-1">Notes for client</label>
          <p class="text-xs text-gray-500 mb-3">Visible to the client — any additional context or encouragement (optional)</p>
          <textarea
            v-model="publicNotes"
            rows="3"
            placeholder="e.g., You showed a lot of courage in today's session. Keep leaning into the discomfort — that's where the growth is…"
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

        <!-- Success -->
        <div v-if="submitted" class="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-5 py-4">
          <svg class="w-5 h-5 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p class="text-sm font-semibold text-teal-800">{{ isEditing ? 'Summary updated' : 'Summary submitted' }}</p>
            <p class="text-xs text-teal-600 mt-0.5">Returning to client profile…</p>
          </div>
        </div>

        <!-- Submit -->
        <div v-else class="flex justify-end">
          <button
            type="submit"
            :disabled="loading"
            class="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <span v-if="loading" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            {{ loading ? 'Saving…' : isEditing ? 'Save changes' : 'Submit' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Confirmation modal -->
    <Teleport to="body">
      <div v-if="showConfirm" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <h2 class="text-base font-semibold text-gray-900 mb-1">
            {{ isEditing ? 'Save changes?' : 'Submit this summary?' }}
          </h2>
          <p class="text-sm text-gray-500 mb-5">
            {{ isEditing
              ? 'Your edits will update what the client sees in their app.'
              : 'This will be visible to the client in their Sessions tab. Make sure everything looks right before sending.' }}
          </p>
          <div class="flex gap-3 justify-end">
            <button
              @click="showConfirm = false"
              class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            >
              Go back
            </button>
            <button
              @click="confirmSave"
              class="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
            >
              {{ isEditing ? 'Yes, save changes' : 'Yes, submit' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </AppLayout>
</template>
