import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  ImagePlus,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  XCircle,
} from 'lucide-react'
import { deleteCFConfig, getCFConfig, getMeV2, getProjectAttentionSummary, setCFConfig, verifyCFConfig } from '@/api/agent'
import { toast } from 'sonner'
import { useThemeStore, WALLPAPERS, type WallpaperKey } from '@/store/themeStore'

interface ProfileMenuProps {
  username?: string
  onLogout: () => void
  loading?: boolean
}

const inputClass = 'w-full rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.03)] px-3.5 py-2.5 text-[13px] text-[var(--win-text)] outline-none transition placeholder-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.04)] focus:border-orange-400'

export function ProfileMenu({ username, onLogout, loading }: ProfileMenuProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showCloudflareModal, setShowCloudflareModal] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [cfForm, setCfForm] = useState({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { mode, wallpaper, toggleMode, setWallpaper, setCustomImage } = useThemeStore()
  const isDark = mode === 'dark'
  const { data: me } = useQuery({ queryKey: ['me-v2'], queryFn: getMeV2, retry: 1 })
  const { data: cf, isLoading: cfLoading } = useQuery({ queryKey: ['cf-config'], queryFn: getCFConfig })
  const { data: projectAttention } = useQuery({
    queryKey: ['projects-attention-summary'],
    queryFn: () => getProjectAttentionSummary(),
    refetchInterval: 15_000,
  })

  const saveCFMut = useMutation({
    mutationFn: setCFConfig,
    onSuccess: () => {
      toast.success('Config disimpan. Memverifikasi token...')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
      setCfForm({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
      // Langsung verifikasi otomatis
      verifyMut.mutate()
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal menyimpan config'),
  })

  const verifyMut = useMutation({
    mutationFn: verifyCFConfig,
    onSuccess: (res) => {
      if (res.valid) toast.success('Token Cloudflare valid! ✓')
      else toast.error('Token tidak valid: ' + (res.error ?? 'Unknown error'))
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
    },
    onError: () => toast.error('Gagal memverifikasi token'),
  })

  const deleteCFMut = useMutation({
    mutationFn: deleteCFConfig,
    onSuccess: () => {
      toast.success('Konfigurasi Cloudflare dihapus')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
      setShowCloudflareModal(false)
    },
  })

  const handleDocMouseDown = (e: MouseEvent) => {
    const target = e.target as Node
    if (btnRef.current?.contains(target)) return
    if (menuRef.current?.contains(target)) return
    setOpen(false)
    window.removeEventListener('mousedown', handleDocMouseDown, true)
  }

  const openMenu = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    window.addEventListener('mousedown', handleDocMouseDown, true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (dataUrl) setCustomImage(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const displayName = me?.displayName || me?.username || username || 'Admin'
  const displayRole = me?.role || 'Administrator'
  const cfStatusBadge = {
    active: { cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Verified' },
    invalid: { cls: 'bg-red-500/12 text-red-600 dark:text-red-300', icon: <XCircle className="h-3 w-3" />, label: 'Invalid' },
    unconfigured: { cls: 'bg-amber-500/12 text-amber-600 dark:text-amber-300', icon: <AlertTriangle className="h-3 w-3" />, label: 'Unverified' },
  }[(cf?.status ?? 'unconfigured') as 'active' | 'invalid' | 'unconfigured']
  const attentionCount = projectAttention?.attentionCount ?? 0

  const dropdown = open
    ? createPortal(
        <div ref={menuRef} className="profile-menu">
          <div className="profile-menu-section flex items-center gap-3">
            <div className="profile-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div>
              <div className="profile-name">{displayName}</div>
              <div className="profile-role">{displayRole}</div>
            </div>
            {attentionCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                {attentionCount} attention
              </span>
            )}
          </div>

          <div className="profile-menu-section">
            <button className="profile-menu-btn" onClick={toggleMode}>
              {isDark ? <Sun size={14} color="#fbbf24" /> : <Moon size={14} color="#6366f1" />}
              <span>{isDark ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}</span>
            </button>
          </div>

          <div className="profile-menu-section">
            <button
              className="profile-menu-btn"
              onClick={() => {
                setOpen(false)
                setShowCloudflareModal(true)
              }}
            >
              <Cloud size={14} color="#f97316" />
              <span>Cloudflare Settings</span>
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfStatusBadge.cls}`}>
                {cfStatusBadge.icon}
                {cfStatusBadge.label}
              </span>
            </button>
          </div>

          <div className="profile-menu-section">
            <div className="profile-section-label">
              <Palette size={11} />
              Wallpaper
            </div>

            <div className="wallpaper-grid">
              {(Object.entries(WALLPAPERS) as [Exclude<WallpaperKey, 'custom'>, typeof WALLPAPERS[Exclude<WallpaperKey, 'custom'>]][]).map(([key, val]) => {
                const background = isDark ? (val.dark ?? val.light) : val.light
                return (
                  <button
                    key={key}
                    title={val.label}
                    className={`wallpaper-swatch ${wallpaper === key ? 'active' : ''}`}
                    onClick={() => setWallpaper(key)}
                    style={{ ['--swatch-bg' as string]: background } as React.CSSProperties}
                  >
                    <span className="wallpaper-swatch-label">{val.label}</span>
                  </button>
                )
              })}

              {wallpaper === 'custom' ? (
                <button
                  title="Ganti gambar"
                  className="wallpaper-swatch active bg-[image:var(--custom-preview,none)] bg-cover bg-center"
                  onClick={() => fileRef.current?.click()}
                >
                  <span className="wallpaper-swatch-label">Custom</span>
                </button>
              ) : (
                <button
                  title="Upload gambar"
                  className="wallpaper-upload-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={14} />
                  <span>Upload</span>
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="profile-menu-section">
            <button
              className="profile-menu-btn profile-menu-btn-danger"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  const cloudflareModal = showCloudflareModal
    ? createPortal(
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-[26px] border border-[var(--win-border)] bg-[var(--win-bg)] p-6 shadow-[var(--win-shadow)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--win-text)]">
                  <Cloud className="h-4 w-4 text-orange-500" />
                  Cloudflare Settings
                </div>
                <p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">
                  Atur tunnel dan token Cloudflare langsung dari profile menu.
                </p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-[var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[var(--win-text)] dark:hover:bg-[rgba(255,255,255,0.06)]"
                onClick={() => setShowCloudflareModal(false)}
              >
                ✕
              </button>
            </div>

            {cfLoading ? (
              <div className="py-10 text-center text-[13px] text-[var(--text-secondary)]">Memuat konfigurasi Cloudflare...</div>
            ) : cf?.configured ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] px-4 py-3 dark:bg-[rgba(255,255,255,0.03)]">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">Connection status</div>
                    <div className="mt-1 text-[14px] font-semibold text-[var(--win-text)]">Cloudflare account connected</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${cfStatusBadge.cls}`}>
                    {cfStatusBadge.icon}
                    {cfStatusBadge.label}
                  </span>
                </div>

                <div className="space-y-2 rounded-[16px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] p-4 dark:bg-[rgba(255,255,255,0.03)]">
                  {[
                    { label: 'Account ID', value: cf.accountId },
                    // { label: 'Zone ID', value: cf.zoneId },
                    // { label: 'Base Domain', value: cf.baseDomain },
                    cf.verifiedAt ? { label: 'Verified At', value: new Date(cf.verifiedAt).toLocaleString('id-ID') } : null,
                  ].filter(Boolean).map((item) => (
                    <div key={item!.label} className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
                      <span className="text-[var(--text-secondary)]">{item!.label}</span>
                      <span className="font-mono text-[var(--win-text)]">{item!.value || '—'}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => verifyMut.mutate()}
                    disabled={verifyMut.isPending}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-orange-500/12 px-4 py-2.5 text-[12px] font-semibold text-orange-600 transition hover:bg-orange-500/18 dark:text-orange-300 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {verifyMut.isPending ? 'Memverifikasi...' : 'Verifikasi token'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Hapus konfigurasi Cloudflare? Tunnel yang ada tidak akan terpengaruh.')) deleteCFMut.mutate()
                    }}
                    className="inline-flex items-center justify-center rounded-[14px] border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-red-600 transition hover:bg-red-500/16 dark:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">

                <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3.5 mb-2">
                  <div className="flex items-start gap-2.5">
                    <Cloud className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                    <div className="text-[12px] leading-relaxed text-[var(--win-text)]">
                      Buat API Token (Custom Token) di Cloudflare dengan permission berikut:
                      <ul className="list-disc pl-4 mt-1 mb-2 space-y-0.5 text-sky-600 dark:text-sky-400 font-medium">
                        <li>Account → Cloudflare Tunnel → Edit</li>
                        <li>Zone → Zone → Edit <span className="text-[var(--text-secondary)] font-normal">(wajib untuk tambah domain/zone baru)</span></li>
                        <li>Zone → Zone → Read <span className="text-[var(--text-secondary)] font-normal">(untuk status domain & nameserver)</span></li>
                        <li>Zone → DNS → Edit</li>
                      </ul>
                      <div className="mb-2 rounded-lg bg-white/45 px-3 py-2 text-[11px] text-[var(--text-secondary)] dark:bg-black/10">
                        Resource scope: pilih <strong>Account Resources → Include → akun kamu</strong>, lalu
                        <strong> Zone Resources → Include → All zones</strong> agar domain baru bisa dibuat dan DNS bisa dikelola.
                      </div>
                      <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 font-semibold underline underline-offset-2">
                        Buka halaman Cloudflare Tokens ↗
                      </a>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">API Token *</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder="Paste Cloudflare API Token di sini"
                      value={cfForm.apiToken}
                      onChange={(e) => setCfForm((f) => ({ ...f, apiToken: e.target.value }))}
                      className={`${inputClass} pr-10`}
                    />
                    <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--win-text)]">
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {[
                  { key: 'accountId', label: 'Account ID *', placeholder: 'abc123...' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">{label}</label>
                    <input
                      value={(cfForm as any)[key]}
                      onChange={(e) => setCfForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className={inputClass}
                    />
                  </div>
                ))}

                <button
                  onClick={() => saveCFMut.mutate(cfForm)}
                  disabled={saveCFMut.isPending || !cfForm.apiToken || !cfForm.accountId}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(135deg,#f97316,#fb923c)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_12px_24px_rgba(249,115,22,0.22)] transition hover:brightness-105 disabled:opacity-50"
                >
                  {saveCFMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  {saveCFMut.isPending ? 'Menyimpan...' : 'Simpan & hubungkan'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={btnRef}
        id="taskbar-profile"
        className="profile-btn"
        onClick={openMenu}
        disabled={loading}
      >
        <User size={13} />
        <span>{username ?? 'Profile'}</span>
        {attentionCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {attentionCount}
          </span>
        )}
      </button>

      {dropdown}
      {cloudflareModal}
    </>
  )
}
