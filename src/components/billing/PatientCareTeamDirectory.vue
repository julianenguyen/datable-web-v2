<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Users, Plus, Pencil, X, CheckCircle2, Loader2, AlertTriangle, Phone, Mail } from 'lucide-vue-next'
import { supabase, supabaseAnonKey, EDGE_FUNCTION_URL } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
interface CareTeamMember {
  id: string
  provider_name: string
  provider_role: string
  provider_specialty: string | null
  organization_name: string | null
  provider_phone: string | null
  provider_fax: string | null
  provider_email: string | null
  provider_npi: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const ROLE_LABELS: Record<string, string> = {
  primary_care_physician: 'Primary Care Physician',
  psychiatrist: 'Psychiatrist',
  specialist: 'Specialist',
  nurse_practitioner: 'Nurse Practitioner',
  social_worker: 'Social Worker',
  case_manager: 'Case Manager',
  pharmacist: 'Pharmacist',
  other: 'Other',
}

// ── Props ──────────────────────────────────────────────────────────────────────
const props = defineProps<{
  clientId: string
}>()

// ── State ──────────────────────────────────────────────────────────────────────
const members = ref<CareTeamMember[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const showAddForm = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

// ── Form state ─────────────────────────────────────────────────────────────────
const form = ref({
  provider_name: '',
  provider_role: '',
  provider_specialty: '',
  organization_name: '',
  provider_phone: '',
  provider_fax: '',
  provider_email: '',
  provider_npi: '',
})

function resetForm() {
  form.value = {
    provider_name: '',
    provider_role: '',
    provider_specialty: '',
    organization_name: '',
    provider_phone: '',
    provider_fax: '',
    provider_email: '',
    provider_npi: '',
  }
}

function beginEdit(member: CareTeamMember) {
  editingId.value = member.id
  showAddForm.value = false
  form.value = {
    provider_name: member.provider_name,
    provider_role: member.provider_role,
    provider_specialty: member.provider_specialty ?? '',
    organization_name: member.organization_name ?? '',
    provider_phone: member.provider_phone ?? '',
    provider_fax: member.provider_fax ?? '',
    provider_email: member.provider_email ?? '',
    provider_npi: member.provider_npi ?? '',
  }
  saveError.value = null
}

function cancelForm() {
  showAddForm.value = false
  editingId.value = null
  resetForm()
  saveError.value = null
}

// ── API ────────────────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  return session.session?.access_token ?? ''
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const token = await getToken()
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/treatment-coordination/care-team/${props.clientId}`,
      { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } },
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json() as { members: CareTeamMember[] }
    members.value = data.members
  } catch (err) {
    loadError.value = 'Failed to load care team.'
    console.error('[PatientCareTeamDirectory] load error:', err)
  } finally {
    loading.value = false
  }
}

async function addMember() {
  if (!form.value.provider_name.trim() || !form.value.provider_role) return
  saving.value = true
  saveError.value = null
  try {
    const token = await getToken()
    const res = await fetch(`${EDGE_FUNCTION_URL}/treatment-coordination/care-team/add`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: props.clientId,
        provider_name: form.value.provider_name.trim(),
        provider_role: form.value.provider_role,
        provider_specialty: form.value.provider_specialty.trim() || null,
        organization_name: form.value.organization_name.trim() || null,
        provider_phone: form.value.provider_phone.trim() || null,
        provider_fax: form.value.provider_fax.trim() || null,
        provider_email: form.value.provider_email.trim() || null,
        provider_npi: form.value.provider_npi.trim() || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Status ${res.status}` }))
      throw new Error(err.message ?? err.error ?? `Status ${res.status}`)
    }
    cancelForm()
    await load()
  } catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : 'Failed to add provider.'
  } finally {
    saving.value = false
  }
}

async function updateMember() {
  if (!editingId.value) return
  saving.value = true
  saveError.value = null
  try {
    const token = await getToken()
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/treatment-coordination/care-team/${editingId.value}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider_name: form.value.provider_name.trim(),
          provider_role: form.value.provider_role,
          provider_specialty: form.value.provider_specialty.trim() || null,
          organization_name: form.value.organization_name.trim() || null,
          provider_phone: form.value.provider_phone.trim() || null,
          provider_fax: form.value.provider_fax.trim() || null,
          provider_email: form.value.provider_email.trim() || null,
          provider_npi: form.value.provider_npi.trim() || null,
        }),
      },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Status ${res.status}` }))
      throw new Error(err.message ?? err.error ?? `Status ${res.status}`)
    }
    cancelForm()
    await load()
  } catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : 'Failed to update provider.'
  } finally {
    saving.value = false
  }
}

async function deactivateMember(memberId: string) {
  saving.value = true
  try {
    const token = await getToken()
    const res = await fetch(
      `${EDGE_FUNCTION_URL}/treatment-coordination/care-team/${memberId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: false }),
      },
    )
    if (!res.ok) throw new Error(`Status ${res.status}`)
    await load()
  } catch (err) {
    console.error('[PatientCareTeamDirectory] deactivate error:', err)
  } finally {
    saving.value = false
  }
}

// ── Computed ───────────────────────────────────────────────────────────────────
const canSave = computed(() =>
  form.value.provider_name.trim().length > 0 && form.value.provider_role.length > 0,
)

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(load)
watch(() => props.clientId, load)

// Expose reload for parent
defineExpose({ reload: load })
</script>

<template>
  <div class="care-team-directory rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Users :size="16" class="text-teal-600" />
        <h3 class="text-sm font-semibold text-gray-900">Patient Care Team</h3>
        <span v-if="!loading" class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
          {{ members.length }} provider{{ members.length !== 1 ? 's' : '' }}
        </span>
      </div>
      <button
        v-if="!showAddForm && !editingId"
        @click="showAddForm = true; resetForm(); saveError = null"
        class="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus :size="13" />
        Add Provider
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-10 text-gray-400">
      <Loader2 :size="18" class="animate-spin mr-2 text-teal-600" />
      <span class="text-sm">Loading care team…</span>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="px-5 py-4 text-sm text-red-600 bg-red-50">
      <AlertTriangle :size="14" class="inline mr-1" />{{ loadError }}
    </div>

    <div v-else>
      <!-- Member list -->
      <div class="divide-y divide-gray-100">
        <div
          v-for="member in members"
          :key="member.id"
          class="px-5 py-3.5"
        >
          <!-- View mode -->
          <div v-if="editingId !== member.id" class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-semibold text-gray-900">{{ member.provider_name }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium">
                  {{ ROLE_LABELS[member.provider_role] ?? member.provider_role }}
                </span>
              </div>
              <p v-if="member.provider_specialty || member.organization_name" class="text-xs text-gray-500 mb-1">
                <span v-if="member.provider_specialty">{{ member.provider_specialty }}</span>
                <span v-if="member.provider_specialty && member.organization_name"> · </span>
                <span v-if="member.organization_name">{{ member.organization_name }}</span>
              </p>
              <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
                <span v-if="member.provider_phone" class="flex items-center gap-1">
                  <Phone :size="11" />{{ member.provider_phone }}
                </span>
                <span v-if="member.provider_email" class="flex items-center gap-1">
                  <Mail :size="11" />{{ member.provider_email }}
                </span>
                <span v-if="member.provider_npi" class="flex items-center gap-1">
                  NPI: {{ member.provider_npi }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                @click="beginEdit(member)"
                class="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                title="Edit provider"
              >
                <Pencil :size="13" />
              </button>
              <button
                @click="deactivateMember(member.id)"
                :disabled="saving"
                class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                title="Remove from care team"
              >
                <X :size="13" />
              </button>
            </div>
          </div>

          <!-- Edit mode -->
          <div v-else class="space-y-3">
            <p class="text-xs font-medium text-gray-600 mb-2">Edit Provider</p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input v-model="form.provider_name" type="text" placeholder="Dr. Jane Smith"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Role *</label>
                <select v-model="form.provider_role"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="">Select role…</option>
                  <option v-for="(label, key) in ROLE_LABELS" :key="key" :value="key">{{ label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Specialty</label>
                <input v-model="form.provider_specialty" type="text" placeholder="Cardiology"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Organization</label>
                <input v-model="form.organization_name" type="text" placeholder="Memorial Hospital"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input v-model="form.provider_phone" type="text" placeholder="(555) 000-0000"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">NPI</label>
                <input v-model="form.provider_npi" type="text" placeholder="1234567890"
                  class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <div v-if="saveError" class="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">
              {{ saveError }}
            </div>
            <div class="flex items-center gap-2 pt-1">
              <button @click="updateMember" :disabled="!canSave || saving"
                class="flex items-center gap-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                <Loader2 v-if="saving" :size="12" class="animate-spin" />
                <CheckCircle2 v-else :size="12" />
                {{ saving ? 'Saving…' : 'Save Changes' }}
              </button>
              <button @click="cancelForm" class="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="members.length === 0 && !showAddForm" class="px-5 py-8 text-center text-gray-400">
          <Users :size="28" class="mx-auto mb-2 opacity-40" />
          <p class="text-sm font-medium">No care team providers yet</p>
          <p class="text-xs mt-0.5">Add providers who coordinate care with you for this patient.</p>
        </div>
      </div>

      <!-- Add provider form -->
      <div v-if="showAddForm" class="border-t border-gray-100 px-5 py-4 bg-gray-50">
        <p class="text-xs font-semibold text-gray-700 mb-3">Add Care Team Provider</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input v-model="form.provider_name" type="text" placeholder="Dr. Jane Smith"
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Role *</label>
            <select v-model="form.provider_role"
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
              <option value="">Select role…</option>
              <option v-for="(label, key) in ROLE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Specialty</label>
            <input v-model="form.provider_specialty" type="text" placeholder="Cardiology"
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Organization</label>
            <input v-model="form.organization_name" type="text" placeholder="Memorial Hospital"
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input v-model="form.provider_phone" type="text" placeholder="(555) 000-0000"
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">NPI</label>
            <input v-model="form.provider_npi" type="text" placeholder="1234567890"
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
          </div>
        </div>
        <div v-if="saveError" class="mt-2 text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">
          {{ saveError }}
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button @click="addMember" :disabled="!canSave || saving"
            class="flex items-center gap-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            <Loader2 v-if="saving" :size="12" class="animate-spin" />
            <Plus v-else :size="12" />
            {{ saving ? 'Adding…' : 'Add Provider' }}
          </button>
          <button @click="cancelForm" class="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
