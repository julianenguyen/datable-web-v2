import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5175,
  },
  plugins: [
    vue(),
    tailwindcss(),
  ],
  define: {
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
