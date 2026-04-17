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

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<TherapistProfile | null>(null)
  const initialized = ref(false)
  const profileReady = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('therapists')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      profile.value = data
    }
    profileReady.value = true
  }

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
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

  async function signOut() {
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
    signOut,
  }
})
