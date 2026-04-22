import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Waypoints,
} from 'lucide-react'
import {
  getDatabaseStatus,
  getEditableSystemSettings,
  resetDatabasePassword,
  updateEditableSystemSettings,
  updatePanelOrigins,
  updatePanelPort,
} from '@/api/agent'
import { alertLib } from '@/lib/alert'
import type { ResetDatabasePasswordResponse, UpdatePanelPortPayload, UpdateSystemSettingsPayload } from '@/types'

const TIMEZONES = [
  'UTC',
  'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong',
  'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh',
  'Asia/Dhaka', 'Asia/Colombo', 'Asia/Yangon', 'Asia/Ho_Chi_Minh',
  'Asia/Manila', 'Asia/Taipei', 'Asia/Ulaanbaatar', 'Asia/Almaty',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Europe/Amsterdam', 'Europe/Rome', 'Europe/Madrid', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Toronto', 'America/Mexico_City', 'America/Buenos_Aires',
  'Africa/Cairo', 'Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Honolulu',
]

const PRESET_DNS = [
  { label: 'Cloudflare', value: '1.1.1.1', tone: 'panel-badge--warning' },
  { label: '1.0.0.1', value: '1.0.0.1', tone: 'panel-badge--warning' },
  { label: 'Google', value: '8.8.8.8', tone: 'panel-badge--success' },
  { label: '8.8.4.4', value: '8.8.4.4', tone: 'panel-badge--success' },
  { label: 'Quad9', value: '9.9.9.9', tone: 'panel-badge--info' },
  { label: 'OpenDNS', value: '208.67.222.222', tone: 'panel-badge--neutral' },
]

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-[var(--win-text)]">{label}</span>
      {hint ? <span className="panel-mono text-[10px] text-[var(--text-secondary)]">{hint}</span> : null}
    </div>
  )
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="panel-muted-block flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl text-[var(--win-text)]">
        {icon}
      </div>
      <div>
        <div className="text-[14px] font-bold text-[var(--win-text)]">{title}</div>
        <div className="mt-0.5 text-[11px] leading-5 text-[var(--text-secondary)]">{subtitle}</div>
      </div>
    </div>
  )
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(
    () => TIMEZONES.filter((timezone) => timezone.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="panel-input flex h-[42px] items-center justify-between px-3.5 text-left text-[13px]"
      >
        <span className={value ? 'text-[var(--win-text)]' : 'text-[var(--text-secondary)]'}>
          {value || 'Pilih timezone...'}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="panel-shell-card absolute inset-x-0 top-[calc(100%+6px)] z-[9999] overflow-hidden p-0 shadow-[var(--win-shadow)]">
          <div className="border-b border-[var(--win-border)] p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari timezone..."
              className="panel-input h-[34px] px-3 text-[12px]"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-3 text-[12px] text-[var(--text-secondary)]">Tidak ditemukan</div>
            ) : (
              filtered.map((timezone) => {
                const active = timezone === value
                return (
                  <button
                    key={timezone}
                    type="button"
                    onClick={() => {
                      onChange(timezone)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={[
                      'block w-full px-3.5 py-2 text-left text-[12px] transition',
                      active
                        ? 'bg-[var(--panel-primary-bg)] font-semibold text-[var(--panel-primary-text)]'
                        : 'text-[var(--win-text)] hover:bg-[var(--panel-surface-hover)]',
                    ].join(' ')}
                  >
                    {timezone}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DnsEditor({ nameservers, onChange }: { nameservers: string[]; onChange: (v: string[]) => void }) {
  const [newEntry, setNewEntry] = useState('')

  const addEntry = () => {
    const value = newEntry.trim()
    if (!value || nameservers.includes(value)) return
    onChange([...nameservers, value])
    setNewEntry('')
  }

  const removeEntry = (index: number) => onChange(nameservers.filter((_, currentIndex) => currentIndex !== index))
  const addPreset = (ip: string) => {
    if (!nameservers.includes(ip)) onChange([...nameservers, ip])
  }

  return (
    <div className="flex flex-col gap-2">
      {nameservers.length === 0 ? (
        <div className="panel-empty min-h-[88px] rounded-[14px] px-3.5 py-2.5 text-[12px]">
          <span>Belum ada nameserver — tambah dari preset atau secara manual.</span>
        </div>
      ) : null}

      {nameservers.map((nameserver, index) => (
        <div key={`${nameserver}-${index}`} className="flex items-center gap-1.5">
          <div className="panel-muted-block flex h-10 flex-1 items-center gap-2.5 rounded-[10px] px-3.5">
            <CheckCircle2 size={13} className="text-[var(--panel-success-text)]" />
            <code className="panel-mono flex-1 break-all text-[12px] text-[var(--win-text)]">{nameserver}</code>
          </div>
          <button
            type="button"
            onClick={() => removeEntry(index)}
            className="panel-icon-btn h-[38px] w-[38px] rounded-[10px] border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] text-[var(--panel-danger-text)] hover:bg-[color:var(--panel-danger-bg)]"
            aria-label={`Hapus nameserver ${nameserver}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <div className="mt-1 flex gap-1.5">
        <input
          value={newEntry}
          onChange={(event) => setNewEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addEntry()
            }
          }}
          placeholder="Tambah IP DNS (cth: 1.1.1.1)"
          className="panel-input panel-input--mono h-10 flex-1 px-3.5 text-[12px]"
        />
        <button type="button" onClick={addEntry} className="panel-btn panel-btn--primary h-10 w-10 rounded-[10px] p-0" aria-label="Tambah nameserver">
          <Plus size={15} />
        </button>
      </div>

      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {PRESET_DNS.map((preset) => {
          const active = nameservers.includes(preset.value)
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => addPreset(preset.value)}
              disabled={active}
              className={[
                'panel-badge transition',
                active ? preset.tone : 'panel-badge--neutral',
              ].join(' ')}
            >
              <span className="panel-status-dot" />
              {preset.label} <code className="panel-mono text-[10px]">({preset.value})</code>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AuditCard({ username, createdAt, hostname, timezone, nameservers }: { username?: string; createdAt: string; hostname?: string; timezone?: string; nameservers: string[] }) {
  return (
    <div className="panel-shell-card px-4 py-3.5 shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="mb-2.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.10em] text-[var(--text-secondary)]">
        <span>{username || 'system'}</span>
        <span>•</span>
        <span>{new Date(createdAt).toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 text-[12px] text-[var(--win-text)]">
        <div><strong className="text-[var(--text-secondary)]">Host:</strong> {hostname || '—'}</div>
        <div><strong className="text-[var(--text-secondary)]">TZ:</strong> {timezone || '—'}</div>
        <div><strong className="text-[var(--text-secondary)]">DNS:</strong> {nameservers.length ? nameservers.join(', ') : '—'}</div>
      </div>
    </div>
  )
}

export function SettingsWindow({ authenticated }: { authenticated?: boolean }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['editable-system-settings'],
    queryFn: getEditableSystemSettings,
    retry: 1,
  })

  const databaseQuery = useQuery({
    queryKey: ['database-status'],
    queryFn: getDatabaseStatus,
    retry: 1,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (authenticated) {
      void query.refetch()
      void databaseQuery.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const [hostname, setHostname] = useState('')
  const [timezone, setTimezone] = useState('')
  const [nameservers, setNameservers] = useState<string[]>([])
  const [panelPort, setPanelPort] = useState('')
  const [allowedOriginsText, setAllowedOriginsText] = useState('')
  const [dbResetResult, setDbResetResult] = useState<ResetDatabasePasswordResponse | null>(null)

  useEffect(() => {
    if (!query.data) return
    setHostname(query.data.hostname)
    setTimezone(query.data.timezone)
    setNameservers(query.data.nameservers)
    setPanelPort(query.data.bindAddr.split(':').slice(-1)[0] ?? '')
    setAllowedOriginsText(query.data.originsRaw || query.data.allowedOrigins.join('\n'))
  }, [query.data])

  const payload = useMemo<UpdateSystemSettingsPayload>(() => ({
    hostname: hostname.trim(),
    timezone: timezone.trim(),
    nameservers: nameservers.map((value) => value.trim()).filter(Boolean),
  }), [hostname, timezone, nameservers])

  const portPayload = useMemo<UpdatePanelPortPayload>(() => ({
    port: Number(panelPort.trim()),
  }), [panelPort])

  const syncSettingsSnapshot = (data: Awaited<ReturnType<typeof getEditableSystemSettings>>) => {
    queryClient.setQueryData(['editable-system-settings'], data)
    queryClient.invalidateQueries({ queryKey: ['agent-system-summary'] })
    queryClient.invalidateQueries({ queryKey: ['database-status'] })
    setPanelPort(data.bindAddr.split(':').slice(-1)[0] ?? '')
    setAllowedOriginsText(data.originsRaw || data.allowedOrigins.join('\n'))
  }

  const mutation = useMutation({
    mutationFn: updateEditableSystemSettings,
    onSuccess: (data) => {
      alertLib.fire('Tersimpan', 'Pengaturan identity host berhasil diterapkan ke sistem Linux.', 'success', 'settings')
      syncSettingsSnapshot(data)
    },
    onError: (error: any) => {
      alertLib.fire('Gagal Menyimpan', error?.message || 'Gagal menyimpan settings host.', 'error', 'settings')
    }
  })

  const panelPortMutation = useMutation({
    mutationFn: updatePanelPort,
    onSuccess: (data) => {
      alertLib.fire('Port Diperbarui', 'Port panel berhasil diubah dan daemon telah di-restart otomatis.', 'success', 'settings')
      syncSettingsSnapshot(data)
    },
    onError: (error: any) => {
      alertLib.fire('Gagal Mengubah Port', error?.message || 'Gagal memperbarui port panel.', 'error', 'settings')
    }
  })

  const panelOriginsMutation = useMutation({
    mutationFn: updatePanelOrigins,
    onSuccess: (data) => {
      alertLib.fire('Origins Disimpan', 'Allowed origins CORS berhasil diperbarui.', 'success', 'settings')
      syncSettingsSnapshot(data)
    },
    onError: (error: any) => {
      alertLib.fire('Gagal Menyimpan', error?.message || 'Gagal memperbarui allowed origins.', 'error', 'settings')
    }
  })

  const resetDatabaseMutation = useMutation({
    mutationFn: resetDatabasePassword,
    onSuccess: (data) => {
      setDbResetResult(data)
      alertLib.fire('Rotasi Berhasil', 'Password root database berhasil direset. Simpan kredensial baru agar tidak hilang.', 'success', 'settings')
      queryClient.invalidateQueries({ queryKey: ['database-status'] })
      queryClient.invalidateQueries({ queryKey: ['agent-system-summary'] })
    },
    onError: (error: any) => {
      alertLib.fire('Gagal Merotasi', error?.message || 'Gagal merotasi password root database.', 'error', 'settings')
    }
  })

  const handleUpdateIdentity = async () => {
    const isConfirmed = await alertLib.confirm(
      'Simpan Identity Host?',
      'Perubahan Hostname, Timezone, dan pengaturan DNS (resolv.conf) akan langsung diterapkan secara daemon ke sistem operasi asli under-the-hood. Lanjutkan?',
      'Ya, Simpan',
      'Batal',
      'question',
      'settings'
    )

    if (isConfirmed) {
      if (!hostname.trim() || !timezone.trim()) {
        alertLib.fire('Data Tidak Lengkap', 'Hostname dan Timezone tidak boleh dibiarkan kosong!', 'warning', 'settings')
        return
      }
      mutation.mutate(payload)
    }
  }

  const handleUpdatePanelPort = async () => {
    const isConfirmed = await alertLib.confirm(
      'Ubah Port Panel',
      `Anda yakin ingin memindahkan jalur akses Panel ke Port <b>${portPayload.port}</b>?<br/><br/>Harap pastikan URL browser Anda ikut disesuaikan saat panel mengalami siklus reload sesaat lagi.`,
      'Ya, Pindahkan Port',
      'Batal',
      'warning',
      'settings'
    )
    if (isConfirmed) panelPortMutation.mutate(portPayload)
  }

  const handleUpdateOrigins = async () => {
    const isConfirmed = await alertLib.confirm(
      'Ubah Allowed Origins',
      'Modifikasi Allowed Origins (CORS) sangat sensitif karena akan mempengaruhi izin akses dari koneksi *front-end* eksternal. Yakin ingin mem-publish pengaturan ini?',
      'Terbitkan Rules',
      'Batal',
      'question',
      'settings'
    )
    if (isConfirmed) panelOriginsMutation.mutate({ originsRaw: allowedOriginsText })
  }

  const handleResetDatabase = async () => {
    const isConfirmed = await alertLib.confirm(
      'PERINGATAN Rotasi Database',
      '<b>AKSI BERBAHAYA!</b> Merotasi kredensial otomatis akan seketika menyapu bersih password Root lama dari file konfigurasi dan mencetak yang baru ke engine MariaDB!<br/><br/>Lanjutkan rotasi kritis ini?',
      'Tarik & Rotasi Sekarang',
      'Tutup',
      'warning',
      'settings'
    )
    if (isConfirmed) resetDatabaseMutation.mutate()
  }

  if (query.isLoading) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Server className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">Settings & Host Identity</div>
              <div className="panel-window__meta">Konfigurasi host, panel, dan runtime database</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <div className="panel-loading">
            <LoaderCircle size={16} className="animate-spin" />
            Memuat system settings dari host...
          </div>
        </div>
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Server className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">Settings & Host Identity</div>
              <div className="panel-window__meta">Konfigurasi host, panel, dan runtime database</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <div className="panel-error-state">
            <Database className="h-5 w-5" />
            <div>
              <p className="font-semibold">Gagal memuat settings host</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">Pastikan service berjalan sebagai root dan host mendukung hostnamectl serta timedatectl.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Server className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Settings & Host Identity</div>
            <div className="panel-window__meta">Konfigurasi host, panel, dan runtime database</div>
          </div>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <Sparkles className="h-3 w-3" />
              Runtime host controls
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="panel-hero__title">Settings & Host Identity</div>
                <p className="panel-hero__description">
                  Kelola hostname, timezone, DNS nameserver, panel port, CORS origins, dan kredensial runtime database dari satu tempat.
                </p>
              </div>

              <div className="panel-muted-block min-w-[220px] px-5 py-4">
                <div className="panel-section-label">Detected host</div>
                <div className="mt-1 text-[15px] font-semibold text-[var(--win-text)]">{query.data.osName}</div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Kernel {query.data.kernel}</div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--panel-surface-hover)] px-2.5 py-1 text-[11px] text-[var(--win-text)]">
                  <ShieldCheck size={12} />
                  DNS: {query.data.dnsMode}
                </div>
              </div>
            </div>
          </section>

          <div className="panel-shell-card p-5 flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div>
                <SectionHeader icon={<Server size={17} />} title="Identity" subtitle="Hostname dan timezone host Linux" />
                <div className="flex flex-col gap-3.5 mt-2">
                  <div>
                    <FieldLabel label="Hostname" hint="hostnamectl" />
                    <input
                      id="settings-hostname"
                      value={hostname}
                      onChange={(event) => setHostname(event.target.value)}
                      className="panel-input h-[42px] px-3.5 text-[13px]"
                      placeholder="node1-ubuntu"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Timezone" hint="timedatectl" />
                    <TimezoneSelect value={timezone} onChange={setTimezone} />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader
                  icon={<Globe2 size={17} />}
                  title="DNS Nameservers"
                  subtitle={`Mode aktif: ${query.data.dnsMode} • ${query.data.managedConfigPath}`}
                />
                <div className="mt-2">
                  <DnsEditor nameservers={nameservers} onChange={setNameservers} />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--win-border)] pt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="panel-muted-block flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--win-text)]">
                  <BadgeCheck size={18} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[var(--win-text)]">Simpan perubahan host</div>
                  <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">Hostname, timezone, dan DNS nameserver akan diperbarui.</div>
                </div>
              </div>

              <button
                id="settings-save"
                type="button"
                onClick={handleUpdateIdentity}
                disabled={mutation.isPending}
                className="panel-btn panel-btn--primary rounded-xl px-[22px] py-2.5 text-[13px]"
              >
                {mutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                {mutation.isPending ? 'Menyimpan...' : 'Simpan settings'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="panel-shell-card p-5">
              <SectionHeader
                icon={<LockKeyhole size={17} />}
                title="Runtime panel port"
                subtitle="Ubah port panel tanpa menyentuh editor origin secara manual"
              />

              <div className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Bind address aktif" hint="read only" />
                    <input id="settings-bind-addr" value={query.data.bindAddr} readOnly className="panel-input panel-input--mono h-[42px] px-3.5 text-[12px] opacity-80" />
                  </div>
                  <div>
                    <FieldLabel label="Port panel" hint="1-65535" />
                    <input
                      id="settings-panel-port"
                      inputMode="numeric"
                      value={panelPort}
                      onChange={(event) => setPanelPort(event.target.value.replace(/[^0-9]/g, ''))}
                      className="panel-input panel-input--mono h-[42px] px-3.5 text-[12px]"
                      placeholder="8787"
                    />
                  </div>
                </div>

                <div className="panel-muted-block rounded-[14px] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                  <div><strong className="text-[var(--win-text)]">Allowed hosts:</strong> {query.data.allowedHosts.length ? query.data.allowedHosts.join(', ') : '—'}</div>
                  <div><strong className="text-[var(--win-text)]">Origins aktif:</strong> {query.data.allowedOrigins.length ? query.data.allowedOrigins.join(', ') : '—'}</div>
                </div>

                <div className="flex justify-end">
                  <button
                    id="settings-panel-port-save"
                    type="button"
                    onClick={handleUpdatePanelPort}
                    disabled={panelPortMutation.isPending || !panelPort.trim()}
                    className="panel-btn panel-btn--primary rounded-xl px-[18px] py-2.5 text-[13px]"
                  >
                    {panelPortMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Waypoints size={14} />}
                    {panelPortMutation.isPending ? 'Mengubah port...' : 'Simpan port'}
                  </button>
                </div>
              </div>
            </div>

            <div className="panel-shell-card p-5">
              <SectionHeader
                icon={<ShieldCheck size={17} />}
                title="Allowed origins"
                subtitle="Editor bebas: satu origin per baris, lalu simpan seperti file teks"
              />

              <div className="space-y-3.5">
                <div className="panel-muted-block rounded-[16px] p-3">
                  <textarea
                    id="settings-allowed-origins"
                    value={allowedOriginsText}
                    onChange={(event) => setAllowedOriginsText(event.target.value)}
                    spellCheck={false}
                    className="panel-textarea panel-input--mono min-h-[220px] rounded-[12px] px-4 py-3 text-[12px] leading-6"
                    placeholder={'http://127.0.0.1:80\nhttp://panel.domain.local:80'}
                  />
                </div>

                <div className="panel-empty min-h-[92px] rounded-[14px] px-4 py-3 text-[12px] leading-6">
                  <span>
                    Tips: gunakan satu origin per baris. Contoh <code className="panel-mono text-[11px] text-[var(--win-text)]">http://127.0.0.1:80</code> atau <code className="panel-mono text-[11px] text-[var(--win-text)]">https://panel.example.com:443</code>.
                  </span>
                </div>

                <div className="flex justify-end">
                  <button
                    id="settings-panel-origins-save"
                    type="button"
                    onClick={handleUpdateOrigins}
                    disabled={panelOriginsMutation.isPending}
                    className="panel-btn panel-btn--primary rounded-xl px-[18px] py-2.5 text-[13px]"
                  >
                    {panelOriginsMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    {panelOriginsMutation.isPending ? 'Menyimpan origin...' : 'Simpan origins'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-shell-card p-5">
            <SectionHeader icon={<Database size={17} />} title="Database MariaDB" subtitle="Status koneksi dan manajemen password runtime" />

            <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <div className="panel-muted-block px-4 py-3.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Connection</div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${databaseQuery.data?.status.connected ? 'bg-[var(--panel-success-text)]' : 'bg-[var(--panel-danger-text)]'}`} />
                  <span className="text-[13px] font-semibold text-[var(--win-text)]">
                    {databaseQuery.data?.status.connected ? 'Connected' : databaseQuery.data?.status.enabled ? 'Unavailable' : 'Disabled'}
                  </span>
                </div>
                <div className="break-all text-[11px] leading-5 text-[var(--text-secondary)]">
                  {databaseQuery.data?.status.connected
                    ? `${databaseQuery.data.status.user}@${databaseQuery.data.status.host}:${databaseQuery.data.status.port}`
                    : databaseQuery.data?.status.lastError || '—'}
                </div>
              </div>

              <div className="panel-muted-block px-4 py-3.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Rows</div>
                <div className="mb-1 text-[13px] font-semibold text-[var(--win-text)]">
                  {databaseQuery.data
                    ? `${databaseQuery.data.status.runtimeLogCount} logs • ${databaseQuery.data.status.changelogCount} changelog`
                    : '—'}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Audit: {databaseQuery.data?.status.settingsAuditCount ?? 0} rows
                </div>
              </div>
            </div>

            <div className="panel-muted-block rounded-[14px] px-4 py-3.5">
              <div className={`flex flex-wrap items-center justify-between gap-3 ${dbResetResult ? 'mb-3' : ''}`}>
                <div>
                  <div className="mb-0.5 text-[13px] font-semibold text-[var(--win-text)]">Reset password database</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Buat password MariaDB baru dan perbarui runtime env.</div>
                </div>

                <div className="flex gap-2">
                  <button
                    id="settings-db-refresh"
                    type="button"
                    onClick={() => void databaseQuery.refetch()}
                    className="panel-btn panel-btn--ghost rounded-[10px] px-3.5 py-2 text-[12px]"
                  >
                    <RefreshCcw size={13} className={databaseQuery.isFetching ? 'animate-spin' : ''} />
                    Refresh
                  </button>

                  <button
                    id="settings-db-reset-password"
                    type="button"
                    onClick={handleResetDatabase}
                    disabled={resetDatabaseMutation.isPending || !databaseQuery.data?.status.enabled}
                    className="panel-btn panel-btn--primary rounded-[10px] px-3.5 py-2 text-[12px]"
                  >
                    {resetDatabaseMutation.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Database size={13} />}
                    {resetDatabaseMutation.isPending ? 'Resetting...' : 'Reset password'}
                  </button>
                </div>
              </div>

              {dbResetResult ? (
                <div className="panel-shell-card border-[color:var(--panel-success-border)] bg-[color:var(--panel-success-bg)] px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--panel-success-text)]">Password baru</div>
                      <code className="panel-mono break-all text-[13px] font-semibold text-[var(--panel-success-text)]">{dbResetResult.password}</code>
                    </div>
                    <button
                      id="settings-db-copy-password"
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(dbResetResult.password)}
                      className="panel-btn panel-btn--ghost rounded-[10px] px-3.5 py-[7px] text-[12px]"
                    >
                      <Copy size={13} />
                      Copy
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel-shell-card p-5">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <SectionHeader icon={<Clock size={17} />} title="Audit trail" subtitle="Histori perubahan settings yang tersimpan di database" />
              <div className="panel-badge panel-badge--info">
                {databaseQuery.data?.settingsAudit.length ?? 0} entries
              </div>
            </div>

            {databaseQuery.data?.settingsAudit.length ? (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {databaseQuery.data.settingsAudit.slice(0, 6).map((entry) => (
                  <AuditCard
                    key={entry.id}
                    username={entry.username}
                    createdAt={entry.createdAt}
                    hostname={entry.hostname}
                    timezone={entry.timezone}
                    nameservers={entry.nameservers}
                  />
                ))}
              </div>
            ) : (
              <div className="panel-empty min-h-[120px] text-[12px]">
                <span>Belum ada audit yang tersimpan. Perubahan settings akan tercatat di sini.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
