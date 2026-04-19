<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { LogOut, Users, LayoutDashboard } from 'lucide-vue-next'

const auth = useAuthStore()
const router = useRouter()

async function handleSignOut() {
  await auth.signOut()
  router.push('/auth')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex">
    <!-- Sidebar -->
    <aside class="w-56 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-10">
      <!-- Logo -->
      <div class="h-14 flex items-center px-5 border-b border-gray-100">
        <img src="/logo-teal.png" alt="Datable Health" class="h-7" />
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-0.5">
        <router-link
          to="/"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="$route.path === '/'
            ? 'bg-teal-50 text-teal-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
        >
          <LayoutDashboard class="w-4 h-4 shrink-0" />
          Client Roster
        </router-link>
      </nav>

      <!-- Footer -->
      <div class="px-3 py-4 border-t border-gray-100">
        <div class="px-3 py-2 mb-1">
          <p class="text-xs font-medium text-gray-900 truncate">{{ auth.profile?.name ?? auth.user?.email }}</p>
          <p class="text-xs text-gray-500 truncate">{{ ('practice_name' in (auth.profile ?? {})) ? (auth.profile as { practice_name: string | null }).practice_name ?? 'Provider' : 'Provider' }}</p>
        </div>
        <button
          @click="handleSignOut"
          class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <LogOut class="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <div class="ml-56 flex-1 flex flex-col min-h-screen">
      <slot />
    </div>
  </div>
</template>
