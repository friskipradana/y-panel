import { Check, Copy, KeyRound } from 'lucide-react'
import { type AppLicense } from '@/api/appLicenses'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ListState } from '@/components/ui/ListTable'
import { useI18n } from '@/lib/i18n'
import { formatFeatureLabels } from './licenseFormatters'

interface LicensesGridViewProps {
  licenses: AppLicense[]
  loading: boolean
  error: boolean
  copiedKey: string | null
  onCopyKey: (key: string) => void
  onRenew: (lic: AppLicense) => void
  onOpenApp: (lic: AppLicense) => void
  onOpenIntegration: (lic: AppLicense) => void
  onToggleSuspend: (lic: AppLicense) => void
  onEdit: (lic: AppLicense) => void
  onDelete: (lic: AppLicense) => void
}

export function LicensesGridView({
  licenses,
  loading,
  error,
  copiedKey,
  onCopyKey,
  onRenew,
  onOpenApp,
  onOpenIntegration,
  onToggleSuspend,
  onEdit,
  onDelete,
}: LicensesGridViewProps) {
  const { t } = useI18n()

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <ListState
        loading={loading}
        error={error}
        errorTitle="Gagal memuat lisensi"
        errorHint="Periksa koneksi database atau coba segarkan kembali."
        loadingText="Memuat lisensi aplikasi..."
        empty={licenses.length === 0}
        emptyIcon={<KeyRound size={28} />}
        emptyTitle="Belum ada lisensi aplikasi"
        emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk membuat lisensi Reneo CRM."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-4">
          {licenses.map((lic) => {
            const isSuspended = lic.status === 'SUSPENDED'
            const isExpired = !isSuspended && (lic.isExpired || lic.status === 'EXPIRED')
            const isLocked = isSuspended || isExpired
            const progressPct = Math.min(100, Math.max(0, (lic.daysLeft / 30) * 100))
            const featureLabels = formatFeatureLabels(lic.features)

            return (
              <div
                key={lic.id}
                className={`rounded-lg border p-4 flex flex-col justify-between transition-colors bg-[var(--panel-surface)] gap-3 ${
                  isLocked
                    ? 'border-[var(--panel-danger-text)]/35'
                    : 'border-[var(--win-border)] hover:border-[var(--panel-primary-text)]/40'
                }`}
              >
                <div className="space-y-3">
                  {/* Header Identity */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-bold text-[var(--win-text)] truncate">
                          {lic.appName}
                        </h3>
                        {lic.catalogId && lic.catalogId !== lic.appName ? (
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] shrink-0">
                            {lic.catalogId}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Paket: <span className="font-medium text-[var(--win-text)]">{lic.planName}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSuspended ? (
                        <Badge tone="danger" dot size="sm">
                          Disuspend
                        </Badge>
                      ) : isExpired ? (
                        <Badge tone="danger" dot size="sm">
                          Kedaluwarsa
                        </Badge>
                      ) : lic.status === 'TRIAL' ? (
                        <Badge tone="warning" dot size="sm">
                          Trial ({lic.daysLeft}h)
                        </Badge>
                      ) : (
                        <Badge tone="success" dot size="sm">
                          Aktif ({lic.daysLeft}h)
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Key Bar */}
                  <div className="px-2.5 py-2 rounded-lg bg-[var(--win-bg)] border border-[var(--win-border)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                        Key:
                      </span>
                      <span className="font-mono text-xs font-semibold text-[var(--panel-primary-text)] truncate">
                        {lic.licenseKey}
                      </span>
                    </div>
                    <IconButton
                      label="Salin Key"
                      size="sm"
                      onClick={() => onCopyKey(lic.licenseKey)}
                      className="shrink-0"
                    >
                      {copiedKey === lic.licenseKey ? (
                        <Check size={13} className="text-[var(--panel-success-text)]" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </IconButton>
                  </div>

                  {/* Meta Details */}
                  <div className="grid grid-cols-2 gap-3 text-xs pt-0.5">
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-[var(--text-secondary)]">Tarif Langganan</span>
                      <div className="font-semibold text-sm text-[var(--win-text)] tabular-nums">
                        Rp {lic.priceAmount?.toLocaleString('id-ID')}
                        <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                          {' '}
                          / {lic.period === 'annual' ? 'tahun' : 'bulan'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-[var(--text-secondary)]">Masa Berlaku</span>
                      <div className="font-medium text-xs text-[var(--win-text)]">
                        Hingga{' '}
                        {new Date(lic.expiresAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="w-full bg-[var(--win-bg)] border border-[var(--win-border)] rounded-full h-1.5 mt-1 overflow-hidden">
                        <div
                          className={`h-full ${
                            isExpired
                              ? 'bg-[var(--panel-danger-text)]'
                              : lic.daysLeft < 7
                                ? 'bg-[var(--panel-warning-text)]'
                                : 'bg-[var(--panel-success-text)]'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-0.5 pt-0.5">
                    <span className="text-[11px] text-[var(--text-secondary)]">Fitur Terkoneksi</span>
                    <p className="text-[11.5px] leading-relaxed text-[var(--win-text)]">
                      {featureLabels.length > 0 ? featureLabels.join(' · ') : 'Fitur Standar'}
                    </p>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-2 border-t border-[var(--win-border)] flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onRenew(lic)}
                  >
                    Perpanjang
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenApp(lic)}
                    >
                      Buka
                    </Button>
                    <ActionMenu
                      label={t('common.moreActions')}
                      size="sm"
                      variant="outline"
                      items={[
                        {
                          key: 'api',
                          label: 'Integrasi API',
                          onSelect: () => onOpenIntegration(lic),
                        },
                        {
                          key: 'toggle-suspend',
                          label: isSuspended ? 'Aktifkan Lisensi' : 'Suspend Lisensi',
                          tone: isSuspended ? 'primary' : 'warning',
                          onSelect: () => onToggleSuspend(lic),
                        },
                        {
                          key: 'edit',
                          label: 'Edit Lisensi',
                          dividerBefore: true,
                          onSelect: () => onEdit(lic),
                        },
                        {
                          key: 'delete',
                          label: 'Hapus Lisensi',
                          tone: 'danger',
                          onSelect: () => onDelete(lic),
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ListState>
    </div>
  )
}
