<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Info, XCircle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

const router = useRouter()

interface CredentialStatus {
  onboarding_complete: boolean
  billing_enabled?: boolean
  billing_lock_reason?: string | null
  days_until_expiration?: number | null
  expiration_warning_level?: 'yellow' | 'orange' | 'expired' | null
  oig_excluded?: boolean
  oig_flagged?: boolean
  caqh_id?: string | null
  caqh_days_since_attestation?: number | null
  caqh_reminder_due?: boolean
}

const status = ref<CredentialStatus | null>(null)
const loaded = ref(false)

onMounted(async () => {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''
    if (!token) return

    const res = await fetch(`${EDGE_FUNCTION_URL}/credentials/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) return

    status.value = await res.json() as CredentialStatus
  } catch {
    // Non-fatal — banner simply does not render
  } finally {
    loaded.value = true
  }
})

type BannerVariant = 'blue' | 'red' | 'amber' | 'yellow'

interface BannerConfig {
  variant: BannerVariant
  message: string
  linkText?: string
  linkHref?: string
  linkExternal?: boolean
}

// Computed so the template reads one stable value per render cycle
// instead of calling getBannerConfig() 8+ times with a non-null assertion.
const bannerConfig = computed<BannerConfig | null>(() => {
  const s = status.value
  if (!s || !loaded.value) return null

  // Onboarding incomplete
  if (!s.onboarding_complete) {
    return {
      variant: 'blue',
      message: 'Complete your billing setup to unlock G0323 insurance billing features.',
      linkText: 'Set up billing',
      linkHref: '/billing-setup',
    }
  }

  // OIG exclusion — no self-service path, never reveal reason
  if (s.billing_lock_reason === 'oig_excluded' || s.oig_flagged) {
    return {
      variant: 'red',
      message:
        'Your billing features are currently unavailable. Please contact support@datable.health for assistance.',
    }
  }

  // NPI unverified (e.g. after annual re-verification failure)
  if (s.billing_lock_reason === 'npi_unverified') {
    return {
      variant: 'red',
      message:
        'Your NPI could not be verified. Billing features are locked until your credentials are updated.',
      linkText: 'Update credentials',
      linkHref: '/settings/credentials',
    }
  }

  // License expired
  if (s.billing_lock_reason === 'license_expired' || s.expiration_warning_level === 'expired') {
    return {
      variant: 'red',
      message:
        'Your license has expired. Billing features are locked. Update your license expiration date to restore access.',
      linkText: 'Update credentials',
      linkHref: '/settings/credentials',
    }
  }

  // License expiring in 1–30 days
  if (s.expiration_warning_level === 'orange') {
    return {
      variant: 'amber',
      message: `Your license expires in ${s.days_until_expiration} days. Billing features will be suspended on your expiration date.`,
      linkText: 'Update credentials',
      linkHref: '/settings/credentials',
    }
  }

  // License expiring in 31–90 days
  if (s.expiration_warning_level === 'yellow') {
    return {
      variant: 'yellow',
      message: `Your license expires in ${s.days_until_expiration} days. Please renew your license to avoid billing interruption.`,
      linkText: 'Update credentials',
      linkHref: '/settings/credentials',
    }
  }

  // Supervision status lock
  if (s.billing_lock_reason === 'supervision_status') {
    return {
      variant: 'amber',
      message:
        'Billing features require independent licensure. Clinical features are fully available. Update your supervision status when you receive your independent license.',
      linkText: 'Update credentials',
      linkHref: '/settings/credentials',
    }
  }

  // TIN missing (billing profile not yet completed)
  if (s.billing_lock_reason === 'tin_missing') {
    return {
      variant: 'blue',
      message: 'Your billing setup is incomplete. Add your TIN to unlock billing features.',
      linkText: 'Complete billing setup',
      linkHref: '/billing-setup',
    }
  }

  // CAQH re-attestation reminder (only shown when no other banner)
  if (s.caqh_reminder_due && s.billing_enabled) {
    return {
      variant: 'blue',
      message:
        'Your CAQH ProView profile is due for re-attestation. Re-attest now to avoid commercial payer claim denials.',
      linkText: 'Re-attest on CAQH ProView',
      linkHref: 'https://proview.caqh.org',
      linkExternal: true,
    }
  }

  // All clear
  return null
})

const variantClasses: Record<BannerVariant, { wrapper: string; icon: string; text: string; link: string }> = {
  blue: {
    wrapper: 'bg-blue-50 border border-blue-200',
    icon: 'text-blue-500',
    text: 'text-blue-800',
    link: 'text-blue-700 underline font-medium hover:text-blue-900',
  },
  red: {
    wrapper: 'bg-red-50 border border-red-200',
    icon: 'text-red-500',
    text: 'text-red-800',
    link: 'text-red-700 underline font-medium hover:text-red-900',
  },
  amber: {
    wrapper: 'bg-amber-50 border border-amber-200',
    icon: 'text-amber-500',
    text: 'text-amber-800',
    link: 'text-amber-700 underline font-medium hover:text-amber-900',
  },
  yellow: {
    wrapper: 'bg-yellow-50 border border-yellow-200',
    icon: 'text-yellow-500',
    text: 'text-yellow-800',
    link: 'text-yellow-700 underline font-medium hover:text-yellow-900',
  },
}

function handleLinkClick(banner: BannerConfig, event: MouseEvent) {
  if (!banner.linkHref) return
  if (banner.linkExternal) return // let the <a> handle it
  event.preventDefault()
  router.push(banner.linkHref)
}

</script>

<template>
  <template v-if="bannerConfig !== null">
    <div
      :class="['px-4 py-3 flex items-start gap-3 rounded-none text-sm', variantClasses[bannerConfig!.variant].wrapper]"
      role="alert"
    >
      <component
        :is="bannerConfig!.variant === 'blue' ? Info : bannerConfig!.variant === 'red' ? XCircle : AlertTriangle"
        class="w-4 h-4 shrink-0 mt-0.5"
        :class="variantClasses[bannerConfig!.variant].icon"
      />
      <span :class="variantClasses[bannerConfig!.variant].text">
        {{ bannerConfig!.message }}
        <a
          v-if="bannerConfig!.linkText"
          :href="bannerConfig!.linkHref ?? '#'"
          :target="bannerConfig!.linkExternal ? '_blank' : undefined"
          :rel="bannerConfig!.linkExternal ? 'noopener noreferrer' : undefined"
          :class="['ml-1.5', variantClasses[bannerConfig!.variant].link]"
          @click="handleLinkClick(bannerConfig!, $event)"
        >
          {{ bannerConfig!.linkText }}
        </a>
      </span>
    </div>
  </template>
</template>
