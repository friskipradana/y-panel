import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ReceiptText, XCircle } from 'lucide-react'
import { fetchAppLicenseOrderDetail, type AppLicenseOrder } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface InvoiceDetailModalProps {
  open: boolean
  order: AppLicenseOrder
  onClose: () => void
  onCancelOrder: (order: AppLicenseOrder) => void
  onPayOrder: (payload: { publicId: string; method: string }) => void
  cancelPending: boolean
  payPending: boolean
}

export function InvoiceDetailModal({
  open,
  order,
  onClose,
  onCancelOrder,
  onPayOrder,
  cancelPending,
  payPending,
}: InvoiceDetailModalProps) {
  const { data: orderDetail, isLoading: orderDetailLoading } = useQuery({
    queryKey: ['app-license-order-detail', order.publicId],
    queryFn: () => fetchAppLicenseOrderDetail(order.publicId),
    enabled: open && !!order.publicId && order.status === 'pending',
    staleTime: 30_000,
  })

  const activePaymentMethods = useMemo(
    () => (orderDetail?.paymentMethods ?? []).filter((m) => m.enabled !== false),
    [orderDetail]
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invoice ${order.invoiceNumber}`}
      subtitle={`${order.appName} · ${order.planName}`}
      icon={<ReceiptText className="text-[var(--panel-primary-text)]" size={20} />}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs">
            <span className="text-[var(--text-secondary)]">Total Tagihan:</span>
            <span className="panel-mono block font-bold text-base text-[var(--panel-primary-text)]">
              Rp {order.amountTotal.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Cetak
            </Button>
            {order.status === 'pending' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  loading={cancelPending}
                  onClick={() => onCancelOrder(order)}
                  className="text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-bg)]"
                >
                  Batalkan
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={payPending}
                  onClick={() => {
                    onPayOrder({
                      publicId: order.publicId,
                      method: order.paymentMethod || activePaymentMethods[0]?.id || 'transfer',
                    })
                  }}
                >
                  Konfirmasi Lunas
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                Tutup
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Status Banner */}
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between ${
            order.status === 'paid'
              ? 'bg-[var(--panel-success-bg)] border-[var(--panel-success-border)] text-[var(--panel-success-text)]'
              : order.status === 'cancelled'
                ? 'bg-[var(--win-bg)] border-[var(--win-border)] text-[var(--text-secondary)]'
                : 'bg-[var(--panel-warning-bg)] border-[var(--win-border)] text-[var(--panel-warning-text)]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {order.status === 'paid' ? (
              <CheckCircle2 size={18} />
            ) : order.status === 'cancelled' ? (
              <XCircle size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <div>
              <span className="font-bold block">
                {order.status === 'paid'
                  ? 'Lunas (Telah Dibayar)'
                  : order.status === 'cancelled'
                    ? 'Invoice Dibatalkan'
                    : 'Menunggu Pembayaran'}
              </span>
              <span className="text-[11px] opacity-80">
                {order.status === 'paid'
                  ? `Lisensi telah aktif sejak ${new Date(
                      order.paidAt || order.createdAt
                    ).toLocaleDateString('id-ID')}`
                  : order.status === 'cancelled'
                    ? 'Pesanan ini telah dibatalkan dan tidak perlu dibayar.'
                    : `Batas waktu pembayaran: ${new Date(
                        order.expiresAt
                      ).toLocaleDateString('id-ID')}`}
              </span>
            </div>
          </div>
          <span className="font-mono text-xs font-bold">{order.invoiceNumber}</span>
        </div>

        {/* Rincian Tagihan */}
        <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2.5">
          <h5 className="font-bold text-[var(--win-text)]">Rincian Pembelian:</h5>
          <div className="flex items-center justify-between text-[var(--win-text)]">
            <span>
              {order.appName} - {order.planName} ({order.months} Bulan)
            </span>
            <span className="panel-mono font-semibold">
              Rp {order.amountList.toLocaleString('id-ID')}
            </span>
          </div>
          {order.uniqueCode > 0 && (
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>Kode Unik Pembayaran:</span>
              <span className="panel-mono">Rp {order.uniqueCode}</span>
            </div>
          )}
          <div className="h-px bg-[var(--win-border)]" />
          <div className="flex items-center justify-between font-bold text-sm text-[var(--win-text)]">
            <span>Total Jumlah Bayar:</span>
            <span className="panel-mono text-[var(--panel-primary-text)]">
              Rp {order.amountTotal.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Metode Pembayaran Aktif */}
        {order.status === 'pending' && (
          <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2">
            <h5 className="font-bold text-[var(--win-text)]">
              Tujuan Pembayaran Aktif:
            </h5>
            {orderDetailLoading ? (
              <p className="text-[11px] text-[var(--text-secondary)]">Memuat metode pembayaran...</p>
            ) : activePaymentMethods.length > 0 ? (
              <div className="space-y-1.5 text-[11px]">
                {activePaymentMethods.map((method) => (
                  <div key={method.id} className="p-2 rounded-lg bg-[var(--panel-surface)] border border-[var(--win-border)]">
                    <span className="font-bold text-[var(--win-text)] block">{method.name}</span>
                    {method.account && (
                      <span className="panel-mono font-semibold text-[var(--panel-primary-text)]">
                        {method.account}
                      </span>
                    )}
                    {method.holder && (
                      <span className="text-[var(--text-secondary)]">
                        {method.account ? ' · a/n ' : ''}
                        {method.holder}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-secondary)]">
                Belum ada metode pembayaran aktif yang dikonfigurasi di pengaturan billing panel.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
