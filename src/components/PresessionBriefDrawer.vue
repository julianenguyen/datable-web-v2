<script setup lang="ts">
import { X } from 'lucide-vue-next'

const CATEGORY_LABELS: Record<string, string> = {
  career_business: 'Career & Business',
  love_relationships: 'Love & Relationships',
  friends_social: 'Friends & Social',
  family_home: 'Family & Home',
  health_fitness: 'Health & Fitness',
  finance: 'Finance',
  personal_growth: 'Personal Growth',
  fun_recreation: 'Fun & Recreation',
}

function formatCategory(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface WheelEntry {
  category: string
  entry_count: number
  themes: string
}

interface FlaggedEvent {
  log_date: string
  mood_score: number | null
  summary: string
}

interface PresessionReflection {
  week_summary: string | null
  progress: string | null
  agenda: string | null
  session_intent: string | null
  note?: string
}

interface BriefContent {
  cycle_summary: string
  wheel_of_life_summary: WheelEntry[]
  flagged_events: FlaggedEvent[]
  checkin_engagement: string
  presession_reflection: PresessionReflection
  suggested_openers: string[]
  date_range?: { from: string; to: string }
}

interface Brief {
  id: string
  content: BriefContent
  generated_at: string
}

const props = defineProps<{
  open: boolean
  brief: Brief | null
  clientName: string
}>()

const emit = defineEmits<{
  close: []
}>()

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(d)
}

function formatDateShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function moodDotClass(score: number | null) {
  if (score == null) return 'bg-gray-300'
  if (score <= 3) return 'bg-red-500'
  if (score <= 5) return 'bg-amber-400'
  return 'bg-green-500'
}
</script>

<template>
  <Teleport to="body">
    <template v-if="open && brief">
      <!-- Overlay -->
      <div
        class="fixed inset-0 z-40 bg-black/40 transition-opacity"
        @click="emit('close')"
      />

      <!-- Drawer panel -->
      <div
        class="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-transform duration-250"
        :class="open ? 'translate-x-0' : 'translate-x-full'"
        style="width: min(520px, 100vw);"
      >
        <!-- Sticky header -->
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <h2 class="text-base font-semibold text-gray-900">Pre-Session Brief</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              {{ clientName }} · Generated {{ formatRelative(brief.generated_at) }}
            </p>
            <div v-if="brief.content.date_range" class="flex items-center gap-1.5 mt-1.5">
              <span class="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-md px-2 py-0.5 font-medium">
                {{ formatDateShort(brief.content.date_range.from) }} → {{ formatDateShort(brief.content.date_range.to) }}
              </span>
            </div>
          </div>
          <button
            @click="emit('close')"
            aria-label="Close brief"
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors ml-4 shrink-0"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <!-- Cycle Summary -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cycle Summary</h3>
            <p class="text-sm text-gray-800 leading-relaxed">{{ brief.content.cycle_summary }}</p>
          </section>

          <div class="border-t border-gray-100" />

          <!-- Wheel of Life -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Wheel of Life Activity</h3>
            <div v-if="brief.content.wheel_of_life_summary?.length > 0" class="space-y-3">
              <div
                v-for="entry in brief.content.wheel_of_life_summary"
                :key="entry.category"
                class="border border-gray-100 rounded-lg p-3"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-medium text-gray-900">{{ formatCategory(entry.category) }}</span>
                  <span class="text-xs px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-full">{{ entry.entry_count }} {{ entry.entry_count === 1 ? 'entry' : 'entries' }}</span>
                </div>
                <p class="text-sm text-gray-600 leading-relaxed">{{ entry.themes }}</p>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 italic">No Wheel of Life entries were logged this cycle.</p>
          </section>

          <div class="border-t border-gray-100" />

          <!-- Flagged Events -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Flagged Events</h3>
            <div v-if="brief.content.flagged_events?.length > 0" class="space-y-2">
              <div
                v-for="event in brief.content.flagged_events"
                :key="event.log_date"
                class="border border-gray-100 rounded-lg p-3"
              >
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-2 h-2 rounded-full shrink-0" :class="moodDotClass(event.mood_score)" />
                  <span class="text-xs font-medium text-gray-500">
                    {{ formatDate(event.log_date) }}
                    <span v-if="event.mood_score != null"> · Mood {{ event.mood_score }}/10</span>
                  </span>
                </div>
                <p class="text-sm text-gray-700 leading-relaxed">{{ event.summary }}</p>
              </div>
            </div>
            <div v-else class="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
              <span class="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              No flagged events this cycle.
            </div>
          </section>

          <div class="border-t border-gray-100" />

          <!-- Check-In Engagement -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Check-In Engagement</h3>
            <p class="text-sm text-gray-800 leading-relaxed">{{ brief.content.checkin_engagement }}</p>
          </section>

          <div class="border-t border-gray-100" />

          <!-- Pre-Session Reflection -->
          <section>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Client's Pre-Session Reflection</h3>
            <div v-if="brief.content.presession_reflection?.week_summary || brief.content.presession_reflection?.progress || brief.content.presession_reflection?.agenda || brief.content.presession_reflection?.session_intent" class="space-y-3">
              <!-- Support they're looking for — shown prominently at top -->
              <div v-if="brief.content.presession_reflection.session_intent" class="bg-teal-50 border-l-2 border-teal-500 rounded-r-lg px-3 py-2.5">
                <p class="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-1">Support they're looking for</p>
                <p class="text-sm text-teal-900 font-medium">{{ brief.content.presession_reflection.session_intent }}</p>
              </div>
              <div v-if="brief.content.presession_reflection.week_summary">
                <p class="text-xs font-medium text-gray-500 mb-1">How was your week?</p>
                <p class="text-sm text-gray-800 pl-3 border-l-2 border-gray-200 leading-relaxed">"{{ brief.content.presession_reflection.week_summary }}"</p>
              </div>
              <div v-if="brief.content.presession_reflection.progress">
                <p class="text-xs font-medium text-gray-500 mb-1">What progress did you make?</p>
                <p class="text-sm text-gray-800 pl-3 border-l-2 border-gray-200 leading-relaxed">"{{ brief.content.presession_reflection.progress }}"</p>
              </div>
              <div v-if="brief.content.presession_reflection.agenda">
                <p class="text-xs font-medium text-gray-500 mb-1">What do you want to focus on today?</p>
                <p class="text-sm text-gray-800 pl-3 border-l-2 border-gray-200 leading-relaxed">"{{ brief.content.presession_reflection.agenda }}"</p>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 italic">
              {{ brief.content.presession_reflection?.note ?? 'Client has not submitted a pre-session reflection for this cycle.' }}
            </p>
          </section>

          <div class="border-t border-gray-100" />

          <!-- Suggested Openers -->
          <section>
            <div class="flex items-center gap-2 mb-3">
              <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Suggested Session Openers</h3>
              <span class="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full font-medium">AI-Generated</span>
            </div>
            <ol class="space-y-2">
              <li
                v-for="(opener, i) in brief.content.suggested_openers"
                :key="i"
                class="flex gap-3 text-sm text-gray-800"
              >
                <span class="font-semibold text-teal-600 shrink-0">{{ i + 1 }}.</span>
                <span class="leading-relaxed">{{ opener }}</span>
              </li>
            </ol>
            <p class="text-xs text-gray-400 mt-3 leading-relaxed">
              These are AI-generated conversation starters based on the client's data. Use at your professional discretion.
            </p>
          </section>

        </div>

        <!-- Footer -->
        <div class="border-t border-gray-200 px-6 py-4 shrink-0 bg-gray-50">
          <p class="text-xs text-gray-400 leading-relaxed">
            AI suggestions are generated to assist clinical preparation. They are not clinical directives and should be used at the therapist's professional discretion.
          </p>
        </div>
      </div>
    </template>
  </Teleport>
</template>
