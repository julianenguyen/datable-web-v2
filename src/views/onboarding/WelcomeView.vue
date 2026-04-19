<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useOnboardingStore } from '@/stores/onboarding'

const router = useRouter()
const onboarding = useOnboardingStore()

const practiceName = ref('Your Practice')
const countdown = ref(5)
let countdownTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  if (onboarding.practiceId) {
    const { data } = await supabase
      .from('practices')
      .select('name')
      .eq('id', onboarding.practiceId)
      .single()
    if (data) practiceName.value = data.name
  }

  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer!)
      router.push('/')
    }
  }, 1000)
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const segment = computed(() => onboarding.practiceSegment)

const tagline = computed(() => {
  if (segment.value === 'insurance_primary' || segment.value === 'mixed') {
    return 'Your 30-day trial includes full access to CPT code documentation and AI-powered clinical tools.'
  }
  return 'Your 30-day trial includes everything you need to deliver better between-session care.'
})

const workflowSteps = [
  {
    icon: '📝',
    title: 'Post-session summary',
    description: 'Document sessions in minutes with AI assistance. Structured notes, no dictation required.',
  },
  {
    icon: '📱',
    title: 'Daily check-in list',
    description: 'Keep clients accountable between sessions. Automated prompts, you review the results.',
  },
  {
    icon: '⚡',
    title: 'Pre-session brief',
    description: 'Walk in prepared every time. A concise brief built from check-in data, waiting each morning.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
    <!-- Logo -->
    <img src="/logo-primary.png" alt="Datable Health" class="h-8 mb-10" />

    <!-- Main content -->
    <div class="text-center max-w-xl w-full">
      <!-- Celebration icon -->
      <div class="text-5xl mb-5">🎉</div>

      <h1 class="text-3xl font-bold text-gray-900 leading-tight">
        Welcome to Datable Health,<br />{{ practiceName }}.
      </h1>

      <p class="mt-4 text-base text-gray-500 leading-relaxed max-w-md mx-auto">
        {{ tagline }}
      </p>

      <!-- Workflow steps -->
      <div class="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          v-for="(step, index) in workflowSteps"
          :key="index"
          class="bg-white border border-gray-200 rounded-2xl p-5 text-left shadow-sm"
        >
          <div class="text-2xl mb-3">{{ step.icon }}</div>
          <p class="text-sm font-semibold text-gray-900 mb-1">{{ step.title }}</p>
          <p class="text-xs text-gray-500 leading-relaxed">{{ step.description }}</p>
        </div>
      </div>

      <!-- CTA button -->
      <div class="mt-8 flex flex-col items-center gap-3">
        <router-link
          to="/invite"
          class="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite Your First Client
        </router-link>

        <button
          @click="router.push('/')"
          class="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Go to dashboard
        </button>
      </div>

      <!-- Auto-redirect countdown -->
      <p class="mt-6 text-xs text-gray-400">
        Taking you to your dashboard in {{ countdown }} second{{ countdown !== 1 ? 's' : '' }}…
      </p>
    </div>
  </div>
</template>
