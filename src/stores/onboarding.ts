import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export interface OnboardingProgress {
  id: string
  user_id: string
  practice_id: string | null
  step_account_created: boolean
  step_practice_profile: boolean
  step_clinician_profile: boolean
  step_insurance_selected: boolean
  step_baa_accepted: boolean
  step_trial_activated: boolean
  completed_at: string | null
  updated_at: string
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const progress = ref<OnboardingProgress | null>(null)
  const practiceId = ref<string | null>(null)
  const clinicianId = ref<string | null>(null)
  const practiceSegment = ref<string | null>(null)
  const loading = ref(false)

  const isComplete = computed(() => !!progress.value?.completed_at)

  const currentStepRoute = computed(() => {
    const p = progress.value
    if (!p) return '/onboarding/practice'
    if (!p.step_practice_profile) return '/onboarding/practice'
    if (!p.step_clinician_profile) return '/onboarding/clinician'
    if (!p.step_insurance_selected) return '/onboarding/insurance'
    if (!p.step_baa_accepted) return '/onboarding/baa'
    if (!p.step_trial_activated) return '/onboarding/billing'
    if (!p.completed_at) return '/onboarding/welcome'
    return '/'
  })

  async function loadProgress(userId: string) {
    loading.value = true
    const { data } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (data) {
      progress.value = data as OnboardingProgress
      practiceId.value = data.practice_id
    }
    loading.value = false
    return data
  }

  async function initProgress(userId: string) {
    const { data } = await supabase
      .from('onboarding_progress')
      .insert({ user_id: userId })
      .select()
      .single()
    if (data) progress.value = data as OnboardingProgress
    return data
  }

  async function markStep(
    step: keyof Pick<
      OnboardingProgress,
      | 'step_practice_profile'
      | 'step_clinician_profile'
      | 'step_insurance_selected'
      | 'step_baa_accepted'
      | 'step_trial_activated'
    >,
    updates: Record<string, unknown> = {}
  ) {
    if (!progress.value) return
    const patch: Record<string, unknown> = {
      [step]: true,
      updated_at: new Date().toISOString(),
      ...updates,
    }
    const { data } = await supabase
      .from('onboarding_progress')
      .update(patch)
      .eq('id', progress.value.id)
      .select()
      .single()
    if (data) progress.value = data as OnboardingProgress
  }

  async function complete() {
    if (!progress.value) return
    const { data } = await supabase
      .from('onboarding_progress')
      .update({
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.value.id)
      .select()
      .single()
    if (data) progress.value = data as OnboardingProgress
  }

  function reset() {
    progress.value = null
    practiceId.value = null
    clinicianId.value = null
    practiceSegment.value = null
  }

  return {
    progress,
    practiceId,
    clinicianId,
    practiceSegment,
    loading,
    isComplete,
    currentStepRoute,
    loadProgress,
    initProgress,
    markStep,
    complete,
    reset,
  }
})
