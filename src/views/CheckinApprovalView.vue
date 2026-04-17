<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, GripVertical, Trash2, Plus, Send, Save } from 'lucide-vue-next'
import { MOCK_CLIENTS } from '@/data/mockClients'

interface CheckinItem {
  id?: string
  text: string
  category: 'action_item' | 'practice' | 'watch_for'
  cadence: 'daily' | 'every_other_day' | 'as_needed'
  is_recurring: boolean
  sort_order: number
}

const router = useRouter()
const route = useRoute()

const clientId = route.params.clientId as string
const cycleId = route.query.cycleId as string
const listId = route.query.listId as string
const client = MOCK_CLIENTS.find(c => c.id === clientId)

const items = ref<CheckinItem[]>([])
const loading = ref(true)
const saving = ref(false)
const sending = ref(false)
const error = ref('')

const CATEGORY_LABELS = {
  action_item: 'Action item',
  practice: 'Practice',
  watch_for: 'Watch-for',
}

const CADENCE_LABELS = {
  daily: 'Daily',
  every_other_day: 'Every other day',
  as_needed: 'As needed',
}

onMounted(async () => {
  if (!listId) {
    error.value = 'No check-in list found.'
    loading.value = false
    return
  }

  const { data, error: fetchError } = await supabase
    .from('checkin_items')
    .select('*')
    .eq('list_id', listId)
    .order('sort_order')

  if (fetchError) {
    error.value = 'Failed to load check-in items.'
  } else {
    items.value = data ?? []
  }
  loading.value = false
})

function addItem() {
  items.value.push({
    text: '',
    category: 'action_item',
    cadence: 'daily',
    is_recurring: false,
    sort_order: items.value.length,
  })
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

async function saveItems(status: 'draft' | 'sent') {
  const updates = items.value
    .filter(i => i.text.trim())
    .map((item, idx) => ({ ...item, sort_order: idx, list_id: listId }))

  // Upsert items
  const { error: upsertError } = await supabase
    .from('checkin_items')
    .upsert(updates)

  if (upsertError) throw upsertError

  // Update list status
  const updateData: Record<string, unknown> = { status }
  if (status === 'sent') {
    updateData.approved_at = new Date().toISOString()
    updateData.sent_at = new Date().toISOString()
  }

  const { error: listError } = await supabase
    .from('checkin_lists')
    .update(updateData)
    .eq('id', listId)

  if (listError) throw listError
}

async function handleSaveDraft() {
  saving.value = true
  error.value = ''
  try {
    await saveItems('draft')
    router.push('/')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Save failed.'
  } finally {
    saving.value = false
  }
}

async function handleApproveAndSend() {
  if (items.value.filter(i => i.text.trim()).length === 0) {
    error.value = 'Add at least one check-in item before sending.'
    return
  }
  sending.value = true
  error.value = ''
  try {
    await saveItems('sent')

    // Trigger FCM notification via edge function
    await supabase.functions.invoke('send-checkin-notification', {
      body: { clientId, cycleId, listId },
    })

    router.push({ name: 'client-detail', params: { clientId } })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to send.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AppLayout>
    <div class="flex-1 max-w-2xl mx-auto w-full p-8">
      <!-- Back -->
      <button
        @click="router.back()"
        class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        Back
      </button>

      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-xl font-semibold text-gray-900">Review Check-In List</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          {{ client?.name }} — Review and edit before sending to client
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12 text-gray-400 text-sm">
        Loading check-in items…
      </div>

      <template v-else>
        <!-- Items -->
        <div class="space-y-3 mb-5">
          <div
            v-for="(item, index) in items"
            :key="index"
            class="bg-white border border-gray-200 rounded-xl p-4"
          >
            <div class="flex items-start gap-3">
              <!-- Drag handle (visual only) -->
              <GripVertical class="w-4 h-4 text-gray-300 mt-2.5 shrink-0 cursor-grab" />

              <div class="flex-1 space-y-3">
                <!-- Text -->
                <textarea
                  v-model="item.text"
                  rows="2"
                  placeholder="Check-in question…"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 resize-none"
                />

                <!-- Controls -->
                <div class="flex flex-wrap items-center gap-3">
                  <!-- Category -->
                  <select
                    v-model="item.category"
                    class="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option v-for="(label, value) in CATEGORY_LABELS" :key="value" :value="value">
                      {{ label }}
                    </option>
                  </select>

                  <!-- Cadence -->
                  <select
                    v-model="item.cadence"
                    class="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option v-for="(label, value) in CADENCE_LABELS" :key="value" :value="value">
                      {{ label }}
                    </option>
                  </select>

                  <!-- Recurring -->
                  <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" v-model="item.is_recurring" class="rounded accent-teal-600" />
                    Recurring
                  </label>
                </div>
              </div>

              <!-- Delete -->
              <button
                @click="removeItem(index)"
                class="text-gray-300 hover:text-red-400 transition-colors mt-1 shrink-0"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Add item -->
          <button
            @click="addItem"
            class="flex items-center gap-2 w-full px-4 py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:text-teal-600 hover:border-teal-300 transition-colors"
          >
            <Plus class="w-4 h-4" />
            Add item manually
          </button>
        </div>

        <!-- Error -->
        <div v-if="error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {{ error }}
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between">
          <button
            @click="handleSaveDraft"
            :disabled="saving"
            class="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save class="w-4 h-4" />
            {{ saving ? 'Saving…' : 'Save Draft' }}
          </button>

          <button
            @click="handleApproveAndSend"
            :disabled="sending"
            class="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            <span v-if="sending" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <Send v-else class="w-4 h-4" />
            {{ sending ? 'Sending…' : 'Approve and Send to Client' }}
          </button>
        </div>
      </template>
    </div>
  </AppLayout>
</template>
