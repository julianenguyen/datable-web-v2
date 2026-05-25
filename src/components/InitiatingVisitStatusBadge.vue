<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

interface InitiatingVisitStatus {
  status: 'valid' | 'warning_yellow' | 'warning_orange' | 'expired' | 'missing'
  canBill: boolean
  visitDate?: string
  expiresAt?: string
  daysRemaining?: number
  icd10Primary?: string
  icd10Description?: string
  attestationStatement?: string
  attestedAt?: string
  visitModality?: string
  cptCode?: string
  renderingProviderNpi?: string
  initiatingVisitId?: string
  message?: string
}

const props = defineProps<{
  clientId: string
  clientName: string
  onDocumentVisit: () => void
}>()

const emit = defineEmits<{
  statusLoaded: [status: InitiatingVisitStatus]
}>()

const statusData = ref<InitiatingVisitStatus | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

async function loadStatus() {
  isLoading.value = true
  loadError.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token ?? ''

    const res = await fetch(
      `${EDGE_FUNCTION_URL}/initiating-visit/status/${props.clientId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      }
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as InitiatingVisitStatus
    statusData.value = data
    emit('statusLoaded', data)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load initiating visit status'
  } finally {
    isLoading.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

onMounted(loadStatus)

defineExpose({ reload: loadStatus })
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-xl p-5">
    <h3 class="text-sm font-semibold text-gray-900 mb-3">G0323 Initiating Visit</h3>

    <!-- Skeleton loader -->
    <div v-if="isLoading" class="space-y-2 animate-pulse">
      <div class="h-8 bg-gray-100 rounded-lg w-64" />
      <div class="h-4 bg-gray-100 rounded w-48" />
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
      {{ loadError }}
    </div>

    <template v-else-if="statusData">
      <!-- Valid -->
      <div v-if="statusData.status === 'valid'" class="space-y-2">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
          <CheckCircle2 class="w-3.5 h-3.5" />
          Initiating Visit Valid — expires {{ formatDate(statusData.expiresAt!) }}
        </div>
        <p class="text-xs text-gray-500">
          CPT {{ statusData.cptCode }} · {{ statusData.icd10Primary }} · {{ statusData.icd10Description }}
        </p>
      </div>

      <!-- Warning yellow (10 months) -->
      <div v-else-if="statusData.status === 'warning_yellow'" class="space-y-2">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-800 text-xs font-medium">
          <AlertTriangle class="w-3.5 h-3.5" />
          Initiating Visit Expires in {{ statusData.daysRemaining }} Days
        </div>
        <p class="text-xs text-gray-500">{{ statusData.message }}</p>
        <button
          @click="onDocumentVisit"
          class="text-xs font-medium text-yellow-700 hover:text-yellow-800 underline"
        >
          Renew Now
        </button>
      </div>

      <!-- Warning orange (11 months) -->
      <div v-else-if="statusData.status === 'warning_orange'" class="space-y-2">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 text-orange-900 text-xs font-medium">
          <AlertTriangle class="w-3.5 h-3.5" />
          Initiating Visit Expires in {{ statusData.daysRemaining }} Days
        </div>
        <p class="text-xs text-gray-500">{{ statusData.message }}</p>
        <button
          @click="onDocumentVisit"
          class="text-xs font-medium text-orange-800 hover:text-orange-900 underline"
        >
          Renew Now
        </button>
      </div>

      <!-- Expired -->
      <div v-else-if="statusData.status === 'expired'" class="space-y-2">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-900 text-xs font-medium">
          <XCircle class="w-3.5 h-3.5" />
          Initiating Visit Expired — Billing Locked
        </div>
        <p class="text-xs text-gray-500">{{ statusData.message }}</p>
        <button
          @click="onDocumentVisit"
          class="text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Document New Visit
        </button>
      </div>

      <!-- Missing -->
      <div v-else-if="statusData.status === 'missing'" class="space-y-2">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-900 text-xs font-medium">
          <XCircle class="w-3.5 h-3.5" />
          No Initiating Visit — Billing Locked
        </div>
        <p class="text-xs text-gray-500">{{ statusData.message }}</p>
        <button
          @click="onDocumentVisit"
          class="text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Document Visit
        </button>
      </div>
    </template>
  </div>
</template>
