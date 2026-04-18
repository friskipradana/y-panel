import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCFConfig, setCFConfig, verifyCFConfig, deleteCFConfig } from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import {
  Cloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  ShieldCheck,
  User,
  LockKeyhole,
  Globe2,
} from 'lucide-react'

const CF_STATUS_VARIANTS = {
  active: { cls: 'panel-badge panel-badge--success', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Verified' },
  invalid: { cls: 'panel-badge panel-badge--danger', icon: <XCircle className="h-3 w-3" />, label: 'Invalid' },
  unconfigured: { cls: 'panel-badge panel-badge--warning', icon: <AlertTriangle className="h-3 w-3" />, label: 'Unverified' },
} as const

export default function ProfileWindow() {
  const qc = useQueryClient()
  const [cfForm, setCfForm] = useState({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
  const [showToken, setShowToken] = useState(false)

  const { data: cf, isLoading: cfLoading } = useQuery({ queryKey: ['cf-config'], queryFn: getCFConfig })

  const saveCFMut = useMutation({
    mutationFn: setCFConfig,
    onSuccess: () => {
      alertLib.fire('Cloudflare Disimpan', 'Konfigurasi Cloudflare berhasil disimpan untuk akun Anda.', 'success', 'profile')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
      setCfForm({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal menyimpan config'
      toast.error('Gagal menyimpan config', { description: message })
      alertLib.fire('Gagal Menyimpan Cloudflare', message, 'error', 'profile')
    },
  })

  const verifyMut = useMutation({
    mutationFn: verifyCFConfig,
    onSuccess: (res) => {
      if (res.valid) {
        alertLib.fire('Verifikasi Berhasil', 'Token Cloudflare valid dan siap digunakan.', 'success', 'profile')
      } else {
        alertLib.fire('Token Tidak Valid', res.error ?? 'Unknown error', 'warning', 'profile')
      }
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
    },
    onError: () => {
      toast.error('Gagal memverifikasi token')
      alertLib.fire('Gagal Verifikasi', 'Gagal memverifikasi token Cloudflare.', 'error', 'profile')
    },
  })

  const deleteCFMut = useMutation({
    mutationFn: deleteCFConfig,
    onSuccess: () => {
      alertLib.fire('Cloudflare Dihapus', 'Konfigurasi Cloudflare berhasil dihapus.', 'success', 'profile')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
    },
    onError: (e: any) => alertLib.fire('Gagal Menghapus Cloudflare', e.response?.data?.error ?? 'Tidak dapat menghapus konfigurasi Cloudflare.', 'error', 'profile'),
  })

  const cfStatus = cf?.status
  const cfStatusBadge = CF_STATUS_VARIANTS[cfStatus as keyof typeof CF_STATUS_VARIANTS] ?? CF_STATUS_VARIANTS.unconfigured

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <User className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Profile Settings & Integrations</div>
            <div className="panel-window__meta">Pengaturan akun dan integrasi personal</div>
          </div>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4">
          <section className="panel-card p-6">
            <div className="panel-badge panel-badge--info mb-3 w-fit uppercase tracking-[0.16em]">
              <ShieldCheck size={11} />
              Personal profile controls
            </div>
            <div className="text-[22px] font-bold tracking-[-0.03em] text-[var(--win-text)]">Profile window difokuskan untuk pengaturan akun</div>
            <p className="mt-2 max-w-[640px] text-[12px] leading-6 text-[var(--text-secondary)]">
              Identitas utama akun sekarang berada di profile header. Window ini dipakai untuk mengelola integrasi personal, credential pihak ketiga, dan konfigurasi yang melekat ke akun Anda.
            </p>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="panel-card p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="panel-avatar">
                  <Cloud className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[var(--win-text)]">Cloudflare tunnel integration</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                    Hubungkan akun Cloudflare Anda sendiri untuk membuat tunnel dan mengelola DNS secara personal.
                  </div>
                </div>
              </div>

              {cfLoading ? (
                <div className="py-10 text-center text-[13px] text-[var(--text-secondary)]">Memuat konfigurasi Cloudflare...</div>
              ) : cf?.configured ? (
                <div className="space-y-4">
                  <div className="panel-card flex items-center justify-between gap-3 px-4 py-3 shadow-none">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">Connection status</div>
                      <div className="mt-1 text-[14px] font-semibold text-[var(--win-text)]">Cloudflare account connected</div>
                    </div>
                    <span className={cfStatusBadge.cls}>
                      {cfStatusBadge.icon}
                      {cfStatusBadge.label}
                    </span>
                  </div>

                  <div className="panel-muted-block space-y-2 rounded-[16px] p-4">
                    {[
                      { label: 'Account ID', value: cf.accountId },
                      { label: 'Zone ID', value: cf.zoneId },
                      { label: 'Base Domain', value: cf.baseDomain },
                      cf.verifiedAt ? { label: 'Verified At', value: new Date(cf.verifiedAt).toLocaleString('id-ID') } : null,
                    ].filter(Boolean).map((item) => (
                      <div key={item!.label} className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
                        <span className="text-[var(--text-secondary)]">{item!.label}</span>
                        <span className="panel-mono text-[var(--win-text)]">{item!.value || '—'}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => verifyMut.mutate()}
                      disabled={verifyMut.isPending}
                      className="panel-btn panel-btn--primary-soft flex-1"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {verifyMut.isPending ? 'Memverifikasi...' : 'Verifikasi token'}
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await alertLib.confirm(
                          'Hapus Konfigurasi Cloudflare?',
                          'Konfigurasi Cloudflare untuk akun ini akan dihapus. Tunnel yang sudah ada tidak akan terpengaruh.',
                          'Hapus Konfigurasi',
                          'Batal',
                          'warning',
                          'profile',
                        )
                        if (confirmed) deleteCFMut.mutate()
                      }}
                      className="panel-icon-btn panel-icon-btn--danger h-[42px] w-[42px] rounded-[14px] border border-[var(--win-border)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="panel-section-label">API Token *</label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder="Paste Cloudflare API Token di sini"
                        value={cfForm.apiToken}
                        onChange={(e) => setCfForm((f) => ({ ...f, apiToken: e.target.value }))}
                        className="panel-input panel-input--mono pr-10"
                      />
                      <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--win-text)]">
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {[
                    { key: 'accountId', label: 'Account ID *', placeholder: 'abc123...' },
                    { key: 'zoneId', label: 'Zone ID (opsional)', placeholder: 'Jika punya domain Cloudflare' },
                    { key: 'baseDomain', label: 'Base Domain (opsional)', placeholder: 'example.com' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="panel-section-label">{label}</label>
                      <input
                        value={(cfForm as any)[key]}
                        onChange={(e) => setCfForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="panel-input panel-input--mono"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => saveCFMut.mutate(cfForm)}
                    disabled={saveCFMut.isPending || !cfForm.apiToken || !cfForm.accountId}
                    className="panel-btn panel-btn--primary w-full"
                  >
                    {saveCFMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                    {saveCFMut.isPending ? 'Menyimpan...' : 'Simpan & hubungkan'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="panel-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  <div className="panel-avatar">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--win-text)]">Keamanan token</div>
                    <div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Credential integrasi disimpan secara aman untuk setiap akun.</div>
                  </div>
                </div>
                <div className="panel-muted-block rounded-[16px] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                  Token Cloudflare dienkripsi dengan AES-256-GCM sebelum disimpan ke database. Token tidak pernah dikirim ke layanan selain Cloudflare API saat proses verifikasi dan provisioning.
                </div>
              </div>

              <div className="panel-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  <div className="panel-avatar">
                    <Globe2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--win-text)]">Hubungan dengan window lain</div>
                    <div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Konfigurasi di sini dipakai langsung oleh modul tunnel.</div>
                  </div>
                </div>
                <ul className="space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                  <li className="panel-muted-block rounded-[14px] px-4 py-3">Tunnels akan membaca status verifikasi Cloudflare dari konfigurasi akun Anda.</li>
                  <li className="panel-muted-block rounded-[14px] px-4 py-3">Jika token belum valid, tombol pembuatan tunnel akan tetap nonaktif sampai integrasi berhasil diverifikasi.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
