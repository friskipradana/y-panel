import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const agentBase = env.VITE_AGENT_BASE || '/agent'
  const portainerBase = env.VITE_PORTAINER_BASE || '/portainer'
  const agentTarget = env.VITE_AGENT_PROXY_TARGET || 'http://localhost:8787'
  const portainerTarget = env.VITE_PORTAINER_PROXY_TARGET || 'http://localhost:9000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: '0.0.0.0',
      port: 8770,
      strictPort: true,
      proxy: {
        [agentBase]: {
          target: agentTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(new RegExp(`^${agentBase}`), ''),
        },
        [portainerBase]: {
          target: portainerTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(new RegExp(`^${portainerBase}`), ''),
        },
      },
    },
  }
})
