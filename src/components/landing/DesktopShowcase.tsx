import { useState } from 'react'
import {
  Activity,
  Box,
  Cpu,
  Database,
  Folder,
  Globe,
  HardDrive,
  Minus,
  Plus,
  Search,
  Square,
  Terminal,
  X,
} from 'lucide-react'

type WindowId = 'docker' | 'cloudflare' | 'terminal'

export function DesktopShowcase() {
  const [activeWindow, setActiveWindow] = useState<WindowId>('docker')

  const bringToFront = (win: WindowId) => {
    setActiveWindow(win)
  }

  return (
    <div className="w-full max-w-5xl mx-auto select-none text-left font-sans">
      {/* Outer Desktop Canvas */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/[0.1] bg-[#03060f] shadow-2xl shadow-cyan-950/30">
        {/* Ambient Desktop Wallpaper Backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(14,165,233,0.12),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)`,
            backgroundSize: '20px 20px',
          }}
        />

        {/* Top Desktop Taskbar */}
        <div className="relative z-40 flex items-center justify-between px-3 sm:px-4 py-2 border-b border-white/[0.08] bg-[#040711]/90 backdrop-blur-md">
          {/* Left: Branding & Status */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[12px] font-bold tracking-tight text-white">YPanel OS</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">|</span>
            <span className="text-[10.5px] font-mono text-slate-400 hidden sm:inline">Workspace</span>
          </div>

          {/* Center: Running App Tasks */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => bringToFront('docker')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                activeWindow === 'docker'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Box size={12} className={activeWindow === 'docker' ? 'text-cyan-400' : 'text-slate-400'} />
              <span>Docker</span>
            </button>
            <button
              type="button"
              onClick={() => bringToFront('cloudflare')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                activeWindow === 'cloudflare'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-xs'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Globe size={12} className={activeWindow === 'cloudflare' ? 'text-sky-400' : 'text-slate-400'} />
              <span>Cloudflare</span>
            </button>
            <button
              type="button"
              onClick={() => bringToFront('terminal')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                activeWindow === 'terminal'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Terminal size={12} className={activeWindow === 'terminal' ? 'text-emerald-400' : 'text-slate-400'} />
              <span>Terminal</span>
            </button>
          </div>

          {/* Right: Metrics */}
          <div className="flex items-center gap-2 sm:gap-3 text-[10.5px] font-mono text-slate-400">
            <div className="hidden md:flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Cpu size={11} className="text-cyan-400" /> 12%
              </span>
              <span className="flex items-center gap-1">
                <HardDrive size={11} className="text-emerald-400" /> 2.2 GB
              </span>
            </div>
            <span className="text-[9.5px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              8787 ONLINE
            </span>
          </div>
        </div>

        {/* Desktop Workspace Stage */}
        <div className="relative h-[450px] sm:h-[470px] p-3 sm:p-5 overflow-hidden">
          {/* Left Desktop Shortcuts Column */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5">
            {[
              { id: 'docker', icon: Box, label: 'Docker', win: 'docker' as WindowId },
              { id: 'cloudflare', icon: Globe, label: 'Cloudflare', win: 'cloudflare' as WindowId },
              { id: 'terminal', icon: Terminal, label: 'Terminal', win: 'terminal' as WindowId },
              { id: 'database', icon: Database, label: 'Database', win: 'docker' as WindowId },
              { id: 'files', icon: Folder, label: 'Files', win: 'terminal' as WindowId },
              { id: 'system', icon: Activity, label: 'System', win: 'docker' as WindowId },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => bringToFront(item.win)}
                className="group flex flex-col items-center gap-1 w-14 py-1.5 px-1 rounded-xl hover:bg-white/[0.06] transition cursor-pointer"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-300 group-hover:text-cyan-400 group-hover:border-cyan-500/30 group-hover:scale-105 transition shadow-xs">
                  <item.icon size={17} />
                </div>
                <span className="text-[9.5px] font-medium text-slate-400 group-hover:text-slate-200 truncate max-w-[54px] text-center">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          {/* ── Window 1: Docker Workspace (Top-Center Left) ── */}
          <div
            onClick={() => bringToFront('docker')}
            style={{ zIndex: activeWindow === 'docker' ? 30 : 10 }}
            className={`absolute top-4 left-24 sm:left-28 w-[72%] sm:w-[50%] rounded-xl border transition-all duration-200 shadow-2xl backdrop-blur-xl cursor-pointer ${
              activeWindow === 'docker'
                ? 'border-cyan-500/40 bg-[#080d1a]/98 shadow-cyan-950/50 scale-[1.01]'
                : 'border-white/[0.08] bg-[#080d1a]/85 opacity-90 hover:opacity-100 hover:border-white/[0.16]'
            }`}
          >
            {/* Titlebar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Box size={13} className="text-cyan-400" />
                <span className="text-[11.5px] font-semibold text-slate-200">Docker Workspace</span>
                <span className="text-[9.5px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
                  3 Running
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="p-0.5 hover:text-white"><Minus size={11} /></span>
                <span className="p-0.5 hover:text-white"><Square size={10} /></span>
                <span className="p-0.5 hover:text-rose-400"><X size={11} /></span>
              </div>
            </div>

            {/* Content */}
            <div className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[10.5px]">
                  <span className="font-semibold text-slate-300">Containers</span>
                  <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded text-[9px]">Healthy</span>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-400">
                    <Search size={9} />
                    <span>Filter...</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-medium">
                    <Plus size={9} />
                    <span>Deploy</span>
                  </div>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-1 text-[10.5px]">
                {[
                  { name: 'postgres-production', img: 'postgres:16-alpine', port: '5432:5432', up: 'Up 14d' },
                  { name: 'redis-cache-tier', img: 'redis:7.2-alpine', port: '6379:6379', up: 'Up 14d' },
                  { name: 'caddy-edge-gateway', img: 'caddy:2.7-alpine', port: '80:80, 443:443', up: 'Up 6d' },
                ].map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between p-1.5 rounded-md border border-white/[0.04] bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-slate-200 truncate block text-[10.5px]">{c.name}</span>
                        <span className="text-[9px] font-mono text-slate-500 truncate block">{c.img}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-[9px] text-slate-400">
                      <span className="bg-white/[0.04] px-1 py-0.2 rounded text-slate-300 hidden sm:inline">{c.port}</span>
                      <span className="text-emerald-400">{c.up}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Window 2: Cloudflare & DNS (Top-Right) ── */}
          <div
            onClick={() => bringToFront('cloudflare')}
            style={{ zIndex: activeWindow === 'cloudflare' ? 30 : 15 }}
            className={`absolute top-6 sm:top-8 right-4 sm:right-6 w-[70%] sm:w-[45%] rounded-xl border transition-all duration-200 shadow-2xl backdrop-blur-xl cursor-pointer ${
              activeWindow === 'cloudflare'
                ? 'border-sky-500/40 bg-[#070b16]/98 shadow-sky-950/50 scale-[1.01]'
                : 'border-white/[0.08] bg-[#070b16]/85 opacity-90 hover:opacity-100 hover:border-white/[0.16]'
            }`}
          >
            {/* Titlebar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Globe size={13} className="text-sky-400" />
                <span className="text-[11.5px] font-semibold text-slate-200">Cloudflare & DNS</span>
                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  Active
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="p-0.5 hover:text-white"><Minus size={11} /></span>
                <span className="p-0.5 hover:text-white"><Square size={10} /></span>
                <span className="p-0.5 hover:text-rose-400"><X size={11} /></span>
              </div>
            </div>

            {/* Content */}
            <div className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between p-1.5 rounded bg-white/[0.03] border border-white/[0.05] text-[10px]">
                <span className="font-semibold text-slate-200 font-mono">aknalre.my.id</span>
                <span className="text-emerald-400 font-mono text-[9px]">76 RECORDS</span>
              </div>

              <div className="space-y-1 font-mono text-[9.5px]">
                {[
                  { type: 'A', name: 'api.aknalre.my.id', target: '153.92.5.65' },
                  { type: 'CNAME', name: 'panel.aknalre.my.id', target: 'tunnel-srv-01.cfargotunnel.com' },
                ].map((dns) => (
                  <div
                    key={dns.name}
                    className="flex items-center justify-between p-1.5 rounded border border-white/[0.04] bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-cyan-400 font-bold w-10 text-[9px]">{dns.type}</span>
                      <span className="text-slate-200 font-sans font-medium text-[10px] truncate">{dns.name}</span>
                    </div>
                    <span className="text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded text-[8.5px] shrink-0">
                      ⚡ Proxied
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Window 3: Host Terminal (Bottom Center) ── */}
          <div
            onClick={() => bringToFront('terminal')}
            style={{ zIndex: activeWindow === 'terminal' ? 30 : 20 }}
            className={`absolute bottom-3 left-32 sm:left-48 w-[72%] sm:w-[52%] rounded-xl border transition-all duration-200 shadow-2xl backdrop-blur-xl cursor-pointer ${
              activeWindow === 'terminal'
                ? 'border-emerald-500/40 bg-[#03060c]/98 shadow-emerald-950/50 scale-[1.01]'
                : 'border-white/[0.08] bg-[#03060c]/85 opacity-90 hover:opacity-100 hover:border-white/[0.16]'
            }`}
          >
            {/* Titlebar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Terminal size={12} className="text-emerald-400" />
                <span className="text-[11px] font-semibold text-slate-200">Host Terminal (PTY / zsh)</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="p-0.5 hover:text-white"><Minus size={11} /></span>
                <span className="p-0.5 hover:text-white"><Square size={10} /></span>
                <span className="p-0.5 hover:text-rose-400"><X size={11} /></span>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="p-2 font-mono text-[9.5px] leading-relaxed text-slate-300 bg-black/60 rounded-b-xl space-y-0.5">
              <div className="text-slate-400 flex items-center gap-1">
                <span className="text-emerald-400">root@ypanel-node</span>
                <span className="text-slate-500">:</span>
                <span className="text-cyan-400">~</span>
                <span className="text-slate-500">$</span>
                <span className="text-white font-semibold">ypanel status</span>
              </div>
              <div className="text-emerald-400 text-[9px]">
                ✓ ypanel-agent daemon active (PID 8787) · Port 8787
              </div>
              <div className="text-cyan-400 text-[9px]">
                ✓ Docker engine connected (v26.1.1) · 3 containers up
              </div>
              <div className="text-slate-400 flex items-center gap-1 pt-0.5">
                <span className="text-emerald-400">root@ypanel-node</span>
                <span className="text-slate-500">:</span>
                <span className="text-cyan-400">~</span>
                <span className="text-slate-500">$</span>
                <span className="inline-block w-1.5 h-3 bg-emerald-400 animate-pulse align-middle" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
