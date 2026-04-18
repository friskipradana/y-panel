import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTunnels,
  createTunnel,
  deleteTunnel,
  getCFConfig,
  type Tunnel,
} from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import {
  Network,
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { variant: string; label: string }> = {
  active: { variant: 'panel-status--success', label: 'Active' },
  creating: { variant: 'panel-status--warning', label: 'Creating...' },
  pending: { variant: 'panel-status--warning', label: 'Pending' },
  error: { variant: 'panel-status--danger', label: 'Error' },
  inactive: { variant: 'panel-status--neutral', label: 'Inactive' },
}

export default function TunnelsWindow() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', targetUrl: '' })

  const { data: tunnels = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tunnels'],
    queryFn: listTunnels,
    refetchInterval: 8_000,
  })

  const { data: cfConfig } = useQuery({
    queryKey: ['cf-config'],
    queryFn: getCFConfig,
  })

  const createMut = useMutation({
    mutationFn: createTunnel,
    onSuccess: (res) => {
      alertLib.fire('Tunnel Diproses', res.message ?? 'Tunnel sedang dibuat secara async.', 'info', 'tunnels')
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      setShowCreate(false)
      setForm({ name: '', targetUrl: '' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal membuat tunnel'
      toast.error('Gagal membuat tunnel', { description: message })
      alertLib.fire('Gagal Membuat Tunnel', message, 'error', 'tunnels')
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

  const cfNotConfigured = !cfConfig?.configured || cfConfig?.status !== 'active'

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Network className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Cloudflare Tunnels</div>
            <div className="panel-window__meta">{tunnels.length} tunnel tercatat</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button
            onClick={() => refetch()}
            className="panel-icon-btn"
            aria-label="Refresh tunnels"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
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
          <div className="panel-modal-card" style={{ width: 'min(100%, 420px)' }}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <Network className="panel-window__icon h-4 w-4" />
              Tunnel Baru
            </h3>
            <p className="mb-4 text-xs leading-6 text-[var(--text-secondary)]">
              Tunnel akan terhubung ke domain <strong>{cfConfig?.baseDomain ?? 'domain anda'}</strong> secara otomatis.
            </p>
            <div className="space-y-3">
              <div>
                <label className="panel-section-label">Nama Tunnel *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="my-api-tunnel"
                  className="panel-input"
                />
              </div>
              <div>
                <label className="panel-section-label">Target URL *</label>
                <input
                  value={form.targetUrl}
                  onChange={(e) => setForm((f) => ({ ...f, targetUrl: e.target.value }))}
                  placeholder="http://localhost:3000"
                  className="panel-input panel-input--mono"
                />
              </div>
              <div className="panel-muted-block p-3 text-xs leading-6">
                Tunnel akan dibuat secara async. Cek status dalam beberapa detik setelah submit.
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="panel-btn panel-btn--ghost flex-1"
              >
                Batal
              </button>
              <button
                onClick={() => createMut.mutate({ name: form.name, targetUrl: form.targetUrl })}
                disabled={createMut.isPending || !form.name || !form.targetUrl}
                className="panel-btn panel-btn--primary flex-1"
              >
                {createMut.isPending ? 'Membuat...' : 'Buat Tunnel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat tunnels...</div>
        ) : tunnels.length === 0 ? (
          <div className="panel-empty">
            <Network className="h-8 w-8" />
            <span>Belum ada tunnel aktif.</span>
          </div>
        ) : (
          <div className="panel-window__stack">
            {tunnels.map((t) => (
              <TunnelCard
                key={t.id}
                tunnel={t}
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TunnelCard({ tunnel: t, onDelete }: { tunnel: Tunnel; onDelete: () => void }) {
  const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.inactive

  const copyHostname = () => {
    if (t.cfHostname) {
      navigator.clipboard.writeText(`https://${t.cfHostname}`)
      toast.success('URL disalin!')
    }
  }

  return (
    <div className="panel-card panel-card--interactive group p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="panel-avatar">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--win-text)]">{t.name}</span>
              <div className={`panel-badge ${sc.variant}`}>
                <div className="panel-status-dot" />
                <span>{sc.label}</span>
              </div>
            </div>
            <div className="panel-meta-line mt-0.5 flex items-center gap-1.5 panel-mono">
              {t.cfHostname ? (
                <>
                  <span>{t.cfHostname}</span>
                  <button onClick={copyHostname} className="panel-icon-btn h-6 w-6">
                    <Copy className="h-3 w-3" />
                  </button>
                  <a href={`https://${t.cfHostname}`} target="_blank" rel="noopener noreferrer" className="panel-icon-btn h-6 w-6 hover:text-[var(--panel-info-text)]">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <span className="italic opacity-80">hostname pending...</span>
              )}
            </div>
            <div className="panel-meta-line mt-0.5 panel-mono">→ {t.targetUrl}</div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {t.status === 'active' && (
            <div className="panel-badge panel-badge--success">
              <CheckCircle2 className="h-3 w-3" />
              <span>Live</span>
            </div>
          )}
          {t.status === 'creating' && (
            <div className="panel-badge panel-badge--warning">
              <Clock className="h-3 w-3 animate-spin" />
              <span>Provisioning</span>
            </div>
          )}
          <button
            onClick={onDelete}
            className="panel-icon-btn panel-icon-btn--danger ml-1 opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {t.cfTunnelId && <div className="panel-meta-line mt-2.5 pl-[52px] panel-mono">{t.cfTunnelId}</div>}
    </div>
  )
}
