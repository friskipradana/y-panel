import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck, ChevronDown, Copy, Database, Globe2,
  LoaderCircle, LockKeyhole, Plus, RefreshCcw, Save, Server,
  ShieldCheck, Sparkles, Trash2, Clock, CheckCircle2, Waypoints,
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

const cardClass = 'panel-shell-card p-5 shadow-[var(--win-shadow)] backdrop-blur-xl'
const inputClass = 'panel-input h-[42px] px-3.5 text-[13px]'
const inputMonoClass = `${inputClass} panel-input--mono text-[12px]`
const softIconClass = 'panel-muted-block flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl text-[var(--win-text)]'

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
  { label: 'Cloudflare', value: '1.1.1.1', tone: 'bg-orange-500' },
  { label: '1.0.0.1', value: '1.0.0.1', tone: 'bg-orange-500' },
  { label: 'Google', value: '8.8.8.8', tone: 'bg-emerald-500' },
  { label: '8.8.4.4', value: '8.8.4.4', tone: 'bg-emerald-500' },
  { label: 'Quad9', value: '9.9.9.9', tone: 'bg-violet-500' },
  { label: 'OpenDNS', value: '208.67.222.222', tone: 'bg-sky-500' },
]

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(
    () => TIMEZONES.filter((tz) => tz.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${inputClass} flex items-center justify-between text-left cursor-pointer`}
      >
        <span className={value ? 'text-[13px] text-slate-900' : 'text-[13px] text-slate-400'}>
          {value || 'Pilih timezone...'}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-[9999] overflow-hidden rounded-[14px] border border-[var(--win-border)] bg-[var(--win-bg)] shadow-[var(--win-shadow)]">
          <div className="border-b border-slate-200/80 p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari timezone..."
              className="h-[34px] w-full rounded-xl border border-slate-300/90 bg-slate-50 px-3 text-[12px] text-slate-900 outline-none transition focus:border-blue-400"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-3 text-[12px] text-slate-400">Tidak ditemukan</div>
            ) : (
              filtered.map((tz) => {
                const active = tz === value
                return (
                  <button
                    key={tz}
                    type="button"
                    onClick={() => {
                      onChange(tz)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={[
                      'block w-full px-3.5 py-2 text-left text-[12px] transition',
                      active
                        ? 'bg-blue-600/8 font-semibold text-blue-700'
                        : 'text-slate-900 hover:bg-slate-900/4',
                    ].join(' ')}
                  >
                    {tz}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DnsEditor({ nameservers, onChange }: { nameservers: string[]; onChange: (v: string[]) => void }) {
  const [newEntry, setNewEntry] = useState('')

  const addEntry = () => {
    const val = newEntry.trim()
    if (!val || nameservers.includes(val)) return
    onChange([...nameservers, val])
    setNewEntry('')
  }

  const removeEntry = (idx: number) => onChange(nameservers.filter((_, i) => i !== idx))
  const addPreset = (ip: string) => {
    if (!nameservers.includes(ip)) onChange([...nameservers, ip])
  }

  return (
    <div className="flex flex-col gap-1.5">
      {nameservers.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-slate-300/80 bg-slate-50/90 px-3.5 py-2.5 text-center text-[12px] text-slate-400">
          Belum ada nameserver — tambah dari preset atau secara manual
        </div>
      )}

      {nameservers.map((ns, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <div className="flex h-10 flex-1 items-center gap-2.5 rounded-[10px] border border-slate-300/80 bg-slate-50 px-3.5">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <code className="flex-1 font-mono text-[12px] text-slate-900 break-all">{ns}</code>
          </div>
          <button
            type="button"
            onClick={() => removeEntry(idx)}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-red-500/20 bg-red-50 text-red-500 transition hover:bg-red-100"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <div className="mt-1 flex gap-1.5">
        <input
          value={newEntry}
          onChange={(e) => setNewEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addEntry()
            }
          }}
          placeholder="Tambah IP DNS (cth: 1.1.1.1)"
          className={`${inputMonoClass} flex-1 h-10`}
        />
        <button
          type="button"
          onClick={addEntry}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#0f172a,#2563eb)] text-white transition hover:brightness-110"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {PRESET_DNS.map((p) => {
          const active = nameservers.includes(p.value)
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => addPreset(p.value)}
              disabled={active}
              className={[
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                active
                  ? 'cursor-default border-blue-600/20 bg-blue-600/8 text-blue-700'
                  : 'border-slate-900/10 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-blue-700' : p.tone}`} />
              {p.label} <code className="font-mono text-[10px]">({p.value})</code>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-slate-600">{label}</span>
      {hint && <span className="font-mono text-[10px] text-slate-400">{hint}</span>}
    </div>
  )
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className={softIconClass}>{icon}</div>
      <div>
        <div className="text-[14px] font-bold text-slate-800">{title}</div>
        <div className="mt-0.5 text-[11px] leading-5 text-slate-400">{subtitle}</div>
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
    nameservers: nameservers.map((v) => v.trim()).filter(Boolean),
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
    onError: (err: any) => {
      alertLib.fire('Gagal Menyimpan', err?.message || 'Gagal menyimpan settings host.', 'error', 'settings')
    }
  })

  const panelPortMutation = useMutation({
    mutationFn: updatePanelPort,
    onSuccess: (data) => {
      alertLib.fire('Port Diperbarui', 'Port panel berhasil diubah dan daemon telah di-restart otomatis.', 'success', 'settings')
      syncSettingsSnapshot(data)
    },
    onError: (err: any) => {
      alertLib.fire('Gagal Mengubah Port', err?.message || 'Gagal memperbarui port panel.', 'error', 'settings')
    }
  })

  const panelOriginsMutation = useMutation({
    mutationFn: updatePanelOrigins,
    onSuccess: (data) => {
      alertLib.fire('Origins Disimpan', 'Allowed origins CORS berhasil diperbarui.', 'success', 'settings')
      syncSettingsSnapshot(data)
    },
    onError: (err: any) => {
      alertLib.fire('Gagal Menyimpan', err?.message || 'Gagal memperbarui allowed origins.', 'error', 'settings')
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
    onError: (err: any) => {
      alertLib.fire('Gagal Merotasi', err?.message || 'Gagal merotasi password root database.', 'error', 'settings')
    }
  })

  const handleUpdateIdentity = async () => {
    const isConfirmed = await alertLib.confirm(
      'Simpan Identity Host?',
      `Perubahan Hostname, Timezone, dan pengaturan DNS (resolv.conf) akan langsung diterapkan secara daemon ke sistem operasi asli under-the-hood. Lanjutkan?`,
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
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 py-3">
      <div className="rounded-[22px] bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_60%,#312e81_100%)] px-7 py-[22px] text-white shadow-[0_20px_48px_rgba(15,23,42,0.20)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/75">
              <Sparkles size={11} />
              Runtime host controls
            </div>
            <div className="mb-1.5 text-[22px] font-bold tracking-[-0.03em]">Settings & Host Identity</div>
            <p className="max-w-[520px] text-[12px] leading-[1.6] text-white/65">
              Kelola hostname, timezone, dan DNS nameserver host Linux langsung dari panel.
            </p>
          </div>

          <div className="min-w-[220px] rounded-2xl border border-white/10 bg-white/8 px-[18px] py-[14px]">
            <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/45">Detected host</div>
            <div className="mb-1 text-[15px] font-semibold">{query.data.osName}</div>
            <div className="mb-2.5 text-[11px] text-white/60">Kernel {query.data.kernel}</div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
              <ShieldCheck size={12} />
              DNS: {query.data.dnsMode}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={cardClass}>
          <SectionHeader icon={<Server size={17} />} title="Identity" subtitle="Hostname dan timezone host Linux" />
          <div className="flex flex-col gap-3.5">
            <div>
              <FieldLabel label="Hostname" hint="hostnamectl" />
              <input
                id="settings-hostname"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className={inputClass}
                placeholder="node1-ubuntu"
              />
            </div>
            <div>
              <FieldLabel label="Timezone" hint="timedatectl" />
              <TimezoneSelect value={timezone} onChange={setTimezone} />
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <SectionHeader
            icon={<Globe2 size={17} />}
            title="DNS Nameservers"
            subtitle={`Mode aktif: ${query.data.dnsMode} • ${query.data.managedConfigPath}`}
          />
          <DnsEditor nameservers={nameservers} onChange={setNameservers} />
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(99,102,241,0.12))] text-slate-700">
              <BadgeCheck size={17} />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-slate-800">Simpan perubahan host</div>
              <div className="text-[11px] text-slate-400">Hostname, timezone, dan DNS nameserver akan diperbarui</div>
            </div>
          </div>

          <button
            id="settings-save"
            type="button"
            onClick={handleUpdateIdentity}
            disabled={mutation.isPending}
            className={[
              'inline-flex items-center gap-2 rounded-xl px-[22px] py-2.5 text-[13px] font-semibold text-white transition',
              mutation.isPending
                ? 'cursor-wait bg-slate-400'
                : 'bg-[linear-gradient(135deg,#0f172a,#2563eb)] shadow-[0_8px_24px_rgba(37,99,235,0.25)] hover:brightness-110',
            ].join(' ')}
          >
            {mutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
            {mutation.isPending ? 'Menyimpan...' : 'Simpan settings'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className={cardClass}>
          <SectionHeader
            icon={<LockKeyhole size={17} />}
            title="Runtime panel port"
            subtitle="Ubah port panel tanpa menyentuh editor origin secara manual"
          />

          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <FieldLabel label="Bind address aktif" hint="read only" />
                <input id="settings-bind-addr" value={query.data.bindAddr} readOnly className={`${inputMonoClass} opacity-80`} />
              </div>
              <div>
                <FieldLabel label="Port panel" hint="1-65535" />
                <input
                  id="settings-panel-port"
                  inputMode="numeric"
                  value={panelPort}
                  onChange={(e) => setPanelPort(e.target.value.replace(/[^0-9]/g, ''))}
                  className={inputMonoClass}
                  placeholder="8787"
                />
              </div>
            </div>

            <div className="rounded-[14px] border border-slate-200/80 bg-slate-50 px-4 py-3 text-[12px] leading-6 text-slate-600">
              <div><strong className="text-slate-800">Allowed hosts:</strong> {query.data.allowedHosts.length ? query.data.allowedHosts.join(', ') : '—'}</div>
              <div><strong className="text-slate-800">Origins aktif:</strong> {query.data.allowedOrigins.length ? query.data.allowedOrigins.join(', ') : '—'}</div>
            </div>

            <div className="flex justify-end">
              <button
                id="settings-panel-port-save"
                type="button"
                onClick={handleUpdatePanelPort}
                disabled={panelPortMutation.isPending || !panelPort.trim()}
                className={[
                  'inline-flex items-center gap-2 rounded-xl px-[18px] py-2.5 text-[13px] font-semibold text-white transition',
                  panelPortMutation.isPending || !panelPort.trim()
                    ? 'cursor-not-allowed bg-slate-400 opacity-70'
                    : 'bg-[linear-gradient(135deg,#312e81,#2563eb)] shadow-[0_8px_24px_rgba(49,46,129,0.22)] hover:brightness-110',
                ].join(' ')}
              >
                {panelPortMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Waypoints size={14} />}
                {panelPortMutation.isPending ? 'Mengubah port...' : 'Simpan port'}
              </button>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <SectionHeader
            icon={<ShieldCheck size={17} />}
            title="Allowed origins"
            subtitle="Editor bebas: satu origin per baris, lalu simpan seperti file teks"
          />

          <div className="space-y-3.5">
            <div className="rounded-[16px] border border-[var(--win-border)] bg-[linear-gradient(180deg,rgba(15,23,42,0.03),rgba(59,130,246,0.04))] p-3 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(99,102,241,0.04))]">
              <textarea
                id="settings-allowed-origins"
                value={allowedOriginsText}
                onChange={(e) => setAllowedOriginsText(e.target.value)}
                spellCheck={false}
                className="min-h-[220px] w-full resize-y rounded-[12px] border border-slate-300/90 bg-slate-950 px-4 py-3 font-mono text-[12px] leading-6 text-slate-100 outline-none transition focus:border-blue-400"
                placeholder={'http://127.0.0.1:80\nhttp://panel.domain.local:80'}
              />
            </div>

            <div className="rounded-[14px] border border-dashed border-slate-300/80 bg-slate-50 px-4 py-3 text-[12px] leading-6 text-slate-500">
              Tips: gunakan satu origin per baris. Contoh <code className="font-mono text-[11px] text-slate-700">http://127.0.0.1:80</code> atau <code className="font-mono text-[11px] text-slate-700">https://panel.example.com:443</code>.
            </div>

            <div className="flex justify-end">
              <button
                id="settings-panel-origins-save"
                onClick={handleUpdateOrigins}
                disabled={panelOriginsMutation.isPending}
                className={[
                  'inline-flex items-center gap-2 rounded-xl px-[18px] py-2.5 text-[13px] font-semibold text-white transition',
                  panelOriginsMutation.isPending
                    ? 'cursor-not-allowed bg-slate-400 opacity-70'
                    : 'bg-[linear-gradient(135deg,#0f172a,#0f766e)] shadow-[0_8px_24px_rgba(15,118,110,0.22)] hover:brightness-110',
                ].join(' ')}
              >
                {panelOriginsMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                {panelOriginsMutation.isPending ? 'Menyimpan origin...' : 'Simpan origins'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <SectionHeader icon={<Database size={17} />} title="Database MariaDB" subtitle="Status koneksi dan manajemen password runtime" />

        <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div className="rounded-[14px] border border-slate-200/80 bg-slate-50 px-4 py-3.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Connection</div>
            <div className="mb-1 flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${databaseQuery.data?.status.connected ? 'bg-emerald-500' : 'bg-red-400'}`} />
              <span className="text-[13px] font-semibold text-slate-800">
                {databaseQuery.data?.status.connected ? 'Connected' : databaseQuery.data?.status.enabled ? 'Unavailable' : 'Disabled'}
              </span>
            </div>
            <div className="break-all text-[11px] leading-5 text-slate-500">
              {databaseQuery.data?.status.connected
                ? `${databaseQuery.data.status.user}@${databaseQuery.data.status.host}:${databaseQuery.data.status.port}`
                : databaseQuery.data?.status.lastError || '—'}
            </div>
          </div>

          <div className="rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] dark:bg-[rgba(255,255,255,0.03)] px-4 py-3.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--tb-clock)] opacity-70">Rows</div>
            <div className="mb-1 text-[13px] font-semibold text-[var(--win-text)]">
              {databaseQuery.data
                ? `${databaseQuery.data.status.runtimeLogCount} logs • ${databaseQuery.data.status.changelogCount} changelog`
                : '—'}
            </div>
            <div className="text-[11px] text-slate-500">
              Audit: {databaseQuery.data?.status.settingsAuditCount ?? 0} rows
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-slate-400/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(99,102,241,0.05))] px-4 py-3.5">
          <div className={`flex flex-wrap items-center justify-between gap-3 ${dbResetResult ? 'mb-3' : ''}`}>
            <div>
              <div className="mb-0.5 text-[13px] font-semibold text-slate-800">Reset password database</div>
              <div className="text-[11px] text-slate-400">Buat password MariaDB baru dan perbarui runtime env</div>
            </div>

            <div className="flex gap-2">
              <button
                id="settings-db-refresh"
                type="button"
                onClick={() => void databaseQuery.refetch()}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-400/20 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCcw size={13} className={databaseQuery.isFetching ? 'animate-spin' : ''} />
                Refresh
              </button>

              <button
                id="settings-db-reset-password"
                type="button"
                onClick={handleResetDatabase}
                disabled={resetDatabaseMutation.isPending || !databaseQuery.data?.status.enabled}
                className={[
                  'inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12px] font-semibold text-white transition',
                  resetDatabaseMutation.isPending || !databaseQuery.data?.status.enabled
                    ? 'cursor-not-allowed bg-slate-400 opacity-55'
                    : 'bg-[linear-gradient(135deg,#7c3aed,#2563eb)] hover:brightness-110',
                ].join(' ')}
              >
                {resetDatabaseMutation.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Database size={13} />}
                {resetDatabaseMutation.isPending ? 'Resetting...' : 'Reset password'}
              </button>
            </div>
          </div>

          {dbResetResult && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/95 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Password baru</div>
                  <code className="break-all font-mono text-[13px] font-semibold text-emerald-800">{dbResetResult.password}</code>
                </div>
                <button
                  id="settings-db-copy-password"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(dbResetResult.password)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-500/20 bg-white px-3.5 py-[7px] text-[12px] font-semibold text-emerald-800 transition hover:bg-emerald-50"
                >
                  <Copy size={13} />
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <SectionHeader icon={<Clock size={17} />} title="Audit trail" subtitle="Histori perubahan settings yang tersimpan di database" />
          <div className="shrink-0 rounded-full bg-blue-600/8 px-3 py-1 text-[11px] font-semibold text-blue-700">
            {databaseQuery.data?.settingsAudit.length ?? 0} entries
          </div>
        </div>

        {databaseQuery.data?.settingsAudit.length ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {databaseQuery.data.settingsAudit.slice(0, 6).map((entry) => (
              <div key={entry.id} className="rounded-[14px] border border-[var(--win-border)] bg-[var(--win-bg)] shadow-[0_4px_16px_rgba(0,0,0,0.03)] px-4 py-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.10em] text-[var(--win-text)] opacity-60">
                  <span>{entry.username || 'system'}</span>
                  <span>•</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex flex-col gap-1 text-[12px] text-slate-700">
                  <div><strong className="text-slate-500">Host:</strong> {entry.hostname || '—'}</div>
                  <div><strong className="text-slate-500">TZ:</strong> {entry.timezone || '—'}</div>
                  <div><strong className="text-slate-500">DNS:</strong> {entry.nameservers.length ? entry.nameservers.join(', ') : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--win-border)] bg-[var(--win-bg)] px-4 py-4 text-center text-[12px] text-[var(--win-text)] opacity-60">
            Belum ada audit yang tersimpan. Perubahan settings akan tercatat di sini.
          </div>
        )}
      </div>
    </div>
  )
}
