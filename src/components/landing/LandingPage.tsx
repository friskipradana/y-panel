import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Terminal,
  Box,
  FolderKanban,
  Globe,
  HardDrive,
  Users,
  Database,
  Activity,
  FileText,
  Radio,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

const HERO_IMAGE = '/ChatGPT Image Apr 27, 2026, 11_04_38 AM.png'
const INSTALLER_URL = 'https://github.com/friskipradana/y-panel/releases/latest/download/ypanel-installer.run'
const INSTALL_COMMAND = `wget -O ypanel-installer.run ${INSTALLER_URL} && sudo bash ypanel-installer.run`

const FEATURE_ICONS = [
  { id: 'docker', label: 'Docker', icon: Box },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'cloudflare', label: 'Cloudflare', icon: Globe },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'files', label: 'Files', icon: HardDrive },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'tunnels', label: 'Tunnels', icon: Radio },
  { id: 'ops', label: 'Server Ops', icon: Activity },
  { id: 'logs', label: 'Logs', icon: FileText },
]

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const { t } = useI18n()
  const primaryPath = authenticated ? '/home' : '/login'
  const [copied, setCopied] = useState(false)

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
    <div className="min-h-screen w-full bg-[#03060c] text-[#f1f5f9] font-sans antialiased selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,189,248,0.12),transparent_70%)]" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#03060c]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="YPanel" className="w-7 h-7" />
            <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-2">
              YPanel
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
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
              className="text-xs font-medium text-[#03060c] bg-white hover:bg-slate-200 px-3.5 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-sm font-semibold"
            >
              <span>{authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="max-w-6xl mx-auto px-6 pt-14 pb-20 relative z-10">
        {/* Hero Header */}
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.08] mb-5">
            Control your server <br className="hidden sm:inline" />
            like a{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              desktop.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto mb-8">
            YPanel brings Docker, Projects, Terminal, Files, Cloudflare, Users, Database, and Logs together in a lightweight visual workspace for homeservers and VPS instances.
          </p>

          {/* Primary CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <button
              type="button"
              onClick={() => onNavigate(primaryPath)}
              className="h-11 px-6 rounded-lg text-sm font-semibold text-[#03060c] bg-white hover:bg-slate-200 transition shadow-lg shadow-white/5 flex items-center gap-2"
            >
              <span>{authenticated ? 'Open Dashboard' : 'Login Agent'}</span>
              <ArrowRight size={15} />
            </button>
            <a
              href={INSTALLER_URL}
              className="h-11 px-5 rounded-lg text-sm font-medium text-slate-300 hover:text-white border border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.06] transition flex items-center gap-2"
            >
              <Download size={15} />
              <span>Download Installer</span>
            </a>
          </div>

          {/* Quick Install Command Snippet */}
          <div className="max-w-xl mx-auto rounded-lg border border-white/[0.08] bg-[#070b14] p-2.5 flex items-center justify-between text-left shadow-xl shadow-black/50 mb-12">
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
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* High-Fidelity Desktop Showcase Presentation */}
        <div className="rounded-2xl border border-white/[0.1] bg-[#070b14]/90 p-2 sm:p-3 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] text-xs font-mono text-slate-400 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-semibold">YPanel Desktop OS Workspace</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                Go Daemon 8787
              </span>
              <span className="text-slate-500 hidden sm:inline">Linux-Powered</span>
            </div>
          </div>

          {/* Full High-Res Preview Image */}
          <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#020408]">
            <img
              src={HERO_IMAGE}
              alt="YPanel Desktop Workspace Preview"
              className="w-full h-auto object-cover block"
            />
          </div>
        </div>

        {/* Feature Icons Grid (10 Core Modules matching the image) */}
        <div className="mt-14">
          <div className="text-center mb-6">
            <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">
              Unified Server Modules
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {FEATURE_ICONS.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-white/[0.06] bg-[#070b14]/50 hover:bg-[#070b14] hover:border-cyan-500/30 transition text-center group"
                >
                  <Icon size={20} className="text-slate-400 group-hover:text-cyan-400 transition mb-2" />
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>


        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span>Owner: <strong className="text-slate-300">Y_Corp</strong></span>
            <span>·</span>
            <span>Contributors: <strong className="text-slate-300">AknalRe · FriskiPradana</strong></span>
          </div>
          <div className="text-slate-400">
            <span>Self-Hosted · Open Source</span>
          </div>
        </footer>
      </main>
    </div>
  )
}
