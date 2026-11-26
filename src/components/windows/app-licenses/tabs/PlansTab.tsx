import { Boxes } from 'lucide-react'
import { type AppLicensePlan } from '@/api/appLicenses'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ListTable, ListRowIcon, ListState } from '@/components/ui/ListTable'
import { ViewModeToggle, type ViewMode } from '@/components/ui/ViewModeToggle'
import { useI18n } from '@/lib/i18n'
import { formatFeatureBadge, formatFeatureLabels, indexLabel } from './licenseFormatters'

interface PlansTabProps {
  plans: AppLicensePlan[]
  loading: boolean
  error: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  isMobile: boolean
  orderPending: boolean
  onCreatePlan: () => void
  onOrderPlan: (plan: AppLicensePlan) => void
  onEditPlan: (plan: AppLicensePlan) => void
  onDeletePlan: (plan: AppLicensePlan) => void
}

export function PlansTab({
  plans,
  loading,
  error,
  viewMode,
  onViewModeChange,
  isMobile,
  orderPending,
  onCreatePlan,
  onOrderPlan,
  onEditPlan,
  onDeletePlan,
}: PlansTabProps) {
  const { t } = useI18n()

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-4 space-y-3 overflow-hidden">
      {/* Subheader bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-[var(--win-text)]">
              Paket Langganan Reneo CRM Services
            </h3>
            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
              reneo-crm
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Tarif resmi lisensi untuk integrasi WAHA, bot WhatsApp, dan kapasitas kontak CRM.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 ml-auto shrink-0">
          <ViewModeToggle mode={viewMode} onChange={onViewModeChange} isMobile={isMobile} />
          <Button variant="primary" onClick={onCreatePlan}>
            Tambah Paket Tarif
          </Button>
        </div>
      </div>

      {/* Plans Content (Card vs List) */}
      {viewMode === 'grid' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ListState
            loading={loading}
            error={error}
            errorTitle="Gagal memuat paket tarif"
            errorHint="Periksa koneksi database atau coba segarkan kembali."
            loadingText="Memuat paket langganan aplikasi..."
            empty={plans.length === 0}
            emptyIcon={<Boxes size={28} />}
            emptyTitle="Belum ada paket tarif"
            emptyHint="Klik tombol 'Tambah Paket Tarif' untuk mendaftarkan tier harga baru."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-lg border p-4 flex flex-col justify-between transition-colors bg-[var(--panel-surface)] ${
                    p.highlighted
                      ? 'border-[var(--panel-primary-text)]/50 ring-1 ring-[var(--panel-primary-text)]/20'
                      : 'border-[var(--win-border)] hover:border-[var(--panel-primary-text)]/40'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] block mb-0.5">
                          {p.period === 'annual' ? 'Paket Tahunan' : 'Paket Bulanan'}
                        </span>
                        <h4 className="text-base font-bold text-[var(--win-text)]">{p.name}</h4>
                      </div>
                      {p.highlighted && (
                        <Badge tone="primary" size="sm">
                          Paling Populer
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed min-h-[36px]">
                      {p.tagline}
                    </p>

                    <div className="pt-1 space-y-1">
                      {Number(p.originalPriceAmount || 0) > p.priceAmount && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="line-through text-xs text-[var(--text-secondary)] tabular-nums">
                            Rp {Number(p.originalPriceAmount).toLocaleString('id-ID')}
                          </span>
                          <Badge tone="danger" size="sm">
                            Hemat{' '}
                            {p.discountPercent && p.discountPercent > 0
                              ? p.discountPercent
                              : Math.round(
                                  ((Number(p.originalPriceAmount) - p.priceAmount) /
                                    Number(p.originalPriceAmount)) *
                                    100
                                )}
                            %
                          </Badge>
                        </div>
                      )}
                      <div className="text-xl font-bold text-[var(--panel-primary-text)] tabular-nums">
                        Rp {p.priceAmount.toLocaleString('id-ID')}
                        <span className="text-xs font-normal text-[var(--text-secondary)]">
                          {' '}
                          / {p.period === 'annual' ? 'tahun' : 'bulan'}
                        </span>
                      </div>
                      {p.promoValidUntil && (
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Promo s/d {p.promoValidUntil}
                        </div>
                      )}
                    </div>

                    {/* Feature list */}
                    <ul className="border-t border-[var(--win-border)] pt-3 space-y-1.5 text-xs">
                      {p.features && Object.keys(p.features).length > 0 ? (
                        Object.entries(p.features).map(([k, v]) => {
                          const label = formatFeatureBadge(k, v)
                          if (!label) return null
                          return (
                            <li key={k} className="text-[var(--win-text)]">
                              · {label}
                            </li>
                          )
                        })
                      ) : (
                        <li className="text-[11px] text-[var(--text-secondary)]">Fitur Standar</li>
                      )}
                    </ul>
                  </div>

                  <div className="pt-4 mt-3 border-t border-[var(--win-border)] flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant={p.highlighted ? 'primary' : 'outline'}
                      block
                      loading={orderPending}
                      onClick={() => onOrderPlan(p)}
                      className="flex-1"
                    >
                      Pesan &amp; Invoice
                    </Button>
                    <ActionMenu
                      label={t('common.moreActions')}
                      size="sm"
                      variant="outline"
                      items={[
                        {
                          key: 'edit',
                          label: 'Edit Paket',
                          onSelect: () => onEditPlan(p),
                        },
                        {
                          key: 'delete',
                          label: 'Hapus Paket',
                          tone: 'danger',
                          onSelect: () => onDeletePlan(p),
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ListState>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col">
          <ListTable
            variant="app-plans"
            empty={loading || error || plans.length === 0}
            columns={[
              { label: '#' },
              { label: 'Nama Paket' },
              { label: 'Tarif' },
              { label: 'Durasi' },
              { label: 'Fitur & Kuota' },
              { label: 'Status' },
              { label: 'Aksi', actions: true },
            ]}
          >
            <ListState
              loading={loading}
              error={error}
              errorTitle="Gagal memuat paket tarif"
              errorHint="Periksa koneksi database atau coba segarkan kembali."
              loadingText="Memuat paket langganan aplikasi..."
              empty={plans.length === 0}
              emptyIcon={<Boxes size={28} />}
              emptyTitle="Belum ada paket tarif"
              emptyHint="Klik tombol 'Tambah Paket Tarif' untuk mendaftarkan tier harga baru."
            >
              {plans.map((p, index) => {
                const featureLabels = formatFeatureLabels(p.features)

                return (
                  <div className="docker-row" key={p.id}>
                    <div className="docker-row__num">{indexLabel(index)}</div>

                    <div className="docker-row__app">
                      <ListRowIcon>
                        <Boxes className="h-3.5 w-3.5 text-[var(--panel-primary-text)]" />
                      </ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-app-name" title={p.name}>
                          {p.name}
                          {p.highlighted && (
                            <Badge tone="primary" size="sm" className="ml-1.5">
                              Paling Populer
                            </Badge>
                          )}
                        </span>
                        <span className="docker-row__sub" title={p.tagline}>
                          {p.tagline || p.slug}
                        </span>
                        <span className="docker-row__meta">
                          {`Rp ${p.priceAmount.toLocaleString('id-ID')} / ${p.period === 'annual' ? 'thn' : 'bln'} · ${p.period === 'annual' ? '12 Bln' : `${p.months || 1} Bln`}`}
                        </span>
                      </div>
                    </div>

                    <div className="docker-cell docker-cell--mono font-semibold">
                      <div className="flex flex-col">
                        {Number(p.originalPriceAmount || 0) > p.priceAmount && (
                          <span className="line-through text-[10px] font-normal text-[var(--text-secondary)]">
                            Rp {Number(p.originalPriceAmount).toLocaleString('id-ID')}
                          </span>
                        )}
                        <span>
                          Rp {p.priceAmount.toLocaleString('id-ID')}
                          <span className="text-[10px] font-normal text-[var(--text-secondary)]">
                            {' '}
                            / {p.period === 'annual' ? 'thn' : 'bln'}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="docker-cell text-xs">
                      {p.period === 'annual' ? '12 Bulan (Tahunan)' : `${p.months || 1} Bulan`}
                    </div>

                    <div className="docker-cell">
                      <span className="text-[11.5px] text-[var(--text-secondary)] truncate">
                        {featureLabels.length > 0 ? featureLabels.join(' · ') : 'Fitur Standar'}
                      </span>
                    </div>

                    <div className="docker-cell--keep">
                      <Badge tone="success" dot size="sm">
                        Tersedia
                      </Badge>
                    </div>

                    <div className="docker-action-btns">
                      <Button
                        size="sm"
                        variant={p.highlighted ? 'primary' : 'outline'}
                        loading={orderPending}
                        onClick={() => onOrderPlan(p)}
                      >
                        Pesan &amp; Invoice
                      </Button>
                      <ActionMenu
                        label={t('common.moreActions')}
                        size="sm"
                        variant="outline"
                        items={[
                          {
                            key: 'edit',
                            label: 'Edit Paket',
                            onSelect: () => onEditPlan(p),
                          },
                          {
                            key: 'delete',
                            label: 'Hapus Paket',
                            tone: 'danger',
                            onSelect: () => onDeletePlan(p),
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
      )}
    </div>
  )
}
