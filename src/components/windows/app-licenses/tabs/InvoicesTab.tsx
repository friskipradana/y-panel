import { ReceiptText } from 'lucide-react'
import { type AppLicenseOrder } from '@/api/appLicenses'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ListTable, ListRowIcon, ListState } from '@/components/ui/ListTable'
import { ViewModeToggle, type ViewMode } from '@/components/ui/ViewModeToggle'
import { useI18n } from '@/lib/i18n'
import { indexLabel } from './licenseFormatters'

interface InvoicesTabProps {
  orders: AppLicenseOrder[]
  loading: boolean
  error: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  isMobile: boolean
  onSelectOrder: (order: AppLicenseOrder) => void
  onCancelOrder: (order: AppLicenseOrder) => void
}

export function InvoicesTab({
  orders,
  loading,
  error,
  viewMode,
  onViewModeChange,
  isMobile,
  onSelectOrder,
  onCancelOrder,
}: InvoicesTabProps) {
  const { t } = useI18n()

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-4 space-y-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-[var(--win-text)]">
            Daftar Tagihan & Invoice Lisensi
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Semua invoice pesanan lisensi aplikasi yang diterbitkan untuk akun ini.
          </p>
        </div>

        <div className="ml-auto shrink-0">
          <ViewModeToggle mode={viewMode} onChange={onViewModeChange} isMobile={isMobile} />
        </div>
      </div>

      {/* Invoices Content (Card vs List) */}
      {viewMode === 'grid' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ListState
            loading={loading}
            error={error}
            errorTitle="Gagal memuat invoice"
            errorHint="Periksa koneksi database atau coba segarkan kembali."
            loadingText="Memuat riwayat invoice..."
            empty={orders.length === 0}
            emptyIcon={<ReceiptText size={28} />}
            emptyTitle="Belum ada invoice yang diterbitkan"
            emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk menerbitkan pesanan pertama."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-4">
              {orders.map((ord) => {
                const isPaid = ord.status === 'paid'
                const isCancelled = ord.status === 'cancelled'
                const isPending = ord.status === 'pending'
                return (
                  <div
                    key={ord.id}
                    className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] hover:border-[var(--panel-primary-text)]/40 transition-colors p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-[var(--win-text)] block">
                            {ord.invoiceNumber}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {ord.buyerName || 'Pelanggan'} · {ord.paymentMethod?.toUpperCase()}
                          </span>
                        </div>
                        {isPaid ? (
                          <Badge tone="success" dot size="sm">
                            Lunas
                          </Badge>
                        ) : isCancelled ? (
                          <Badge tone="neutral" dot size="sm">
                            Dibatalkan
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot size="sm">
                            Menunggu Bayar
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-[var(--win-text)]">
                        <span className="font-semibold">{ord.appName}</span> - {ord.planName} ({ord.months} Bulan)
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">Total Tagihan:</span>
                        <span className="font-mono text-sm font-bold text-[var(--win-text)]">
                          Rp {ord.amountTotal.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--win-border)] flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isPending && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onSelectOrder(ord)}
                          >
                            Bayar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSelectOrder(ord)}
                        >
                          Invoice
                        </Button>
                        {isPending && (
                          <ActionMenu
                            label={t('common.moreActions')}
                            size="sm"
                            variant="outline"
                            items={[
                              {
                                key: 'cancel',
                                label: 'Batalkan Invoice',
                                tone: 'danger',
                                onSelect: () => onCancelOrder(ord),
                              },
                            ]}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ListState>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col">
          <ListTable
            variant="app-orders"
            empty={loading || error || orders.length === 0}
            columns={[
              { label: '#' },
              { label: 'Nomor Invoice' },
              { label: 'Paket Aplikasi' },
              { label: 'Total Tagihan' },
              { label: 'Status' },
              { label: 'Waktu Terbit' },
              { label: 'Aksi', actions: true },
            ]}
          >
            <ListState
              loading={loading}
              error={error}
              errorTitle="Gagal memuat invoice"
              errorHint="Periksa koneksi database atau coba segarkan kembali."
              loadingText="Memuat riwayat invoice..."
              empty={orders.length === 0}
              emptyIcon={<ReceiptText size={28} />}
              emptyTitle="Belum ada invoice yang diterbitkan"
              emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk menerbitkan pesanan pertama."
            >
              {orders.map((ord, index) => {
                const isPaid = ord.status === 'paid'
                const isCancelled = ord.status === 'cancelled'
                const isPending = ord.status === 'pending'
                return (
                  <div className="docker-row" key={ord.id}>
                    <div className="docker-row__num">{indexLabel(index)}</div>

                    <div className="docker-row__app">
                      <ListRowIcon>
                        <ReceiptText className="h-3.5 w-3.5 text-[var(--panel-primary-text)]" />
                      </ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-app-name docker-app-name--mono">
                          {ord.invoiceNumber}
                        </span>
                        <span className="docker-row__sub">
                          {ord.buyerName || 'Pelanggan'} · {ord.paymentMethod?.toUpperCase()}
                        </span>
                        <span className="docker-row__meta">
                          {`${ord.planName} (${ord.months} Bln) · Rp ${ord.amountTotal.toLocaleString('id-ID')}`}
                        </span>
                      </div>
                    </div>

                    <div className="docker-cell text-xs">
                      <span className="font-medium text-[var(--win-text)]">{ord.planName}</span>
                      <span className="text-[11px] text-[var(--text-secondary)] block">
                        ({ord.months} Bulan)
                      </span>
                    </div>

                    <div className="docker-cell docker-cell--mono font-semibold text-[var(--win-text)]">
                      Rp {ord.amountTotal.toLocaleString('id-ID')}
                    </div>

                    <div className="docker-cell--keep">
                      {isPaid ? (
                        <Badge tone="success" dot size="sm">
                          Lunas
                        </Badge>
                      ) : isCancelled ? (
                        <Badge tone="neutral" dot size="sm">
                          Dibatalkan
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot size="sm">
                          Menunggu Bayar
                        </Badge>
                      )}
                    </div>

                    <div className="docker-cell text-[11px] text-[var(--text-secondary)]">
                      {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    <div className="docker-action-btns">
                      {isPending && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onSelectOrder(ord)}
                        >
                          Bayar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectOrder(ord)}
                      >
                        Invoice
                      </Button>
                      {isPending && (
                        <ActionMenu
                          label={t('common.moreActions')}
                          size="sm"
                          variant="outline"
                          items={[
                            {
                              key: 'cancel',
                              label: 'Batalkan Invoice',
                              tone: 'danger',
                              onSelect: () => onCancelOrder(ord),
                            },
                          ]}
                        />
                      )}
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
