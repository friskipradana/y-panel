import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTunnels,
  createTunnel,
  updateTunnel,
  deleteTunnel,
  getCFConfig,
  getCFZones,
  type Tunnel,
} from '@/api/agent'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'
import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import {
  Network,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Pencil,
  RefreshCcw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { variant: string; label: string }> = {
  active: { variant: 'panel-status--success', label: 'Active' },
  creating: { variant: 'panel-status--warning', label: 'Creating...' },
  pending: { variant: 'panel-status--warning', label: 'Pending' },
  error: { variant: 'panel-status--danger', label: 'Error' },
  inactive: { variant: 'panel-status--neutral', label: 'Inactive' },
}

const PAGE_SIZE = 8

function buildTunnelFormFromTunnel(t: Tunnel, cfZones: { id: string; name: string }[]) {
  let protocol = 'http'
  let ip = 'localhost'
  let port = '3000'
  let path = ''
  try {
    const u = new URL(t.targetUrl)
    protocol = u.protocol.replace(':', '')
    const hostParts = u.host.split(':')
    ip = hostParts[0] || 'localhost'
    port = hostParts[1] || (protocol === 'https' ? '443' : '80')
    path = u.pathname === '/' ? '' : u.pathname
  } catch {}

  let subdomain = ''
  let domain = ''
  let zoneId = ''
  if (t.cfHostname) {
    const zone = cfZones.find((z) => t.cfHostname.endsWith(z.name))
    if (zone) {
      zoneId = zone.id
      domain = zone.name
      if (t.cfHostname !== zone.name) {
        subdomain = t.cfHostname.slice(0, -(zone.name.length + 1))
      }
    } else {
      const parts = t.cfHostname.split('.')
      if (parts.length > 2) {
        subdomain = parts[0]
        domain = parts.slice(1).join('.')
      } else {
        domain = t.cfHostname
      }
    }
  }

  return {
    name: t.name,
    subdomain,
    domain,
    zoneId,
    path,
    protocol,
    ip,
    port,
  }
}

export default function TunnelsWindow() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingTunnelId, setEditingTunnelId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState({ name: '', subdomain: '', domain: '', zoneId: '', path: '', protocol: 'http', ip: 'localhost', port: '3000' })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tunnels', { search, offset }],
    queryFn: () => listTunnels({ q: search, limit: PAGE_SIZE, offset }),
    refetchInterval: 8_000,
  })

  const tunnels = data?.items ?? []
  const total = data?.total ?? 0
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeCount = useMemo(() => tunnels.filter((tunnel) => tunnel.status === 'active').length, [tunnels])

  const { data: cfConfig } = useQuery({
    queryKey: ['cf-config'],
    queryFn: getCFConfig,
  })

  const { data: cfZones = [] } = useQuery({
    queryKey: ['cf-zones'],
    queryFn: getCFZones,
    enabled: !!cfConfig?.configured && cfConfig.status === 'active',
  })

  const createMut = useMutation({
    mutationFn: createTunnel,
    onSuccess: (res) => {
      alertLib.fire('Rute Tunnel Diproses', res.message ?? 'Rute sedang ditambahkan ke Tunnel.', 'info', 'tunnels')
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      setShowCreate(false)
      setForm({ name: '', subdomain: '', domain: '', zoneId: '', path: '', protocol: 'http', ip: 'localhost', port: '3000' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal membuat rute tunnel'
      toast.error('Gagal membuat rute', { description: message })
      alertLib.fire('Gagal Membuat Rute', message, 'error', 'tunnels')
    },
  })

  const updateMut = useMutation({
    mutationFn: (payload: any) => updateTunnel(editingTunnelId!, payload),
    onSuccess: (res) => {
      alertLib.fire('Rute Diperbarui', res.message ?? 'Rute berhasil diperbarui.', 'success', 'tunnels')
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      setShowCreate(false)
      setEditingTunnelId(null)
      setForm({ name: '', subdomain: '', domain: '', zoneId: '', path: '', protocol: 'http', ip: 'localhost', port: '3000' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal memperbarui rute'
      toast.error('Gagal memperbarui rute', { description: message })
      alertLib.fire('Gagal Memperbarui Rute', message, 'error', 'tunnels')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteTunnel,
    onSuccess: () => {
      alertLib.fire('Tunnel Dihapus', 'Tunnel berhasil dihapus dari sistem.', 'success', 'tunnels')
      qc.invalidateQueries({ queryKey: ['tunnels'] })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal menghapus tunnel'
      toast.error('Gagal menghapus tunnel', { description: message })
      alertLib.fire('Gagal Menghapus Tunnel', message, 'error', 'tunnels')
    },
  })

  const syncMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTunnel>[1] }) => updateTunnel(id, payload),
    onSuccess: (res) => {
      toast.success('Tunnel berhasil disinkronkan', { description: res.message ?? 'Konfigurasi tunnel aktif berhasil di-apply ulang.' })
      qc.invalidateQueries({ queryKey: ['tunnels'] })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal menyinkronkan tunnel'
      toast.error('Gagal sync tunnel', { description: message })
      alertLib.fire('Gagal Sync Tunnel', message, 'error', 'tunnels')
    },
  })

  const cfNotConfigured = !cfConfig?.configured || cfConfig?.status !== 'active'
  const zoneOptions = useMemo(
    () => cfZones.map((zone) => ({ value: zone.id, label: zone.name })),
    [cfZones],
  )
  const protocolOptions = useMemo(
    () => [
      { value: 'http', label: 'http://' },
      { value: 'https', label: 'https://' },
    ],
    [],
  )

  const handleEdit = (t: Tunnel) => {
    setForm(buildTunnelFormFromTunnel(t, cfZones))
    setEditingTunnelId(t.id)
    setShowCreate(true)
  }

  const handleSync = async (t: Tunnel) => {
    const payload = buildTunnelFormFromTunnel(t, cfZones)
    syncMut.mutate({ id: t.id, payload })
  }

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Network className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Cloudflare Tunnels</div>
            <div className="panel-window__meta">{total} tunnel terindeks • {activeCount} aktif di halaman ini</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button onClick={() => refetch()} className="panel-icon-btn" aria-label="Refresh tunnels">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingTunnelId(null)
              setForm({ name: '', subdomain: '', domain: '', zoneId: '', path: '', protocol: 'http', ip: 'localhost', port: '3000' })
              setShowCreate(true)
            }}
            disabled={cfNotConfigured}
            title={cfNotConfigured ? 'Konfigurasi Cloudflare terlebih dahulu di Profile' : 'Buat Tunnel'}
            className="panel-btn panel-btn--primary-soft disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            Buat Tunnel
          </button>
        </div>
      </div>

      {cfNotConfigured && (
        <div className="px-4 pt-3">
          <div className="panel-alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Cloudflare belum dikonfigurasi. Buka <strong>Profile → Cloudflare</strong> untuk menambahkan API token dan membuat tunnel.
            </span>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 520px)' }}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <Network className="panel-window__icon h-4 w-4" />
              {editingTunnelId ? 'Edit Rute Tunnel' : 'Rute Tunnel Baru'}
            </h3>
            <p className="mb-4 text-xs leading-6 text-[var(--text-secondary)]">
              Satu Tunnel Cloudflare utama akan digunakan untuk mengelola semua rute Anda.
            </p>
            <div className="space-y-4">
              <div>
                <label className="panel-section-label">Nama Rute *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="my-api-route" className="panel-input" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="panel-section-label">Subdomain</label>
                  <input value={form.subdomain} onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value }))} placeholder="api (opsional)" className="panel-input" />
                </div>
                <div>
                  <label className="panel-section-label">Domain (Zone) *</label>
                  <PanelSelectMenu
                    id="tunnel-zone-select"
                    value={form.zoneId}
                    onChange={(nextValue) => {
                      const selected = cfZones.find((zone) => zone.id === nextValue)
                      setForm((current) => ({ ...current, zoneId: nextValue, domain: selected?.name || '' }))
                    }}
                    options={zoneOptions}
                    placeholder="-- Pilih Domain --"
                    searchable
                    searchPlaceholder="Cari domain..."
                  />

                </div>
              </div>

              <div>
                <label className="panel-section-label">Path (opsional)</label>
                <input value={form.path} onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} placeholder="/api/v1" className="panel-input" />
              </div>

              <div>
                <label className="panel-section-label">Target URL *</label>
                <div className="flex items-center gap-2">
                  <PanelSelectMenu
                    id="tunnel-protocol-select"
                    value={form.protocol}
                    onChange={(nextValue) => setForm((current) => ({ ...current, protocol: nextValue }))}
                    options={protocolOptions}
                    className="w-28 shrink-0"
                    buttonClassName="!w-28 shrink-0"
                    dropdownClassName="min-w-[9rem]"
                    searchable
                    searchPlaceholder="Cari protokol..."
                  />

                  <input value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} placeholder="localhost" className="panel-input flex-1 min-w-0" />
                  <span className="text-[var(--text-secondary)] font-bold">:</span>
                  <input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} placeholder="3000" className="panel-input !w-24 shrink-0" />
                </div>
              </div>

              <div className="panel-muted-block p-3 text-xs leading-6">
                Rute akan ditambahkan ke Tunnel utama Anda dan Cloudflare DNS akan diupdate secara otomatis.
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="panel-btn panel-btn--ghost flex-1">Batal</button>
              <button onClick={() => editingTunnelId ? updateMut.mutate(form) : createMut.mutate(form)} disabled={createMut.isPending || updateMut.isPending || !form.name || !form.zoneId || !form.ip || !form.port} className="panel-btn panel-btn--primary flex-1">
                {createMut.isPending || updateMut.isPending ? 'Menyimpan...' : 'Simpan Rute'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <div className="panel-table-container">
            <div className="panel-toolbar panel-toolbar--search">
              <form
                className="panel-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  setOffset(0)
                  setSearch(query.trim())
                }}
              >
                <Search className="h-4 w-4" />
                <input id="tunnels-search-input" value={query} onChange={(e) => setQuery(e.target.value)} className="panel-search__input" placeholder="Cari nama tunnel, hostname, target URL, atau status..." />
                <button type="submit" className="panel-btn panel-btn--primary-soft">Cari</button>
              </form>
              <div className="panel-pagination-summary">Halaman {currentPage}/{totalPages}</div>
            </div>

            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat tunnels...</div>
            ) : tunnels.length === 0 ? (
              <div className="panel-empty">
                <Network className="h-8 w-8" />
                <span>Belum ada tunnel yang cocok dengan pencarian saat ini.</span>
              </div>
            ) : (
              <>
                {tunnels.map((t) => (
                  <TunnelCard
                    key={t.id}
                    tunnel={t}
                    onEdit={() => handleEdit(t)}
                    onDelete={async () => {
                      const confirmed = await alertLib.confirm(
                        'Hapus Tunnel?',
                        `Tunnel <strong>${t.name}</strong> beserta DNS Cloudflare terkait akan dihapus.`,
                        'Hapus Tunnel',
                        'Batal',
                        'warning',
                        'tunnels',
                      )
                      if (confirmed) deleteMut.mutate(t.id)
                    }}
                    onSync={() => handleSync(t)}
                    isSyncing={syncMut.isPending && syncMut.variables?.id === t.id}
                  />
                ))}
              </>
            )}

            <div className="panel-pagination">
              <button id="tunnels-prev-page" className="panel-btn panel-btn--ghost" disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Sebelumnya
              </button>
              <button id="tunnels-next-page" className="panel-btn panel-btn--ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
                Berikutnya
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TunnelCard({
  tunnel: t,
  onEdit,
  onDelete,
  onSync,
  isSyncing,
}: {
  tunnel: Tunnel
  onEdit: () => void
  onDelete: () => void
  onSync: () => void
  isSyncing: boolean
}) {
  const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.inactive

  const copyHostname = async () => {
    if (!t.cfHostname) return
    const url = `https://${t.cfHostname}`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!copied) throw new Error('Clipboard API tidak tersedia')
      } else {
        throw new Error('Clipboard API tidak tersedia')
      }
      alertLib.fire('Hostname Tersalin', `Domain <strong>${t.cfHostname}</strong> berhasil disalin ke clipboard.`, 'success', 'tunnels')
    } catch {
      alertLib.fire('Gagal Menyalin Hostname', 'Clipboard tidak tersedia pada environment ini.', 'error', 'tunnels')
    }
  }

  return (
    <div className="panel-table-row group">
      {/* Left: name + status */}
      <div className="tunnel-flat-row__main">
        <div className="tunnel-flat-row__name-row">
          <span className="tunnel-flat-row__name">{t.name}</span>
          <span className={`panel-badge ${sc.variant}`}>
            <div className="panel-status-dot" />
            {sc.label}
          </span>
          {t.status === 'active' && (
            <span className="panel-badge panel-badge--success">
              <CheckCircle2 className="h-3 w-3" />
              Live
            </span>
          )}
          {t.status === 'creating' && (
            <span className="panel-badge panel-badge--warning">
              <Clock className="h-3 w-3 animate-spin" />
              Provisioning
            </span>
          )}
        </div>
        <div className="tunnel-flat-row__meta">
          {t.cfHostname ? (
            <>
              <span className="tunnel-flat-row__hostname">{t.cfHostname}</span>
              <button onClick={copyHostname} className="panel-icon-btn h-5 w-5" title="Salin hostname">
                <Copy className="h-3 w-3" />
              </button>
              <a href={`https://${t.cfHostname}`} target="_blank" rel="noopener noreferrer" className="panel-icon-btn h-5 w-5 hover:text-[var(--panel-info-text)]" title="Buka di browser">
                <ExternalLink className="h-3 w-3" />
              </a>
              <span className="tunnel-flat-row__arrow">→</span>
              <span className="tunnel-flat-row__target">{t.targetUrl}</span>
            </>
          ) : (
            <>
              <span className="tunnel-flat-row__pending">hostname pending...</span>
              <span className="tunnel-flat-row__arrow">→</span>
              <span className="tunnel-flat-row__target">{t.targetUrl}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="tunnel-flat-row__actions">
        {t.status === 'active' && (
          <button onClick={onSync} disabled={isSyncing} className="panel-icon-btn panel-icon-btn--primary" title="Sync tunnel">
            <RefreshCcw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button onClick={onEdit} className="panel-icon-btn opacity-0 group-hover:opacity-100 transition-opacity" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="panel-icon-btn panel-icon-btn--danger opacity-0 group-hover:opacity-100 transition-opacity" title="Hapus">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
