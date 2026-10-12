import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Globe,
  Terminal,
  Key,
  Shield,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Box,
  HardDrive,
  Activity,
  Sparkles,
  Code2,
} from 'lucide-react'
import { copyTextToClipboard } from '@/api/agent'

export function McpGuidePage() {
  const navigate = useNavigate()
  const [userToken, setUserToken] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://panel.example.com'
  const effectiveToken = userToken.trim() || 'ypat_TOKEN_KAMU'

  const mcpUrl = `${origin}/mcp?key=${effectiveToken}`
  const hermesCommand = `hermes mcp add YPANEL --url "${mcpUrl}"`
  const openclawCommand = `openclaw mcp add YPANEL --transport streamable-http --url "${mcpUrl}"`

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        ypanel: {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  )

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        ypanel: {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  )

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyTextToClipboard(text)
    if (ok) {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2500)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--win-bg,#0b1120)] text-[var(--win-text,#f1f5f9)] font-sans flex flex-col selection:bg-[var(--accent,#f97316)] selection:text-white">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[var(--win-bg,#0b1120)]/85 border-b border-[var(--win-border,rgba(255,255,255,0.08))] px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 text-left cursor-pointer group"
          >
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
              Y
            </div>
            <div>
              <div className="text-[13.5px] font-bold tracking-tight text-[var(--win-text)] flex items-center gap-1.5">
                <span>YPanel</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  MCP Hub
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-secondary,#94a3b8)]">
                Server Control Panel
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="panel-btn !h-8 px-3 rounded-lg text-[12px] text-[var(--text-secondary,#94a3b8)] hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Beranda</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="panel-btn panel-btn--primary !h-8 px-3.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <span>Masuk Panel</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11.5px] font-semibold">
            <Bot size={14} />
            <span>Integrasi AI Agent Mandiri • Model Context Protocol</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--win-text)] leading-tight">
            Panduan Menghubungkan <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">Hermes Agent</span> ke YPanel
          </h1>
          <p className="text-[13.5px] sm:text-[15px] text-[var(--text-secondary,#94a3b8)] leading-relaxed">
            Kendalikan Linux Server, Docker Container, Filesystem, dan Cloudflare langsung dari perintah chat AI Agent tanpa perlu membuka web dashboard.
          </p>
        </div>

        {/* ── Interactive 1-Click Command Generator ── */}
        <div className="panel-shell-card p-5 sm:p-6 rounded-2xl border border-[var(--win-border,rgba(255,255,255,0.1))] bg-[var(--panel-surface,rgba(255,255,255,0.02))] space-y-5 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--win-border,rgba(255,255,255,0.08))]">
            <div className="flex items-center gap-2.5">
              <Key size={18} className="text-amber-400" />
              <div>
                <h2 className="text-[14px] font-semibold text-[var(--win-text)]">
                  Generator Perintah Cepat (Instant Quick Connect)
                </h2>
                <p className="text-[11.5px] text-[var(--text-secondary,#94a3b8)]">
                  Masukkan token API YPanel Anda di bawah untuk menghasilkan perintah CLI siap salin.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/30 border border-[var(--win-border)] text-[var(--text-secondary)] self-start sm:self-auto">
              Endpoint: {origin}/mcp
            </span>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--win-text)] mb-1.5">
              API Token YPanel Anda (format: <code>ypat_...</code>)
            </label>
            <input
              type="text"
              placeholder="Tempel token di sini, contoh: ypat_525b7d6624ba1622692b3283b49ed04f6b9a7b1c"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              className="panel-input panel-mono w-full h-[42px] px-3.5 text-[12.5px] rounded-xl border border-[var(--win-border)] bg-black/25 text-amber-300 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Quick CLI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hermes Agent Card */}
            <div className="p-4 rounded-xl bg-black/30 border border-emerald-500/30 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-[13px] text-emerald-400">
                    <Bot size={16} />
                    <span>Hermes Agent CLI</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    Rekomendasi
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--text-secondary,#94a3b8)]">
                  Jalankan perintah ini di Command Prompt / Terminal:
                </p>
                <pre className="panel-mono text-[11px] p-2.5 rounded-lg bg-black/50 text-amber-300 border border-emerald-500/20 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                  {hermesCommand}
                </pre>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(hermesCommand, 'hermesGen')}
                className="panel-btn panel-btn--primary !h-8.5 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer w-full"
              >
                {copiedKey === 'hermesGen' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedKey === 'hermesGen' ? 'Tersalin!' : 'Salin Perintah Hermes'}</span>
              </button>
            </div>

            {/* OpenClaw Card */}
            <div className="p-4 rounded-xl bg-black/30 border border-blue-500/30 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-[13px] text-blue-400">
                    <Globe size={16} />
                    <span>OpenClaw CLI</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                    Streamable HTTP
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--text-secondary,#94a3b8)]">
                  Jalankan perintah ini di OpenClaw terminal:
                </p>
                <pre className="panel-mono text-[11px] p-2.5 rounded-lg bg-black/50 text-blue-300 border border-blue-500/20 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                  {openclawCommand}
                </pre>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(openclawCommand, 'openclawGen')}
                className="panel-btn panel-btn--primary !h-8.5 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer w-full"
              >
                {copiedKey === 'openclawGen' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedKey === 'openclawGen' ? 'Tersalin!' : 'Salin Perintah OpenClaw'}</span>
              </button>
            </div>
          </div>

          {/* Direct Endpoint URL */}
          <div className="p-3 rounded-xl bg-black/20 border border-[var(--win-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <span className="text-[11px] text-[var(--text-secondary)] block">
                URL Endpoint MCP Langsung (untuk HTTP Client / Web Connectors):
              </span>
              <code className="panel-mono text-[11px] text-emerald-400 truncate block">
                {mcpUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(mcpUrl, 'mcpUrlGen')}
              className="panel-btn !h-7.5 px-3 rounded-lg text-[11px] font-medium text-[var(--panel-primary-text)] hover:underline shrink-0 flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'mcpUrlGen' ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedKey === 'mcpUrlGen' ? 'Tersalin' : 'Salin URL'}</span>
            </button>
          </div>
        </div>

        {/* ── Step-by-Step Integration Guide ── */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[var(--win-text)]">
              Langkah Demi Langkah (3 Menit Setup)
            </h2>
            <p className="text-[12.5px] text-[var(--text-secondary,#94a3b8)]">
              Ikuti tiga tahap mudah berikut untuk mulai memerintah server via AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-3">
              <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-400 font-bold flex items-center justify-center text-[13px] border border-amber-500/30">
                1
              </div>
              <h3 className="text-[14px] font-semibold text-[var(--win-text)]">
                Dapatkan API Token
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                Login ke YPanel, buka aplikasi <strong>Settings</strong> di layar desktop, lalu masuk ke tab <strong>API & Token MCP</strong>. Klik <em>Generate Token</em> dan salin token <code>ypat_...</code> Anda.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-3">
              <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center text-[13px] border border-emerald-500/30">
                2
              </div>
              <h3 className="text-[14px] font-semibold text-[var(--win-text)]">
                Tambahkan ke Hermes Agent
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                Jalankan perintah <code>hermes mcp add YPANEL --url "..."</code> di terminal Anda. Hermes akan langsung memverifikasi ketersediaan tools secara otomatis.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-3">
              <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-400 font-bold flex items-center justify-center text-[13px] border border-blue-500/30">
                3
              </div>
              <h3 className="text-[14px] font-semibold text-[var(--win-text)]">
                Mulai Beri Perintah
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                Buka sesi chat Hermes Agent dan berikan instruksi dengan bahasa biasa. Agent akan mengeksekusi operasi server dan melaporkan hasilnya kepada Anda.
              </p>
            </div>
          </div>
        </div>

        {/* ── Real-World Prompts Showcase ── */}
        <div className="panel-shell-card p-5 sm:p-6 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400" />
            <h2 className="text-[14px] font-semibold text-[var(--win-text)]">
              Contoh Perintah Nyata untuk AI Agent
            </h2>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Berikut beberapa instruksi yang bisa Anda ketikkan langsung ke Hermes Agent atau Claude:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl bg-black/25 border border-[var(--win-border)] space-y-1">
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                <Activity size={13} />
                Diagnostik Kesehatan Server
              </span>
              <p className="text-[12px] italic text-[var(--win-text)]">
                "Hermes, tolong periksa penggunaan RAM, CPU, dan sisa kapasitas disk di server YPanel saya sekarang."
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-black/25 border border-[var(--win-border)] space-y-1">
              <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
                <Box size={13} />
                Troubleshooting Docker
              </span>
              <p className="text-[12px] italic text-[var(--win-text)]">
                "Daftar semua container Docker. Jika ada container yang statusnya Exited, bacakan log error terakhirnya lalu restart."
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-black/25 border border-[var(--win-border)] space-y-1">
              <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                <HardDrive size={13} />
                Inspeksi Konfigurasi File
              </span>
              <p className="text-[12px] italic text-[var(--win-text)]">
                "Buka file /var/www/my-project/ecosystem.config.js dan periksa port yang digunakan oleh aplikasi."
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-black/25 border border-[var(--win-border)] space-y-1">
              <span className="text-[11px] font-semibold text-purple-400 flex items-center gap-1.5">
                <Terminal size={13} />
                Eksekusi Shell Host (Admin)
              </span>
              <p className="text-[12px] italic text-[var(--win-text)]">
                "Jalankan perintah systemctl status nginx dan periksa apakah daemon web server berjalan stabil."
              </p>
            </div>
          </div>
        </div>

        {/* ── RBAC Security Model ── */}
        <div className="panel-shell-card p-5 sm:p-6 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-emerald-400" />
            <h2 className="text-[14px] font-semibold text-[var(--win-text)]">
              Model Keamanan & Hak Akses Berbasis Peran (RBAC)
            </h2>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Ketersediaan tools yang dapat diakses oleh AI agent dibatasi secara ketat sesuai peran pemilik token API:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[var(--win-border)] text-[var(--text-secondary)]">
                  <th className="py-2.5 px-3 font-semibold">Role Akun</th>
                  <th className="py-2.5 px-3 font-semibold">Jumlah Tools</th>
                  <th className="py-2.5 px-3 font-semibold">Hak Akses & Cakupan</th>
                  <th className="py-2.5 px-3 font-semibold">Proteksi Keamanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--win-border)]">
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-3 font-semibold text-amber-400">superadmin / admin</td>
                  <td className="py-3 px-3 font-mono font-bold">22 Tools</td>
                  <td className="py-3 px-3 text-[var(--win-text)]">
                    Akses Penuh: Terminal root host, Docker full lifecycle (start/stop/restart/delete), Filesystem read/write, Proyek, User, Cloudflare.
                  </td>
                  <td className="py-3 px-3 text-emerald-400">Guardrail anti-perintah destruktif (rm -rf / diblokir otomatis).</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-3 font-semibold text-blue-400">user (Developer)</td>
                  <td className="py-3 px-3 font-mono font-bold">9 Tools</td>
                  <td className="py-3 px-3 text-[var(--win-text)]">
                    Sandbox Pengembang: Kelola proyek web miliknya sendiri, pantau status sistem & Cloudflare, baca file proyek (read-only), baca logs Docker.
                  </td>
                  <td className="py-3 px-3 text-amber-300">Terminal shell host & modifikasi file sistem dinonaktifkan.</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-3 font-semibold text-[var(--text-secondary)]">Tanpa Token (Anonim)</td>
                  <td className="py-3 px-3 font-mono font-bold">6 Tools</td>
                  <td className="py-3 px-3 text-[var(--win-text)]">
                    Diagnostik Publik: Info resource CPU, RAM, disk, dan daftar container berjalan.
                  </td>
                  <td className="py-3 px-3 text-gray-400">Hanya pembacaan aman tanpa mutasi state.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Claude Desktop & Cursor IDE Alternative ── */}
        <div className="panel-shell-card p-5 sm:p-6 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-4">
          <h2 className="text-[14px] font-semibold text-[var(--win-text)] flex items-center gap-2">
            <Code2 size={16} className="text-amber-400" />
            Integrasi Alternatif: Claude Desktop & Cursor IDE (HTTP / JSON)
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Jika Anda ingin menggunakan Claude Desktop atau Cursor dengan endpoint HTTP YPanel:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  Claude Desktop (<code>claude_desktop_config.json</code>)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(claudeDesktopConfig, 'claudeJson')}
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'claudeJson' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === 'claudeJson' ? 'Tersalin' : 'Salin JSON'}</span>
                </button>
              </div>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/40 border border-[var(--win-border)] text-amber-300 overflow-x-auto leading-relaxed">
                {claudeDesktopConfig}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  Cursor IDE (<code>.cursor/mcp.json</code>)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(cursorConfig, 'cursorJson')}
                  className="text-[11px] text-[var(--panel-primary-text)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'cursorJson' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === 'cursorJson' ? 'Tersalin' : 'Salin JSON'}</span>
                </button>
              </div>
              <pre className="panel-mono text-[11px] p-3 rounded-xl bg-black/40 border border-[var(--win-border)] text-blue-300 overflow-x-auto leading-relaxed">
                {cursorConfig}
              </pre>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--win-border,rgba(255,255,255,0.08))] py-6 px-4 sm:px-8 text-center text-[12px] text-[var(--text-secondary,#94a3b8)] space-y-2">
        <p>
          YPanel MCP Server • Protokol Standar Industri untuk Otomasi Server & AI Autonomous Agent.
        </p>
        <div className="flex items-center justify-center gap-4 text-[11.5px]">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-[var(--panel-primary-text)] hover:underline cursor-pointer"
          >
            Login ke Panel
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-[var(--text-secondary)] hover:text-white cursor-pointer"
          >
            Kembali ke Beranda
          </button>
        </div>
      </footer>
    </div>
  )
}
