import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCFConfig, setCFConfig, verifyCFConfig, deleteCFConfig } from '@/api/agent'
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

const cardClass = 'rounded-[20px] border border-[var(--win-border)] bg-[var(--win-bg)] p-5 shadow-[var(--win-shadow)] backdrop-blur-xl'
const inputClass = 'w-full rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.03)] px-3.5 py-2.5 text-[13px] text-[var(--win-text)] outline-none transition placeholder-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.04)] focus:border-orange-400 font-mono'

export default function ProfileWindow() {
  const qc = useQueryClient()
  const [cfForm, setCfForm] = useState({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
  const [showToken, setShowToken] = useState(false)

  const { data: cf, isLoading: cfLoading } = useQuery({ queryKey: ['cf-config'], queryFn: getCFConfig })

  const saveCFMut = useMutation({
    mutationFn: setCFConfig,
    onSuccess: () => {
      toast.success('Konfigurasi Cloudflare disimpan')
      qc.invalidateQueries({ queryKey: ['cf-config'] })
      qc.invalidateQueries({ queryKey: ['me-v2'] })
      setCfForm({ apiToken: '', accountId: '', zoneId: '', baseDomain: '' })
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
    },
  })

  const cfStatus = cf?.status
  const cfStatusBadge = {
    active: { cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Verified' },
    invalid: { cls: 'bg-red-500/12 text-red-600 dark:text-red-300', icon: <XCircle className="h-3 w-3" />, label: 'Invalid' },
    unconfigured: { cls: 'bg-amber-500/12 text-amber-600 dark:text-amber-300', icon: <AlertTriangle className="h-3 w-3" />, label: 'Unverified' },
  }[cfStatus ?? 'unconfigured']

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--win-bg)] text-[var(--win-text)] select-none">
      <div className="border-b border-[var(--win-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold">Profile Settings & Integrations</span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 p-5">
        <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(124,58,237,0.16),rgba(59,130,246,0.14))] px-6 py-5 shadow-[0_20px_48px_rgba(15,23,42,0.12)] ring-1 ring-[var(--win-border)]">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.35)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--win-text)] dark:bg-[rgba(255,255,255,0.08)]">
            <ShieldCheck size={11} />
            Personal profile controls
          </div>
          <div className="text-[22px] font-bold tracking-[-0.03em] text-[var(--win-text)]">Profile window difokuskan untuk pengaturan akun</div>
          <p className="mt-2 max-w-[640px] text-[12px] leading-6 text-[var(--text-secondary)]">
            Identitas utama akun sekarang berada di profile header. Window ini dipakai untuk mengelola integrasi personal, credential pihak ketiga, dan konfigurasi yang melekat ke akun Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className={cardClass}>
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(249,115,22,0.18),rgba(251,146,60,0.16))] text-orange-500 dark:text-orange-300">
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
                    { label: 'Zone ID', value: cf.zoneId },
                    { label: 'Base Domain', value: cf.baseDomain },
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
                  { key: 'zoneId', label: 'Zone ID (opsional)', placeholder: 'Jika punya domain Cloudflare' },
                  { key: 'baseDomain', label: 'Base Domain (opsional)', placeholder: 'example.com' },
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

          <div className="flex flex-col gap-4">
            <div className={cardClass}>
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(99,102,241,0.12))] text-sky-600 dark:text-sky-300">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[var(--win-text)]">Keamanan token</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Credential integrasi disimpan secara aman untuk setiap akun.</div>
                </div>
              </div>
              <div className="rounded-[16px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.03)]">
                Token Cloudflare dienkripsi dengan AES-256-GCM sebelum disimpan ke database. Token tidak pernah dikirim ke layanan selain Cloudflare API saat proses verifikasi dan provisioning.
              </div>
            </div>

            <div className={cardClass}>
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(34,197,94,0.12))] text-emerald-600 dark:text-emerald-300">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[var(--win-text)]">Hubungan dengan window lain</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Konfigurasi di sini dipakai langsung oleh modul tunnel.</div>
                </div>
              </div>
              <ul className="space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                <li className="rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] px-4 py-3 dark:bg-[rgba(255,255,255,0.03)]">Tunnels akan membaca status verifikasi Cloudflare dari konfigurasi akun Anda.</li>
                <li className="rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] px-4 py-3 dark:bg-[rgba(255,255,255,0.03)]">Jika token belum valid, tombol pembuatan tunnel akan tetap nonaktif sampai integrasi berhasil diverifikasi.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
