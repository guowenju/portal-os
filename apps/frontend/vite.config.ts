import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as {
  version?: string
}
const appVersion = packageJson.version ?? '0.0.0'

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

const gitHash = getGitHash()

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_GIT_HASH': JSON.stringify(gitHash),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react()],
  server: {
    // 配置代理，解决开发环境下的跨域问题
    proxy: {
      // 当有 /api 前缀的请求时，转发到后端的 9090 端口
      '/api': {
        target: 'http://127.0.0.1:9090',
        changeOrigin: true, // 需要虚拟主机站点
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
})
