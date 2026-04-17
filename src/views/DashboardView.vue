<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { MOCK_CLIENTS } from '@/data/mockClients'
import { AlertTriangle, Clock, CheckCircle2, Plus, FileText, ChevronRight } from 'lucide-vue-next'

const router = useRouter()
const search = ref('')

const sortedClients = computed(() => {
  const filtered = MOCK_CLIENTS.filter(c =>
    c.name.toLowerCase().includes(search.value.toLowerCase())
  )
  return [...filtered].sort((a, b) => {
    // Flagged first
    if (a.isFlagged && !b.isFlagged) return -1
    if (!a.isFlagged && b.isFlagged) return 1
    // Then by next session date ascending
    if (!a.nextSessionDate) return 1
    if (!b.nextSessionDate) return -1
    return a.nextSessionDate.localeCompare(b.nextSessionDate)
  })
})

function formatSessionDate(date: string | null) {
  if (!date) return '—'
  const d = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return `In ${diff} days`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function completionColor(completed: number, total: number) {
  if (total === 0) return 'text-gray-400'
  const pct = completed / total
  if (pct >= 0.8) return 'text-green-600'
  if (pct >= 0.5) return 'text-amber-600'
  return 'text-red-500'
}

function lastLogLabel(days: number | null) {
  if (days === null) return 'No logs yet'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function openNewSessionSummary(clientId: string, cycleId: string | null) {
  router.push({ name: 'session-summary', params: { clientId }, query: { cycleId: cycleId ?? '' } })
}

function openClientDetail(clientId: string) {
  router.push({ name: 'client-detail', params: { clientId } })
}
</script>

<template>
  <AppLayout>
    <div class="flex-1 p-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-xl font-semibold text-gray-900">Client Roster</h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ MOCK_CLIENTS.filter(c => c.status === 'active').length }} active clients</p>
        </div>
        <button
          @click="router.push({ name: 'invite-client' })"
          class="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus class="w-4 h-4" />
          Invite New Client
        </button>
      </div>

      <!-- Search -->
      <div class="mb-5">
        <input
          v-model="search"
          type="text"
          placeholder="Search clients…"
          class="w-72 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      <!-- Client list -->
      <div class="space-y-2">
        <div
          v-for="client in sortedClients"
          :key="client.id"
          class="bg-white border rounded-xl transition-all"
          :class="client.isFlagged ? 'border-red-200 shadow-sm' : 'border-gray-200'"
        >
          <div class="flex items-center gap-4 px-5 py-4">
            <!-- Flag indicator -->
            <div class="shrink-0 w-1.5 self-stretch rounded-full" :class="client.isFlagged ? 'bg-red-400' : 'bg-transparent'" />

            <!-- Client info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <button
                  @click="openClientDetail(client.id)"
                  class="text-sm font-semibold text-gray-900 hover:text-teal-700 transition-colors"
                >
                  {{ client.name }}
                </button>
                <span
                  v-if="client.status === 'pending'"
                  class="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                >
                  Invite pending
                </span>
                <span
                  v-if="client.isFlagged"
                  class="flex items-center gap-1 text-xs font-medium text-red-600"
                >
                  <AlertTriangle class="w-3.5 h-3.5" />
                  Flagged
                </span>
              </div>
              <p v-if="client.isFlagged && client.flagReason" class="text-xs text-red-500 mb-2">
                {{ client.flagReason }}
              </p>

              <!-- Stats row -->
              <div class="flex items-center gap-5 text-xs text-gray-500">
                <!-- Next session -->
                <div class="flex items-center gap-1.5">
                  <Clock class="w-3.5 h-3.5" />
                  <span>{{ formatSessionDate(client.nextSessionDate) }}</span>
                </div>

                <!-- Last log -->
                <div class="flex items-center gap-1.5">
                  <FileText class="w-3.5 h-3.5" />
                  <span>{{ lastLogLabel(client.daysLastLog) }}</span>
                </div>

                <!-- Check-in completion -->
                <div v-if="client.checkinTotal > 0" class="flex items-center gap-1.5">
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  <span :class="completionColor(client.checkinCompleted, client.checkinTotal)">
                    {{ client.checkinCompleted }} of {{ client.checkinTotal }} days logged
                  </span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="client.status === 'active'"
                @click="openNewSessionSummary(client.id, client.cycleId)"
                class="text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                New Session Summary
              </button>
              <button
                @click="openClientDetail(client.id)"
                class="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ChevronRight class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="sortedClients.length === 0" class="text-center py-16 text-gray-400">
          <p class="text-sm">No clients found.</p>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
