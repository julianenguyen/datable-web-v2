<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import OnboardingLayout from './OnboardingLayout.vue'

const router = useRouter()
const auth = useAuthStore()
const onboarding = useOnboardingStore()

const hasScrolled = ref(false)
const checkboxChecked = ref(false)
const typedName = ref('')
const error = ref('')
const loading = ref(false)

let practiceName = ref('your practice')

onMounted(async () => {
  if (onboarding.practiceId) {
    const { data } = await supabase
      .from('practices')
      .select('name')
      .eq('id', onboarding.practiceId)
      .single()
    if (data) practiceName.value = data.name
  }
})

function onBaaScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
    hasScrolled.value = true
  }
}

const isValid = computed(() => {
  return hasScrolled.value && checkboxChecked.value && typedName.value.trim().length > 1
})

async function handleAccept() {
  // Note: onboarding.clinicianId is intentionally NOT checked here.
  // Pinia state is in-memory only — clinicianId is null after a page refresh.
  // auth.user.id IS the clinician ID (set during ClinicianProfileView insert),
  // and auth.user is always available from the Supabase session.
  if (!isValid.value || !auth.user || !onboarding.practiceId) return
  error.value = ''
  loading.value = true
  try {
    const { error: dbError } = await supabase.from('baa_acceptances').insert({
      practice_id: onboarding.practiceId,
      clinician_id: auth.user.id,
      baa_version: '2026-04-v1',
      accepted_at: new Date().toISOString(),
      ip_address: 'unavailable',
      typed_name: typedName.value.trim(),
    })

    if (dbError) throw dbError

    await onboarding.markStep('step_baa_accepted')
    router.push('/onboarding/billing')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to record BAA acceptance. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <OnboardingLayout
    :current-step="5"
    title="Business Associate Agreement"
    subtitle="Required by HIPAA before you can invite clients."
  >
    <template #back>
      <router-link
        to="/onboarding/insurance"
        class="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-5 -mt-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </router-link>
    </template>

    <div class="space-y-5">
      <!-- Intro copy -->
      <p class="text-sm text-gray-600 leading-relaxed">
        Before you can invite clients, we need you to sign our Business Associate Agreement (BAA). This is a standard HIPAA requirement that protects both you and your clients. It confirms that Datable Health will handle all client data in compliance with federal privacy law.
      </p>

      <!-- Scrollable BAA -->
      <div class="relative">
        <!-- Anchor links -->
        <div class="flex flex-wrap gap-3 mb-2">
          <a href="#baa-data" class="text-xs text-teal-600 hover:text-teal-700">Data Storage</a>
          <span class="text-xs text-gray-300">|</span>
          <a href="#baa-breach" class="text-xs text-teal-600 hover:text-teal-700">Breach Notification</a>
          <span class="text-xs text-gray-300">|</span>
          <a href="#baa-subcontractors" class="text-xs text-teal-600 hover:text-teal-700">Subcontractors</a>
          <span class="text-xs text-gray-300">|</span>
          <a href="#baa-termination" class="text-xs text-teal-600 hover:text-teal-700">Termination</a>
        </div>

        <div
          class="h-[400px] overflow-y-auto border border-gray-200 rounded-xl p-5 text-xs text-gray-600 leading-relaxed space-y-4 bg-gray-50"
          @scroll="onBaaScroll"
        >
          <div>
            <p class="font-semibold text-gray-800 text-sm">BUSINESS ASSOCIATE AGREEMENT</p>
            <p class="text-gray-500 mt-1">Effective Date: Upon electronic acceptance. Version: 2026-04-v1</p>
            <p class="mt-2">This Business Associate Agreement ("Agreement") is entered into between the covered entity identified in the onboarding process ("Covered Entity" or "Practice") and Datable Health, Inc. ("Business Associate" or "Datable Health"), effective upon electronic acceptance of this Agreement.</p>
          </div>

          <div>
            <p class="font-semibold text-gray-800">1. Definitions</p>
            <p class="mt-1">All terms used but not defined in this Agreement shall have the meanings ascribed to them in the Health Insurance Portability and Accountability Act of 1996 and its implementing regulations, as amended from time to time (collectively, "HIPAA"). "Protected Health Information" or "PHI" means any health information created, received, maintained, or transmitted by Business Associate on behalf of Covered Entity that identifies an individual or could reasonably be used to identify an individual, in any form or medium, that relates to the past, present, or future physical or mental health or condition of an individual, the provision of health care to an individual, or the past, present, or future payment for the provision of health care to an individual.</p>
          </div>

          <div>
            <p class="font-semibold text-gray-800">2. Permitted Uses and Disclosures of PHI</p>
            <p class="mt-1">Business Associate may use and disclose PHI only as follows:</p>
            <p class="mt-1"><strong>(a)</strong> Functions and Activities on Behalf of Covered Entity. Business Associate may use and disclose PHI as necessary to perform the services set forth in the Datable Health Terms of Service, including providing clinical documentation tools, AI-assisted session summaries, patient check-in services, and pre-session preparation materials.</p>
            <p class="mt-1"><strong>(b)</strong> Data Aggregation. Business Associate may use PHI for data aggregation services relating to the health care operations of Covered Entity, provided such use complies with HIPAA.</p>
            <p class="mt-1"><strong>(c)</strong> Management and Administration. Business Associate may use PHI for the proper management and administration of its business and to carry out legal responsibilities, provided that disclosures are required by law or Business Associate obtains reasonable assurances from persons to whom PHI is disclosed that it will be held confidentially.</p>
          </div>

          <div id="baa-data">
            <p class="font-semibold text-gray-800">3. Obligations of Business Associate — Data Storage and Security</p>
            <p class="mt-1">Business Associate agrees to:</p>
            <p class="mt-1"><strong>(a)</strong> Not use or disclose PHI other than as permitted or required by this Agreement or as required by law.</p>
            <p class="mt-1"><strong>(b)</strong> Use appropriate safeguards and comply with Subpart C of 45 CFR Part 164 with respect to electronic PHI, to prevent use or disclosure of PHI other than as provided for by this Agreement.</p>
            <p class="mt-1"><strong>(c)</strong> Store all PHI on infrastructure that is SOC 2 Type II compliant and located in the United States. Data is encrypted at rest using AES-256 and in transit using TLS 1.2 or higher.</p>
            <p class="mt-1"><strong>(d)</strong> Implement and maintain administrative, physical, and technical safeguards consistent with the HIPAA Security Rule.</p>
            <p class="mt-1"><strong>(e)</strong> Report to Covered Entity any use or disclosure of PHI not provided for by this Agreement of which Business Associate becomes aware, including breaches of unsecured PHI as required by 45 CFR § 164.410.</p>
            <p class="mt-1"><strong>(f)</strong> Ensure that any agent, including a subcontractor, to whom it provides PHI agrees to the same restrictions and conditions that apply to Business Associate with respect to such PHI.</p>
            <p class="mt-1"><strong>(g)</strong> Make PHI available to the individual who is the subject of PHI as required under 45 CFR § 164.524, upon request and with reasonable advance notice.</p>
            <p class="mt-1"><strong>(h)</strong> Make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary of the Department of Health and Human Services for purposes of the Secretary's determination of Covered Entity's compliance with HIPAA.</p>
          </div>

          <div id="baa-breach">
            <p class="font-semibold text-gray-800">4. Breach Notification</p>
            <p class="mt-1">In the event of a breach of unsecured PHI, Business Associate shall notify Covered Entity without unreasonable delay and in no case later than 60 calendar days after discovery of a breach. Notification will include, to the extent possible: the identification of each individual whose unsecured PHI has been or is reasonably believed to have been accessed, acquired, used, or disclosed; a brief description of what happened; a description of the types of PHI involved; any steps individuals should take to protect themselves; a brief description of what Business Associate is doing to investigate the breach; and contact procedures for Covered Entity to ask questions or learn additional information.</p>
          </div>

          <div id="baa-subcontractors">
            <p class="font-semibold text-gray-800">5. Subcontractors</p>
            <p class="mt-1">Business Associate may use subcontractors in the performance of services under this Agreement. Business Associate shall ensure that each subcontractor that creates, receives, maintains, or transmits PHI on behalf of Business Associate agrees to the same restrictions, conditions, and requirements that apply to Business Associate pursuant to this Agreement and HIPAA. Current subcontractors with access to PHI include Supabase, Inc. (database infrastructure) and Anthropic, PBC (AI processing — note: PHI is not stored by Anthropic; AI processing uses de-identified or minimized data where possible). Business Associate will update this list and notify Covered Entity of material changes to subcontractor arrangements.</p>
          </div>

          <div>
            <p class="font-semibold text-gray-800">6. Term</p>
            <p class="mt-1">This Agreement shall be effective as of the date first written above and shall terminate on the date that all PHI provided by Covered Entity to Business Associate is destroyed or returned to Covered Entity, or, if it is infeasible to return or destroy PHI, protections are extended to such information in accordance with the termination provisions in this Section.</p>
          </div>

          <div id="baa-termination">
            <p class="font-semibold text-gray-800">7. Termination</p>
            <p class="mt-1"><strong>(a)</strong> Termination for Cause. Upon Covered Entity's knowledge of a material breach of this Agreement by Business Associate, Covered Entity shall provide an opportunity for Business Associate to cure the breach or end the violation. If Business Associate does not cure the breach or end the violation within a reasonable time period, Covered Entity may terminate the underlying service agreement.</p>
            <p class="mt-1"><strong>(b)</strong> Effect of Termination. Upon termination of this Agreement for any reason, Business Associate shall return or destroy all PHI received from Covered Entity or created or received by Business Associate on behalf of Covered Entity within 30 days. If return or destruction of PHI is infeasible, Business Associate shall extend the protections of this Agreement to such PHI and limit further uses and disclosures to those purposes that make return or destruction infeasible.</p>
          </div>

          <div>
            <p class="font-semibold text-gray-800">8. Return or Destruction of PHI</p>
            <p class="mt-1">Upon termination of this Agreement, Business Associate will, at the direction of Covered Entity, either return all PHI to Covered Entity or destroy all PHI and certify in writing to Covered Entity that such PHI has been destroyed. Business Associate shall retain no copies of the PHI. In cases where return or destruction of PHI is not feasible, Business Associate shall provide written notice to Covered Entity and continue to maintain the protections required by this Agreement.</p>
          </div>

          <div>
            <p class="font-semibold text-gray-800">9. Miscellaneous</p>
            <p class="mt-1">This Agreement shall be interpreted as broadly as necessary to implement and comply with HIPAA. The parties agree that any ambiguity in this Agreement shall be resolved in favor of a meaning that complies with and is consistent with HIPAA. This Agreement is governed by the laws of the State of Delaware. Any dispute arising from this Agreement shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.</p>
          </div>

          <div>
            <p class="font-semibold text-gray-800">10. Amendment</p>
            <p class="mt-1">The parties agree to take such action as is necessary to amend this Agreement from time to time as is necessary for Covered Entity to comply with the requirements of HIPAA. Datable Health reserves the right to amend this Agreement upon 30 days' notice to Covered Entity. Continued use of Datable Health services after the effective date of an amendment constitutes acceptance of the amended BAA.</p>
          </div>

          <div class="pb-2">
            <p class="text-gray-400 italic text-center">— End of Business Associate Agreement —</p>
          </div>
        </div>

        <!-- Scroll indicator -->
        <div v-if="!hasScrolled" class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-100 to-transparent rounded-b-xl flex items-end justify-center pb-2 pointer-events-none">
          <p class="text-xs text-gray-400">Scroll to read the full agreement</p>
        </div>
      </div>

      <!-- Checkbox -->
      <div class="flex items-start gap-3 p-4 border-2 rounded-xl transition-all"
        :class="hasScrolled ? 'border-gray-200' : 'border-gray-100 opacity-50'">
        <input
          id="baa-checkbox"
          v-model="checkboxChecked"
          type="checkbox"
          :disabled="!hasScrolled"
          class="mt-0.5 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer disabled:cursor-not-allowed"
        />
        <label for="baa-checkbox" class="text-sm text-gray-700 leading-relaxed cursor-pointer">
          I have read and agree to the Business Associate Agreement on behalf of
          <strong>{{ practiceName }}</strong>.
        </label>
      </div>

      <!-- Electronic signature -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1.5">
          Type your full legal name to sign electronically
        </label>
        <input
          v-model="typedName"
          type="text"
          :disabled="!hasScrolled || !checkboxChecked"
          placeholder="Your full legal name"
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
        <p v-if="typedName" class="mt-2 text-xs text-gray-500 italic">
          Electronic signature: {{ typedName }} — {{ new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }}
        </p>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {{ error }}
      </div>

      <!-- Accept button -->
      <button
        @click="handleAccept"
        :disabled="!isValid || loading"
        class="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <svg v-if="loading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {{ loading ? 'Recording acceptance…' : 'Accept and Continue' }}
      </button>
    </div>
  </OnboardingLayout>
</template>
