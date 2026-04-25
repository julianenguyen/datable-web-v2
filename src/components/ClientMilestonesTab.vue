<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'
import { MessageSquare } from 'lucide-vue-next'

const props = defineProps<{
  clientId: string
  clientFirstName: string
}>()

interface Milestone {
  id: string
  domain: string
  domain_label: string
  domain_color: string
  milestone_name: string
  clinical_description: string
  therapist_note: string | null
  data_callout: string | null
  awarded_at: string
  seen_by_patient: boolean
  cycle_label: string | null
}

const milestones = ref<Milestone[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const expanded = ref<Set<string>>(new Set())

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toggleExpand(id: string) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id)
  } else {
    expanded.value.add(id)
  }
  expanded.value = new Set(expanded.value)
}

async function loadMilestones() {
  loading.value = true
  error.value = null
  try {
    const { data: session } = await supabase.auth.getSession()
    const res = await fetch(`${EDGE_FUNCTION_URL}/milestones/client/${props.clientId}`, {
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? ''}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) throw new Error('Failed')
    const data = await res.json()
    milestones.value = data.milestones ?? []
    total.value = data.total ?? 0
  } catch {
    error.value = 'Failed to load milestones.'
  } finally {
    loading.value = false
  }
}

onMounted(loadMilestones)
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <span class="w-6 h-6 border-2 border-gray-200 border-t-teal-600 rounded-full animate-spin" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      {{ error }}
    </div>

    <!-- Empty state -->
    <div v-else-if="milestones.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
      <p class="text-sm font-medium text-gray-500 mb-1">No milestones awarded yet.</p>
      <p class="text-sm text-gray-400">Use the Award Milestone button to recognize {{ clientFirstName }}'s progress.</p>
    </div>

    <!-- Milestone list -->
    <div v-else class="space-y-2">
      <p class="text-xs text-gray-400 mb-4">{{ total }} milestone{{ total === 1 ? '' : 's' }} earned</p>

      <div
        v-for="m in milestones"
        :key="m.id"
        class="border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:border-teal-300 transition-colors flex"
        @click="toggleExpand(m.id)"
      >
        <!-- Domain color left bar -->
        <div class="w-1 shrink-0 rounded-l-xl" :style="{ backgroundColor: m.domain_color }" />

        <!-- Content -->
        <div class="flex-1 min-w-0">
        <!-- Collapsed row -->
        <div class="px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span
                class="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1.5"
                :style="{ backgroundColor: m.domain_color + '20', color: m.domain_color }"
              >
                {{ m.domain_label }}
              </span>
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-gray-900">{{ m.milestone_name }}</p>
                <MessageSquare v-if="m.therapist_note" class="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </div>
            </div>
            <div class="text-right shrink-0">
              <p class="text-xs text-gray-400">{{ formatDate(m.awarded_at) }}</p>
            </div>
          </div>
        </div>

        <!-- Expanded content -->
        <div v-if="expanded.has(m.id)" class="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50">
          <!-- Clinical description -->
          <div class="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
            <p class="text-xs text-gray-700 leading-relaxed">{{ m.clinical_description }}</p>
          </div>

          <!-- Therapist note -->
          <div v-if="m.therapist_note">
            <p class="text-xs font-medium text-gray-500 mb-1">Therapist's note:</p>
            <p class="text-sm text-gray-700 italic leading-relaxed">{{ m.therapist_note }}</p>
          </div>

          <!-- Data callout -->
          <div v-if="m.data_callout">
            <p class="text-xs font-medium text-gray-500 mb-1">Data from this period:</p>
            <p class="text-sm text-gray-500 leading-relaxed">{{ m.data_callout }}</p>
          </div>

          <!-- Cycle label -->
          <div v-if="m.cycle_label">
            <p class="text-xs text-gray-400">Cycle: {{ m.cycle_label }}</p>
          </div>
        </div>
        </div><!-- end flex-1 content wrapper -->
      </div>
    </div>
  </div>
</template>
