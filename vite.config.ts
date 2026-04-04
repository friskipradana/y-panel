import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: "0.0.0.0",
    port: 8770,      // ganti port di sini
    strictPort: true,// kalau port dipakai, jangan pindah otomatis
    proxy: {
      // Proxy ke Portainer API — ganti port sesuai setup kamu
      '/portainer': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/portainer/, ''),
      },
    },
  },

})
