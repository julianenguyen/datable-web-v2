import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export interface TherapistProfile {
  id: string
  name: string
  email: string
  license_type: string | null
  practice_name: string | null
  notification_defaults: { cadence: string; time: string }
}

export interface ClinicianProfile {
  id: string
  name: string
  email: string
  practice_id: string
  role: string
  license_type: string
  license_state: string
  license_number: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<TherapistProfile | ClinicianProfile | null>(null)
  const initialized = ref(false)
  const profileReady = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  async function loadProfile(userId: string) {
    // Try clinicians table first (new provider accounts)
    const { data: clinicianData } = await supabase
      .from('clinicians')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (clinicianData) {
      profile.value = clinicianData as ClinicianProfile
      profileReady.value = true
      return
    }

    // Fall back to therapists table (existing accounts)
    const { data: therapistData } = await supabase
      .from('therapists')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (therapistData) {
      profile.value = therapistData as TherapistProfile
    }

    profileReady.value = true
  }

  async function init() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    user.value = session?.user ?? null

    if (user.value) {
      setTimeout(() => loadProfile(user.value!.id), 0)
    } else {
      profileReady.value = true
    }

    initialized.value = true

    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
      profileReady.value = false
      profile.value = null

      if (user.value) {
        setTimeout(() => loadProfile(user.value!.id), 0)
      } else {
        profileReady.value = true
      }
    })
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(name: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
        data: { name },
      },
    })
    if (error) throw error
    if (!data.user) throw new Error('Signup failed — no user returned.')

    user.value = data.user
    // onboarding_progress row is created automatically via DB trigger (handle_new_provider_user)
    return data.user
  }

  async function signOut() {
    // Reset onboarding store on sign out
    const { useOnboardingStore } = await import('@/stores/onboarding')
    const onboarding = useOnboardingStore()
    onboarding.reset()
    await supabase.auth.signOut()
  }

  return {
    user,
    profile,
    initialized,
    profileReady,
    isAuthenticated,
    init,
    signIn,
    signUp,
    signOut,
    loadProfile,
  }
})
