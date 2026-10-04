import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Terminal,
  Box,
  Globe,
  HardDrive,
  Activity,
  CheckCircle2,
  Monitor,
  ShieldCheck,
  Maximize2,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

const HERO_IMAGE = '/ChatGPT Image Apr 27, 2026, 11_04_38 AM.png'
const INSTALLER_URL = 'https://github.com/friskipradana/y-panel/releases/latest/download/ypanel-installer.run'
const INSTALL_COMMAND = `wget -O ypanel-installer.run ${INSTALLER_URL} && sudo bash ypanel-installer.run`

const FEATURES = [
  {
    num: '01',
    title: 'Docker & Compose',
    desc: 'Deploy, inspect, stream logs, and manage containers & volumes in real-time.',
    icon: Box,
  },
  {
    num: '02',
    title: 'Zero-Trust Tunnels',
    desc: 'Expose local services securely via Cloudflare Tunnels without open ports.',
    icon: Globe,
  },
  {
    num: '03',
    title: 'Host PTY Terminal',
    desc: 'Low-latency Xterm.js web shell connected straight to your host Linux kernel.',
    icon: Terminal,
  },
  {
    num: '04',
    title: 'File Manager & RBAC',
    desc: 'Monaco code editor, upload/download, root-access guards, and multi-user roles.',
    icon: HardDrive,
  },
]

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const { t } = useI18n()
  const primaryPath = authenticated ? '/home' : '/login'
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'desktop' | 'docker' | 'terminal'>('desktop')

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyCommand = async () => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(INSTALL_COMMAND)
        setCopied(true)
        return
      } catch {}
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#05070c] text-[#f1f5f9] font-sans antialiased selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* Background Subtle Gradient Grid */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(56,189,248,0.12),transparent_70%)]" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#05070c]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="YPanel" className="w-7 h-7" />
            <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-2">
              ypanel
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 border border-white/[0.08]">
                v0.1.0
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/friskipradana/y-panel"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.04] transition flex items-center gap-1.5"
            >
              <span>GitHub</span>
              <ExternalLink size={11} className="opacity-60" />
            </a>
            <a
              href={INSTALLER_URL}
              className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-md border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] transition flex items-center gap-1.5"
            >
              <Download size={12} />
              <span>Installer</span>
            </a>
            <button
              type="button"
              onClick={() => onNavigate(primaryPath)}
              className="text-xs font-medium text-[#05070c] bg-white hover:bg-slate-200 px-3.5 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-sm"
            >
              <span>{authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Content */}
      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24 relative z-10">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Desktop-Style Linux Server Control Panel</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.08] mb-6">
            Control your server <br className="hidden sm:inline" />
            like a{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              desktop workstation.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto mb-8">
            Lightweight Go binary agent + React desktop environment. Manage Docker, Cloudflare Zero-Trust Tunnels, files, and terminal from one unified visual workspace.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <button
              type="button"
              onClick={() => onNavigate(primaryPath)}
              className="h-11 px-6 rounded-lg text-sm font-semibold text-[#05070c] bg-white hover:bg-slate-200 transition shadow-lg shadow-white/5 flex items-center gap-2"
            >
              <span>{authenticated ? 'Open Dashboard' : 'Login to Agent'}</span>
              <ArrowRight size={15} />
            </button>
            <a
              href={INSTALLER_URL}
              className="h-11 px-5 rounded-lg text-sm font-medium text-slate-300 hover:text-white border border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.06] transition flex items-center gap-2"
            >
              <Download size={15} />
              <span>Download .run</span>
            </a>
          </div>

          {/* Quick Install Command Snippet */}
          <div className="max-w-xl mx-auto rounded-lg border border-white/[0.08] bg-[#090d16] p-2.5 flex items-center justify-between text-left shadow-xl shadow-black/40">
            <div className="flex items-center gap-2.5 overflow-hidden pl-2">
              <Terminal size={14} className="text-cyan-400 shrink-0" />
              <code className="text-xs font-mono text-slate-300 truncate">
                {INSTALL_COMMAND}
              </code>
            </div>
            <button
              type="button"
              onClick={copyCommand}
              className="shrink-0 ml-3 flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-3 py-1.5 rounded transition"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* High-Fidelity Desktop Showcase Preview Frame */}
        <div className="mt-16 rounded-xl border border-white/[0.08] bg-[#090d16]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Mock Window Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#070a12]">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
              <span className="text-xs font-mono text-slate-400 ml-2">
                ypanel-agent@vps: ~ desktop workstation
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Go Agent 8787 Healthy
              </span>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-white/[0.06] bg-[#080b14] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-md font-medium transition ${
                activeTab === 'desktop'
                  ? 'bg-[#0e1422] text-cyan-300 border-t-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor size={14} />
              <span>Desktop Workspace Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('docker')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-md font-medium transition ${
                activeTab === 'docker'
                  ? 'bg-[#0e1422] text-cyan-300 border-t-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box size={14} />
              <span>Live Containers (3)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-md font-medium transition ${
                activeTab === 'terminal'
                  ? 'bg-[#0e1422] text-cyan-300 border-t-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal size={14} />
              <span>Host Shell (PTY)</span>
            </button>
          </div>

          {/* Showcase Screen Body */}
          <div className="bg-[#0e1422]">
            {activeTab === 'desktop' && (
              <div className="relative group w-full overflow-hidden bg-[#04060a]">
                <img
                  src={HERO_IMAGE}
                  alt="YPanel Desktop UI Interface Preview"
                  className="w-full h-auto max-h-[580px] object-cover object-top opacity-95 transition-transform duration-700 group-hover:scale-[1.01]"
                />
                <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/[0.08]" />
              </div>
            )}

            {activeTab === 'docker' && (
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-lg border border-white/[0.06] bg-[#070a12]/90">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-white">ypanel-postgres</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      running
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mb-3">postgres:16-alpine</div>
                  <div className="text-[11px] text-slate-500 font-mono border-t border-white/[0.04] pt-2 flex justify-between">
                    <span>Port: :5432</span>
                    <span>Mem: 28MB</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-white/[0.06] bg-[#070a12]/90">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-white">production-api</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      running
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mb-3">golang:1.22-bookworm</div>
                  <div className="text-[11px] text-slate-500 font-mono border-t border-white/[0.04] pt-2 flex justify-between">
                    <span>Port: :8080</span>
                    <span>Mem: 42MB</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-white/[0.06] bg-[#070a12]/90">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-white">cloudflared</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      active
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mb-3">cloudflare/cloudflared</div>
                  <div className="text-[11px] text-slate-500 font-mono border-t border-white/[0.04] pt-2 flex justify-between">
                    <span>Tunnel: sea01</span>
                    <span>DDoS Protected</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'terminal' && (
              <div className="p-6">
                <div className="p-5 rounded-lg border border-white/[0.06] bg-[#05070c] font-mono text-xs text-slate-300 leading-relaxed">
                  <div className="text-slate-400">$ ypanel status</div>
                  <div className="text-emerald-400 mt-1">✓ Kernel: Linux 6.8.0-x86_64</div>
                  <div className="text-emerald-400">✓ Go Agent: listening on 0.0.0.0:8787 (PID 1842)</div>
                  <div className="text-emerald-400">✓ Database: PostgreSQL 16 (connected, 0.6ms latency)</div>
                  <div className="text-cyan-400 mt-2">$ docker compose ps</div>
                  <div className="text-slate-400">NAME                IMAGE               STATUS              PORTS</div>
                  <div className="text-slate-200">ypanel-postgres     postgres:16         Up 42 hours         0.0.0.0:5432-&gt;5432/tcp</div>
                </div>
              </div>
            )}
          </div>

          {/* Mock Window Bottom Bar */}
          <div className="px-5 py-3 border-t border-white/[0.06] bg-[#070a12] flex items-center justify-between text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-4">
              <span>CPU: <strong className="text-slate-200 font-normal">8.4%</strong></span>
              <span>RAM: <strong className="text-slate-200 font-normal">1.2 / 8.0 GB</strong></span>
              <span>Disk: <strong className="text-slate-200 font-normal">18%</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Activity size={12} className="text-emerald-400" />
              <span>Host Uptime: 42d 18h</span>
            </div>
          </div>
        </div>

        {/* Feature Grid (4 Pillars) */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.num}
                className="p-5 rounded-xl border border-white/[0.06] bg-[#090d16]/40 hover:bg-[#090d16]/80 hover:border-white/[0.12] transition-all group text-left"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs text-slate-500 group-hover:text-cyan-400 transition">
                    {item.num}
                  </span>
                  <Icon size={16} className="text-slate-400 group-hover:text-white transition" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span>YPanel by Y_Corp</span>
            <span>·</span>
            <span>Contributors: AknalRe · FriskiPradana</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Open Source & Self-Hosted</span>
          </div>
        </footer>
      </main>
    </div>
  )
}
