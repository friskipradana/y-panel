import { useMemo, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { type AppLicense, type RenewLicensePayload } from '@/api/appLicenses'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

interface RenewLicenseModalProps {
  open: boolean
  license: AppLicense
  onClose: () => void
  pending: boolean
  onConfirm: (payload: RenewLicensePayload) => void
}

export function RenewLicenseModal({
  open,
  license,
  onClose,
  pending,
  onConfirm,
}: RenewLicenseModalProps) {
  const { t } = useI18n()
  const [months, setMonths] = useState<number>(1)
  const [paymentMethod] = useState<'transfer'>('transfer')

  const pricingOptions = useMemo(() => {
    const basePrice = license.priceAmount || 99000
    return [
      {
        months: 1,
        label: '1 Bulan',
        period: 'monthly',
        price: basePrice,
        desc: 'Paket Standar Bulanan',
        savings: null,
      },
      {
        months: 3,
        label: '3 Bulan',
        period: 'quarterly',
        price: Math.round(basePrice * 3 * 0.94),
        desc: 'Rp 93.000 / bln',
        savings: 'Hemat 6%',
      },
      {
        months: 12,
        label: '12 Bulan (1 Tahun)',
        period: 'annual',
        price: Math.round(basePrice * 10),
        desc: 'Rp 82.500 / bln',
        savings: 'Hemat 17% (Paling Populer)',
      },
    ]
  }, [license])

  const selectedPricing = pricingOptions.find((p) => p.months === months) || pricingOptions[0]

  const calculatedNewExpiry = useMemo(() => {
    const currentExp = new Date(license.expiresAt)
    const now = new Date()
    const baseDate = currentExp > now ? currentExp : now
    const newExp = new Date(baseDate)
    newExp.setMonth(newExp.getMonth() + months)
    return newExp.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }, [license, months])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Perpanjang Lisensi ${license.appName}`}
      subtitle={t('appLicenses.renewSubtitle')}
      icon={<KeyRound className="text-[var(--panel-primary-text)]" size={20} />}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs">
            <span className="text-[var(--text-secondary)]">Total Pembayaran:</span>
            <span className="block font-bold text-base text-[var(--panel-primary-text)] tabular-nums">
              Rp {selectedPricing.price.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              onClick={() => {
                onConfirm({
                  catalogId: license.catalogId,
                  months: selectedPricing.months,
                  planName:
                    selectedPricing.months === 12
                      ? 'Tahunan (Enterprise)'
                      : 'Bulanan (Pro)',
                  period: selectedPricing.period,
                  priceAmount: selectedPricing.price,
                  paymentMethod,
                })
              }}
            >
              Konfirmasi &amp; Bayar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-2">
            Pilih Periode Langganan:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {pricingOptions.map((opt) => {
              const isSelected = months === opt.months
              return (
                <button
                  key={opt.months}
                  type="button"
                  onClick={() => setMonths(opt.months)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] ring-1 ring-[var(--panel-primary-border)]'
                      : 'border-[var(--win-border)] bg-[var(--win-bg)] hover:border-[var(--win-border-focus)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-[var(--win-text)]">{opt.label}</span>
                    {opt.savings && (
                      <Badge tone="primary" size="sm">
                        {opt.savings}
                      </Badge>
                    )}
                  </div>
                  <div className="font-bold text-sm text-[var(--panel-primary-text)] mt-2 tabular-nums">
                    Rp {opt.price.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{opt.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2">
          <div className="text-[11px] text-[var(--text-secondary)]">
            Invoice akan diterbitkan menggunakan metode pembayaran aktif dari Pengaturan Situs Reneo (sama seperti pesanan Hosting).
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Aplikasi:</span>
            <span className="font-semibold text-[var(--win-text)]">{license.appName}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Masa Aktif Baru:</span>
            <span className="font-semibold text-[var(--panel-success-text)]">
              s/d {calculatedNewExpiry}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
