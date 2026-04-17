<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { logPhiAccess } from '@/lib/audit'
import { ArrowLeft } from 'lucide-vue-next'
import { MOCK_CLIENTS } from '@/data/mockClients'
import { WHEEL_OF_LIFE } from '@/data/wheelOfLife'

const router = useRouter()
const route = useRoute()
const clientId = route.params.clientId as string
const briefId = route.query.briefId as string
const client = MOCK_CLIENTS.find(c => c.id === clientId)

interface BriefContent {
  cycle_summary: string
  flagged_events: { date: string; mood_score: number; note: string }[]
  biometric_summary: string
  suggested_openers: string[]
  wheel_summary: Record<string, { count: number; subcategories: string[]; notes: string[] }>
  client_reflection?: { week_summary: string; progress: string; agenda: string }
}

const brief = ref<{ content: BriefContent; therapist_notes: string | null; generated_at: string } | null>(null)
const therapistNotes = ref('')
const savingNotes = ref(false)
const loading = ref(true)

onMounted(async () => {
  if (!briefId) { loading.value = false; return }
  const { data } = await supabase
    .from('presession_briefs')
    .select('content, therapist_notes, generated_at')
    .eq('id', briefId)
    .single()

  if (data) {
    brief.value = data as typeof brief.value
    therapistNotes.value = data.therapist_notes ?? ''
    logPhiAccess(clientId, 'presession_brief', 'read', briefId)
  }
  loading.value = false
})

async function saveNotes() {
  savingNotes.value = true
  await supabase
    .from('presession_briefs')
    .update({ therapist_notes: therapistNotes.value })
    .eq('id', briefId)
  savingNotes.value = false
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const wheelCategories = Object.entries(WHEEL_OF_LIFE)
</script>

<template>
  <AppLayout>
    <div class="flex-1 max-w-3xl mx-auto w-full p-8">
      <button
        @click="router.back()"
        class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Back
      </button>

      <div class="mb-6">
        <h1 class="text-xl font-semibold text-gray-900">Pre-Session Brief</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          {{ client?.name }}
          <span v-if="brief"> · Generated {{ formatDate(brief.generated_at) }}</span>
        </p>
      </div>

      <div v-if="loading" class="text-sm text-gray-400 py-12 text-center">Loading brief…</div>

      <template v-else-if="brief">
        <div class="space-y-5">

          <!-- Cycle summary -->
          <div class="bg-white border border-gray-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cycle Summary</h2>
            <p class="text-sm text-gray-800 leading-relaxed">{{ brief.content.cycle_summary }}</p>
          </div>

          <!-- Wheel of Life -->
          <div class="bg-white border border-gray-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Wheel of Life Activity</h2>
            <div class="space-y-2">
              <template v-for="[key, cat] in wheelCategories" :key="key">
                <div
                  v-if="brief.content.wheel_summary?.[key]?.count > 0"
                  class="border border-gray-100 rounded-lg p-3"
                >
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm font-semibold text-gray-900">{{ cat.label }}</span>
                    <span class="text-xs text-gray-400">{{ brief.content.wheel_summary[key].count }} entries</span>
                    <span
                      v-for="sub in brief.content.wheel_summary[key].subcategories"
                      :key="sub"
                      class="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-600"
                    >{{ sub }}</span>
                  </div>
                  <p v-for="note in brief.content.wheel_summary[key].notes" :key="note" class="text-sm text-gray-700 mb-1">
                    "{{ note }}"
                  </p>
                </div>
                <div v-else class="flex items-center gap-2 px-3 py-2 rounded-lg opacity-40">
                  <span class="text-sm text-gray-500">{{ cat.label }}</span>
                  <span class="text-xs text-gray-400">No entries</span>
                </div>
              </template>
            </div>
          </div>

          <!-- Flagged events -->
          <div v-if="brief.content.flagged_events?.length > 0" class="bg-red-50 border border-red-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-red-400 uppercase tracking-wide mb-3">Flagged Events</h2>
            <div class="space-y-2">
              <div
                v-for="event in brief.content.flagged_events"
                :key="event.date"
                class="text-sm text-gray-800 bg-white border border-red-100 rounded-lg p-3"
              >
                <p class="text-xs text-red-500 font-medium mb-1">{{ formatDate(event.date) }} · Mood {{ event.mood_score }}/10</p>
                <p>"{{ event.note }}"</p>
              </div>
            </div>
          </div>

          <!-- Biometrics -->
          <div class="bg-white border border-gray-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Biometric Summary</h2>
            <p class="text-sm text-gray-800">{{ brief.content.biometric_summary }}</p>
          </div>

          <!-- Client reflection -->
          <div v-if="brief.content.client_reflection" class="bg-white border border-gray-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Client's Pre-Session Reflection
              <span class="ml-2 text-xs text-gray-300 normal-case tracking-normal">(client's own words)</span>
            </h2>
            <div class="space-y-3">
              <div>
                <p class="text-xs font-medium text-gray-500 mb-1">This past week</p>
                <p class="text-sm text-gray-800">"{{ brief.content.client_reflection.week_summary }}"</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 mb-1">Progress on commitments</p>
                <p class="text-sm text-gray-800">"{{ brief.content.client_reflection.progress }}"</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 mb-1">What I want to focus on today</p>
                <p class="text-sm text-gray-800">"{{ brief.content.client_reflection.agenda }}"</p>
              </div>
            </div>
          </div>

          <!-- AI suggestions -->
          <div class="bg-teal-50 border border-teal-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-1">AI-Suggested Session Openers</h2>
            <p class="text-xs text-teal-500 mb-3">These are AI-generated suggestions, not clinical directives.</p>
            <ol class="space-y-2">
              <li
                v-for="(opener, i) in brief.content.suggested_openers"
                :key="i"
                class="flex gap-3 text-sm text-gray-800"
              >
                <span class="font-semibold text-teal-600 shrink-0">{{ i + 1 }}.</span>
                <span>{{ opener }}</span>
              </li>
            </ol>
          </div>

          <!-- Private therapist notes -->
          <div class="bg-white border border-gray-200 rounded-xl p-5">
            <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Private Notes</h2>
            <p class="text-xs text-gray-400 mb-3">Not visible to the client.</p>
            <textarea
              v-model="therapistNotes"
              rows="4"
              placeholder="Add your private notes here…"
              class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
            />
            <div class="flex justify-end mt-3">
              <button
                @click="saveNotes"
                :disabled="savingNotes"
                class="text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
              >
                {{ savingNotes ? 'Saving…' : 'Save notes' }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="text-sm text-gray-400 py-12 text-center">Brief not found.</div>
    </div>
  </AppLayout>
</template>
