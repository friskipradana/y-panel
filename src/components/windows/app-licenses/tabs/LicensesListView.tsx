import { Check, Copy, KeyRound } from 'lucide-react'
import { type AppLicense } from '@/api/appLicenses'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ListTable, ListRowIcon, ListState } from '@/components/ui/ListTable'
import { useI18n } from '@/lib/i18n'
import { formatFeatureLabels, indexLabel } from './licenseFormatters'

interface LicensesListViewProps {
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

export function LicensesListView({
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
}: LicensesListViewProps) {
  const { t } = useI18n()

  return (
    <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col">
      <ListTable
        variant="app-licenses"
        empty={loading || error || licenses.length === 0}
        columns={[
          { label: '#' },
          { label: 'Aplikasi & Paket' },
          { label: 'License Key' },
          { label: 'Tarif' },
          { label: 'Masa Berlaku' },
          { label: 'Fitur Terkoneksi' },
          { label: 'Aksi', actions: true },
        ]}
      >
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
          {licenses.map((lic, index) => {
            const isExpired = lic.isExpired || lic.status === 'EXPIRED'
            const featureLabels = formatFeatureLabels(lic.features)

            return (
              <div className="docker-row" key={lic.id}>
                <div className="docker-row__num">{indexLabel(index)}</div>

                <div className="docker-row__app">
                  <ListRowIcon>
                    <KeyRound className="h-3.5 w-3.5 text-[var(--panel-primary-text)]" />
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={lic.appName}>
                      {lic.appName}
                    </span>
                    <span className="docker-row__sub">
                      {lic.planName} · <span className="font-mono">{lic.catalogId}</span>
                    </span>
                    <span className="docker-row__meta">
                      {`${lic.licenseKey} · Rp ${lic.priceAmount?.toLocaleString('id-ID')}/${lic.period === 'annual' ? 'thn' : 'bln'}`}
                    </span>
                  </div>
                </div>

                <div className="docker-cell docker-cell--mono">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[var(--panel-primary-text)]">
                      {lic.licenseKey}
                    </span>
                    <IconButton
                      label="Salin License Key"
                      size="sm"
                      onClick={() => onCopyKey(lic.licenseKey)}
                    >
                      {copiedKey === lic.licenseKey ? (
                        <Check size={12} className="text-[var(--panel-success-text)]" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </IconButton>
                  </div>
                </div>

                <div className="docker-cell docker-cell--mono font-semibold">
                  Rp {lic.priceAmount?.toLocaleString('id-ID')}
                  <span className="text-[10px] font-normal text-[var(--text-secondary)]">
                    {' '}
                    / {lic.period === 'annual' ? 'thn' : 'bln'}
                  </span>
                </div>

                <div className="docker-cell docker-cell--keep space-y-1">
                  <div className="text-[11px] font-medium text-[var(--win-text)] hidden sm:block">
                    {new Date(lic.expiresAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                  <div>
                    {lic.status === 'SUSPENDED' ? (
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

                <div className="docker-cell">
                  <span className="text-[11.5px] text-[var(--text-secondary)] truncate">
                    {featureLabels.length > 0 ? featureLabels.join(' · ') : '-'}
                  </span>
                </div>

                <div className="docker-action-btns">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onRenew(lic)}
                  >
                    Perpanjang
                  </Button>
                  <ActionMenu
                    label={t('common.moreActions')}
                    size="sm"
                    variant="outline"
                    items={[
                      {
                        key: 'open',
                        label: 'Buka Aplikasi',
                        onSelect: () => onOpenApp(lic),
                      },
                      {
                        key: 'api',
                        label: 'Integrasi API',
                        onSelect: () => onOpenIntegration(lic),
                      },
                      {
                        key: 'toggle-suspend',
                        label: lic.status === 'SUSPENDED' ? 'Aktifkan Lisensi' : 'Suspend Lisensi',
                        tone: lic.status === 'SUSPENDED' ? 'primary' : 'warning',
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
            )
          })}
        </ListState>
      </ListTable>
    </div>
  )
}
