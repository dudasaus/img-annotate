import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function getDevPort(rawPort: string | undefined) {
  const port = Number(rawPort)

  return Number.isInteger(port) && port > 0 ? port : 3535
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: getDevPort(env.DEV_PORT),
    },
  }
})
