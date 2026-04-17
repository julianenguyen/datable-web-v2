import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'

declare const __BUILD_HASH__: string

function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

try {
  if (isStorageAvailable()) {
    const BUILD_KEY = 'datable_build'
    const currentBuild = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'
    const storedBuild = localStorage.getItem(BUILD_KEY)

    if (storedBuild && storedBuild !== currentBuild) {
      const keysToKeep: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('sb-') || key === BUILD_KEY)) {
          keysToKeep.push(key)
        }
      }
      const preserved = keysToKeep.map((k) => [k, localStorage.getItem(k)!] as const)
      localStorage.clear()
      try { sessionStorage.clear() } catch { /* blocked */ }
      for (const [k, v] of preserved) localStorage.setItem(k, v)
    }
    localStorage.setItem(BUILD_KEY, currentBuild)
  }
} catch {
  // Storage unavailable — safe to ignore
}

const app = createApp(App)

app.config.errorHandler = (err, _instance, info) => {
  console.error(`[Vue Error] ${info}:`, err)
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')
