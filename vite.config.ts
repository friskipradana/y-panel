import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http'
import type { Socket } from 'net'

type ProxyServer = Parameters<NonNullable<ProxyOptions['configure']>>[0]

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

// Each language file is served as two modules: the text of the public pages (what a visitor needs before logging in) and the
// rest (the desktop and its windows), so the landing page does not download the strings of Settings and Docker.
// `virtual:locale/<lang>/public` and `virtual:locale/<lang>/rest` are made from src/lib/locales/<lang>.ts, which stays the one source.
const PUBLIC_LOCALE_PREFIXES = [
  'language', 'common', 'app', 'public', 'landing', 'order', 'legal', 'invoice', 'login', 'articles', 'mcpGuide', 'status',
  'errorBoundary', 'server', 'gate', 'install', 'hosting', 'ui', 'table', 'plan', 'update', 'alert', 'desktop',
]

const BENIGN_WS_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE'])

function isBenignSocketError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code
  return Boolean(code && BENIGN_WS_CODES.has(code))
}

function configureProxy(proxy: ProxyServer, label: string) {
  const origEmit = proxy.emit.bind(proxy) as (event: string, ...args: unknown[]) => boolean
  proxy.emit = ((event: string, ...args: unknown[]) => {
    if (event === 'error') {
      const err = args[0] as { code?: string } | undefined
      const res = args[2] as ServerResponse | Socket | undefined
      if (res && 'writeHead' in res) {
        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `${label} unavailable`, code: err?.code || 'ECONNREFUSED' }))
        }
        return true
      }
      if (isBenignSocketError(err)) {
        if (res && 'destroy' in res) res.destroy()
        return true
      }
    }
    return origEmit(event, ...args)
  }) as typeof proxy.emit

  proxy.on('proxyReqWs', (_proxyReq: ClientRequest, _req: IncomingMessage, socket: Socket) => {
    const origSocketEmit = socket.emit.bind(socket) as (event: string, ...args: unknown[]) => boolean
    socket.emit = ((event: string, ...args: unknown[]) => {
      if (event === 'error' && isBenignSocketError(args[0])) {
        socket.destroy()
        return true
      }
      return origSocketEmit(event, ...args)
    }) as typeof socket.emit
  })
}

function localeSplit() {
  const virtualPrefix = 'virtual:locale/'
  const file = (lang: string) => path.resolve(__dirname, `src/lib/locales/${lang}.ts`)
  return {
    name: 'reneo-locale-split',
    resolveId(id: string) {
      return id.startsWith(virtualPrefix) ? `\0${id}` : undefined
    },
    load(this: { addWatchFile(file: string): void }, id: string) {
      const match = /^\0virtual:locale\/(id|en)\/(public|rest)$/.exec(id)
      if (!match) return undefined
      const [, lang, part] = match
      this.addWatchFile(file(lang))
      const entries: Record<string, string> = {}
      for (const line of readFileSync(file(lang), 'utf-8').split(/\r?\n/)) {
        const entry = /^\s*'([^']+)':\s*((?:"(?:[^"\\]|\\.)*")|(?:'(?:[^'\\]|\\.)*')),?\s*$/.exec(line)
        if (!entry) continue
        const isPublic = PUBLIC_LOCALE_PREFIXES.includes(entry[1].split('.')[0])
        if ((part === 'public') === isPublic) entries[entry[1]] = new Function(`return ${entry[2]}`)() as string
      }
      return `export default ${JSON.stringify(entries)}`
    },
    handleHotUpdate(ctx: { file: string; server: { moduleGraph: { getModuleById(id: string): unknown; invalidateModule(mod: unknown): void } } }) {
      const match = /locales[\\/](id|en)\.ts$/.exec(ctx.file)
      if (!match) return undefined
      for (const part of ['public', 'rest']) {
        const mod = ctx.server.moduleGraph.getModuleById(`\0virtual:locale/${match[1]}/${part}`)
        if (mod) ctx.server.moduleGraph.invalidateModule(mod)
      }
      return undefined
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE || '/api'
  const agentBase = env.VITE_AGENT_BASE || '/agent'
  const portainerBase = env.VITE_PORTAINER_BASE || '/portainer'
  const agentTarget = env.VITE_AGENT_PROXY_TARGET || 'http://localhost:8787'
  const portainerTarget = env.VITE_PORTAINER_PROXY_TARGET || 'http://localhost:9000'

  return {
    plugins: [
      react(),
      localeSplit(),
      {
        name: 'reneo-async-css',
        apply: 'build',
        transformIndexHtml(html) {
          return html.replace(/<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g, '<link rel="stylesheet" crossorigin href="$1" media="print" data-app-css onload="this.media=&quot;all&quot;">')
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
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
        [apiBase]: {
          target: agentTarget,
          changeOrigin: true,
          ws: true,
          configure: (proxy) => configureProxy(proxy, 'Agent'),
        },
        [agentBase]: {
          target: agentTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(new RegExp(`^${agentBase}`), ''),
          configure: (proxy) => configureProxy(proxy, 'Agent'),
        },
        [portainerBase]: {
          target: portainerTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(new RegExp(`^${portainerBase}`), ''),
          configure: (proxy) => configureProxy(proxy, 'Portainer'),
        },
      },
    },
  }
})
