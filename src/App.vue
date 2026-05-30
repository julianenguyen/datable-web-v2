<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import OnboardingWizard from '@/components/OnboardingWizard.vue'
import { useOnboardingStore } from '@/stores/onboarding'

const auth = useAuthStore()
const onboarding = useOnboardingStore()
const route = useRoute()

// Only show the wizard on authenticated app routes (not onboarding/auth pages)
const isAppRoute = () => !route.meta.public && !route.meta.onboarding

// Clear the credential flag on sign-out so the next user starts fresh
watch(() => auth.isAuthenticated, (authed) => {
  if (!authed) onboarding.reset()
})
</script>

<template>
  <router-view />

  <!-- Single instance for the entire app — never remounts during navigation -->
  <OnboardingWizard
    v-if="auth.isAuthenticated && isAppRoute() && !onboarding.credentialWizardDone"
    @complete="onboarding.markCredentialWizardDone()"
  />
</template>
