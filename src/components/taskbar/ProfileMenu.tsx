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
import { useI18n } from '@/lib/i18n'

interface ProfileMenuProps {
  username?: string
  onLogout: () => void
  loading?: boolean
}

const inputClass = 'w-full rounded-[14px] border border-[var(--win-border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-[13px] text-[var(--win-text)] outline-none transition placeholder-[var(--text-secondary)] dark:bg-[var(--surface-subtle-dark)] focus:border-[var(--profile-icon-cloud)]'

export function ProfileMenu({ username, onLogout, loading }: ProfileMenuProps) {
  const { t } = useI18n()
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
      toast.success(t('profile.configSaved'))
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
      setCfForm({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
      // Langsung verifikasi otomatis
      verifyMut.mutate()
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? t('profile.configSaveFailed')),
  })

  const verifyMut = useMutation({
    mutationFn: verifyCFConfig,
    onSuccess: (res) => {
      if (res.valid) toast.success(t('profile.tokenValid'))
      else toast.error(t('profile.tokenInvalid', { error: res.error ?? 'Unknown error' }))
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
    },
    onError: () => toast.error(t('profile.verifyFailed')),
  })

  const deleteCFMut = useMutation({
    mutationFn: deleteCFConfig,
    onSuccess: () => {
      toast.success(t('profile.configDeleted'))
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

  const displayName = me?.displayName || me?.username || username || t('profile.defaultName')
  const displayRole = me?.role || t('profile.defaultRole')
  const cfStatusBadge = {
    active: { cls: 'bg-[var(--panel-success-bg)] text-[var(--panel-success-text)] dark:text-[var(--panel-success-text)]', icon: <CheckCircle2 className="h-3 w-3" />, label: t('profile.verified') },
    invalid: { cls: 'bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] dark:text-[var(--panel-danger-text)]', icon: <XCircle className="h-3 w-3" />, label: t('profile.invalid') },
    unconfigured: { cls: 'bg-[var(--panel-warning-bg)] text-[var(--panel-warning-text)] dark:text-[var(--panel-warning-text)]', icon: <AlertTriangle className="h-3 w-3" />, label: t('profile.unverified') },
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
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--panel-warning-bg)] px-2 py-0.5 text-[12px] font-semibold text-[var(--panel-warning-text)] dark:text-[var(--panel-warning-text)]">
                <AlertTriangle className="h-3 w-3" />
                {t('profile.attention', { count: attentionCount })}
              </span>
            )}
          </div>

          <div className="profile-menu-section">
            <button className="profile-menu-btn" onClick={toggleMode}>
              {isDark ? <Sun size={14} color="var(--profile-icon-sun)" /> : <Moon size={14} color="var(--profile-icon-moon)" />}
              <span>{isDark ? t('profile.switchLight') : t('profile.switchDark')}</span>
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
              <Cloud size={14} color="var(--profile-icon-cloud)" />
              <span>{t('profile.cloudflareSettings')}</span>
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${cfStatusBadge.cls}`}>
                {cfStatusBadge.icon}
                {cfStatusBadge.label}
              </span>
            </button>
          </div>

          <div className="profile-menu-section">
            <div className="profile-section-label">
              <Palette size={11} />
              {t('profile.wallpaper')}
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
                  title={t('profile.changeImage')}
                  className="wallpaper-swatch active bg-[image:var(--custom-preview,none)] bg-cover bg-center"
                  onClick={() => fileRef.current?.click()}
                >
                  <span className="wallpaper-swatch-label">{t('profile.customWallpaper')}</span>
                </button>
              ) : (
                <button
                  title={t('profile.uploadImage')}
                  className="wallpaper-upload-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={14} />
                  <span>{t('profile.upload')}</span>
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
              <span>{t('profile.logout')}</span>
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  const cloudflareModal = showCloudflareModal
    ? createPortal(
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-[var(--panel-overlay)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-[26px] border border-[var(--win-border)] bg-[var(--win-bg)] p-6 shadow-[var(--win-shadow)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--win-text)]">
                  <Cloud className="h-4 w-4 text-[var(--panel-warning-text)]" />
                  {t('profile.cloudflareSettings')}
                </div>
                <p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">
                  {t('profile.cloudflareSubtitle')}
                </p>
              </div>
              <button
                className="rounded-lg px-3 py-2 text-[var(--text-secondary)] transition hover:bg-[var(--profile-modal-close-hover)] hover:text-[var(--win-text)]"
                onClick={() => setShowCloudflareModal(false)}
              >
                ✕
              </button>
            </div>

            {cfLoading ? (
              <div className="py-10 text-center text-[13px] text-[var(--text-secondary)]">{t('profile.loadingCloudflare')}</div>
            ) : cf?.configured ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--win-border)] bg-[var(--profile-modal-card-bg)] px-4 py-3">
                  <div>
                    <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">{t('profile.connectionStatus')}</div>
                    <div className="mt-1 text-[14px] font-semibold text-[var(--win-text)]">{t('profile.cloudflareConnected')}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-[12px] font-semibold ${cfStatusBadge.cls}`}>
                    {cfStatusBadge.icon}
                    {cfStatusBadge.label}
                  </span>
                </div>

                <div className="space-y-2 rounded-[16px] border border-[var(--win-border)] bg-[var(--profile-modal-card-bg)] p-4">
                  {[
                    { label: t('profile.accountId'), value: cf.accountId },
                    // { label: 'Zone ID', value: cf.zoneId },
                    // { label: 'Base Domain', value: cf.baseDomain },
                    cf.verifiedAt ? { label: t('profile.verifiedAt'), value: new Date(cf.verifiedAt).toLocaleString('id-ID') } : null,
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
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--panel-warning-bg)] px-4 py-2.5 text-[12px] font-semibold text-[var(--panel-warning-text)] transition hover:bg-[var(--panel-warning-bg)] dark:text-[var(--panel-warning-text)] disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {verifyMut.isPending ? t('profile.verifying') : t('profile.verifyToken')}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t('profile.deleteCloudflareConfirm'))) deleteCFMut.mutate()
                    }}
                    className="inline-flex items-center justify-center rounded-[14px] border border-[var(--win-border)] bg-[var(--panel-danger-bg)] px-3.5 py-2.5 text-[var(--panel-danger-text)] transition hover:bg-[var(--panel-danger-bg)]0/16 dark:text-[var(--panel-danger-text)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">

                <div className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-primary-bg)] p-3.5 mb-2">
                  <div className="flex items-start gap-2.5">
                    <Cloud className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" />
                    <div className="text-[12px] leading-relaxed text-[var(--win-text)]">
                      {t('profile.tokenGuide')}
                      <ul className="list-disc pl-4 mt-1 mb-2 space-y-0.5 text-[var(--panel-primary-text)] dark:text-[var(--panel-primary-text)] font-medium">
                        <li>Account → Cloudflare Tunnel → Edit</li>
                        <li>Zone → Zone → Edit <span className="text-[var(--text-secondary)] font-normal">{t('profile.zoneRequired')}</span></li>
                        <li>Zone → Zone → Read <span className="text-[var(--text-secondary)] font-normal">{t('profile.zoneReadHint')}</span></li>
                        <li>Zone → DNS → Edit</li>
                      </ul>
                      <div className="mb-2 rounded-lg bg-[var(--profile-resource-scope-bg)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                        {t('profile.resourceScope')}
                      </div>
                      <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-[var(--panel-primary-text)] hover:text-[var(--panel-primary-text)] dark:hover:text-[var(--panel-primary-text)] font-semibold underline underline-offset-2">
                        {t('profile.openTokens')}
                      </a>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">{t('profile.apiToken')}</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder={t('profile.apiTokenPlaceholder')}
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
                  { key: 'accountId', label: t('profile.accountIdRequired'), placeholder: 'abc123...' },
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--action-cloudflare-gradient)] px-4 py-2.5 text-[13px] font-semibold text-[var(--win-text)] shadow-[var(--action-cloudflare-shadow)] transition hover:brightness-105 disabled:opacity-50"
                >
                  {saveCFMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  {saveCFMut.isPending ? t('profile.saving') : t('profile.saveConnecting')}
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
        <span>{username ?? t('profile.defaultName')}</span>
        {attentionCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-warning-bg)] px-2 py-0.5 text-[12px] font-semibold text-[var(--panel-warning-text)] dark:text-[var(--panel-warning-text)]">
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




