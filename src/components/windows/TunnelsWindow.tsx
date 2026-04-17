import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTunnels,
  createTunnel,
  deleteTunnel,
  getCFConfig,
  type Tunnel,
} from '@/api/agent'
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

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  active: { color: 'text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-500', label: 'Active' },
  creating: { color: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-500 animate-pulse', label: 'Creating...' },
  pending: { color: 'text-yellow-600 dark:text-yellow-300', dot: 'bg-yellow-500 animate-pulse', label: 'Pending' },
  error: { color: 'text-red-600 dark:text-red-300', dot: 'bg-red-500', label: 'Error' },
  inactive: { color: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400', label: 'Inactive' },
}

const inputClass = 'w-full rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.03)] px-3.5 py-2.5 text-[13px] text-[var(--win-text)] outline-none transition placeholder-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.04)] focus:border-cyan-400'

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
      toast.success(res.message ?? 'Tunnel sedang dibuat...')
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      setShowCreate(false)
      setForm({ name: '', targetUrl: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal membuat tunnel'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTunnel,
    onSuccess: () => { toast.success('Tunnel dihapus'); qc.invalidateQueries({ queryKey: ['tunnels'] }) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal menghapus tunnel'),
  })

  const cfNotConfigured = !cfConfig?.configured || cfConfig?.status !== 'active'

  return (
    <div className="flex h-full flex-col bg-[var(--win-bg)] text-[var(--win-text)] select-none">
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-cyan-500" />
          <span className="text-sm font-semibold">Cloudflare Tunnels</span>
          <span className="ml-1 text-xs text-[var(--text-secondary)]">({tunnels.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[var(--win-text)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={cfNotConfigured}
            title={cfNotConfigured ? 'Konfigurasi Cloudflare terlebih dahulu di Profile' : 'Buat Tunnel'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/12 px-3 py-1.5 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-500/18 disabled:cursor-not-allowed disabled:opacity-40 dark:text-cyan-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Buat Tunnel
          </button>
        </div>
      </div>

      {cfNotConfigured && (
        <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-[16px] border border-amber-500/18 bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Cloudflare belum dikonfigurasi. Buka <strong>Profile → Cloudflare</strong> untuk menambahkan API token dan membuat tunnel.
          </span>
        </div>
      )}

      {showCreate && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-[420px] rounded-[24px] border border-[var(--win-border)] bg-[var(--win-bg)] p-6 shadow-[var(--win-shadow)]">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <Network className="h-4 w-4 text-cyan-500" />
              Tunnel Baru
            </h3>
            <p className="mb-4 text-xs leading-6 text-[var(--text-secondary)]">
              Tunnel akan terhubung ke domain <strong>{cfConfig?.baseDomain ?? 'domain anda'}</strong> secara otomatis.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Nama Tunnel *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="my-api-tunnel"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Target URL *</label>
                <input
                  value={form.targetUrl}
                  onChange={(e) => setForm((f) => ({ ...f, targetUrl: e.target.value }))}
                  placeholder="http://localhost:3000"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] p-3 text-xs leading-6 text-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.03)]">
                Tunnel akan dibuat secara async. Cek status dalam beberapa detik setelah submit.
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[var(--win-text)] dark:bg-[rgba(255,255,255,0.03)]"
              >
                Batal
              </button>
              <button
                onClick={() => createMut.mutate({ name: form.name, targetUrl: form.targetUrl })}
                disabled={createMut.isPending || !form.name || !form.targetUrl}
                className="flex-1 rounded-[14px] bg-[linear-gradient(135deg,#06b6d4,#3b82f6)] py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(6,182,212,0.22)] transition hover:brightness-105 disabled:opacity-50"
              >
                {createMut.isPending ? 'Membuat...' : 'Buat Tunnel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat tunnels...</div>
        ) : tunnels.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] text-sm text-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.03)]">
            <Network className="h-8 w-8 opacity-40" />
            <span>Belum ada tunnel aktif.</span>
          </div>
        ) : (
          tunnels.map((t) => (
            <TunnelCard
              key={t.id}
              tunnel={t}
              onDelete={() => {
                if (confirm(`Hapus tunnel "${t.name}"? Tunnel CF dan DNS akan ikut dihapus.`)) deleteMut.mutate(t.id)
              }}
            />
          ))
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
    <div className="group rounded-[18px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] p-4 transition-all hover:bg-[rgba(15,23,42,0.04)] dark:bg-[rgba(255,255,255,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(6,182,212,0.16),rgba(59,130,246,0.12))] text-cyan-600 dark:text-cyan-300">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--win-text)]">{t.name}</span>
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                <span className={`text-[10px] font-semibold ${sc.color}`}>{sc.label}</span>
              </div>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-[var(--text-secondary)]">
              {t.cfHostname ? (
                <>
                  <span>{t.cfHostname}</span>
                  <button onClick={copyHostname} className="text-[var(--text-secondary)] transition hover:text-[var(--win-text)]">
                    <Copy className="h-3 w-3" />
                  </button>
                  <a href={`https://${t.cfHostname}`} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] transition hover:text-cyan-500 dark:hover:text-cyan-300">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <span className="italic text-[var(--text-secondary)] opacity-80">hostname pending...</span>
              )}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-secondary)]">→ {t.targetUrl}</div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {t.status === 'active' && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              <span>Live</span>
            </div>
          )}
          {t.status === 'creating' && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-300">
              <Clock className="h-3 w-3 animate-spin" />
              <span>Provisioning</span>
            </div>
          )}
          <button
            onClick={onDelete}
            className="ml-1 rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {t.cfTunnelId && <div className="mt-2.5 pl-[52px] font-mono text-[10px] text-[var(--text-secondary)]">{t.cfTunnelId}</div>}
    </div>
  )
}
