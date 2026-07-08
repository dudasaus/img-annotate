import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function getDevPort(rawPort: string | undefined) {
  const port = Number(rawPort)

  return Number.isInteger(port) && port > 0 ? port : 3535
}

function getBasePath(rawBasePath: string | undefined) {
  if (!rawBasePath) {
    return '/'
  }

  return rawBasePath.startsWith('/') && rawBasePath.endsWith('/')
    ? rawBasePath
    : '/'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: getBasePath(process.env.GITHUB_PAGES_BASE ?? env.GITHUB_PAGES_BASE),
    plugins: [react(), tailwindcss()],
    server: {
      port: getDevPort(env.DEV_PORT),
    },
  }
})
