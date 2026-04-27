import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const agentBase = env.VITE_AGENT_BASE || '/agent'
  const portainerBase = env.VITE_PORTAINER_BASE || '/portainer'
  const agentTarget = env.VITE_AGENT_PROXY_TARGET || 'http://localhost:8787'
  const portainerTarget = env.VITE_PORTAINER_PROXY_TARGET || 'http://localhost:9000'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        // YPanel intentionally ships a large desktop-style CSS skin.
        // Keep production build output clean by disabling Rolldown's informational timing diagnostic.
        checks: {
          pluginTimings: false,
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('xterm')) return 'vendor_xterm'
            if (id.includes('framer-motion') || id.includes('motion-dom')) return 'vendor_motion'
            if (id.includes('@tanstack/react-query')) return 'vendor_query'
            if (id.includes('lucide-react')) return 'vendor_icons'
            if (id.includes('react-dom') || id.includes('react/jsx-runtime') || id.includes('react')) return 'vendor_react'
            return 'vendor_misc'
          },
        },
      },
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
