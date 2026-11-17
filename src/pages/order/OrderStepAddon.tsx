import { Check, Minus, Plus } from 'lucide-react'
import { formatRupiah, type PublicAppAddonLicense } from '@/api/hosting'
import { AppIcon } from '@/components/common/AppIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectableCard } from '@/components/ui/SelectableCard'
import { monthsLabel } from '@/lib/duration'
import { describeLicenseFeatures } from '@/lib/hostingLimits'
import { useI18n } from '@/lib/i18n'
import type { OrderFormState } from './useOrderForm'

function licenseUnitLabel(lp: PublicAppAddonLicense, t: (key: string, params?: Record<string, string | number>) => string) {
  const m = lp.months || 1
  if (m === 1) return t('hosting.period.monthly')
  if (m === 12) return t('hosting.period.yearly')
  return `/ ${monthsLabel(t, m)}`
}

// Step 2: optional app + license catalog picker with full tier benefits and synced/independent duration
export function OrderStepAddon({ order }: { order: OrderFormState }) {
  const { t, language } = useI18n()
  const {
    plan, hostingMonths, planIncludesApp, bundledApp, bundledLicense,
    choosableAddons, addonSelected, selectedAddonApp, selectedAddonLicense, selectAddonPlan,
    effectiveAddonMode, canFollowPlan, setAddonDurationMode,
    addonCount, maxAddonUnits, unitMonths, addonMonths, addonAmount, setAddonUnits,
    basePrice,
  } = order

  const customChoices =
    unitMonths === 1
      ? ([1, 3, 6, 12, 24] as const).filter((n) => n <= maxAddonUnits)
      : ([1, 2, 3] as const).filter((n) => n <= maxAddonUnits)

  return (
    <section className="space-y-4">
      <div>
        <p className="panel-section-label">{t('order.addon.stepTitle')}</p>
        <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('order.addon.stepSubtitle')}</p>
      </div>

      {planIncludesApp && plan ? (
        <div className="rounded-xl border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AppIcon kind="installed-app" iconKey={plan.includedCatalogId} size={22} />
              <div className="min-w-0">
                <p className="text-[0.875rem] font-semibold text-[var(--panel-success-text)]">
                  {bundledApp?.name ?? t('order.addon.includedTitle')}
                </p>
                {bundledLicense ? (
                  <p className="text-[0.75rem] text-[var(--text-secondary)]">{bundledLicense.name}</p>
                ) : null}
              </div>
            </div>
            <Badge tone="success" size="sm">{t('order.addon.includedBadge')}</Badge>
          </div>
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.addon.includedHint')}</p>
          {bundledLicense ? (
            <ul className="grid gap-1 pt-1 text-[0.75rem] sm:grid-cols-2">
              {describeLicenseFeatures(bundledLicense.features, t).map((feat) => (
                <li key={feat} className="flex items-start gap-1.5 text-[var(--win-text)]">
                  <Check size={13} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {choosableAddons.length > 0 ? (
        <div className="space-y-3">
          <SelectableCard
            selected={!addonSelected}
            onClick={() => selectAddonPlan('')}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left"
          >
            <div>
              <p className="text-[0.875rem] font-semibold text-[var(--win-text)]">{t('order.addon.noneTitle')}</p>
              <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.addon.noneHint')}</p>
            </div>
            <span className="panel-mono text-[0.8125rem] font-medium text-[var(--text-secondary)]">{formatRupiah(0)}</span>
          </SelectableCard>

          {choosableAddons.map((app) => {
            const appTagline = language === 'en' ? app.taglineEn || app.taglineId : app.taglineId || app.taglineEn
            const appDesc = language === 'en' ? app.descriptionEn || app.descriptionId : app.descriptionId || app.descriptionEn
            const isThisApp = selectedAddonApp?.catalogId === app.catalogId

            return (
              <div
                key={app.catalogId}
                className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <AppIcon kind="installed-app" iconKey={app.catalogId} size={28} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[0.9375rem] font-semibold text-[var(--win-text)]">{app.name}</h3>
                      {isThisApp && selectedAddonLicense ? (
                        <Badge tone="primary" size="sm">{selectedAddonLicense.name}</Badge>
                      ) : null}
                    </div>
                    {appTagline ? <p className="text-[0.8125rem] font-medium text-[var(--text-secondary)]">{appTagline}</p> : null}
                    {appDesc ? <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{appDesc}</p> : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {t('order.addon.chooseLicense')}
                  </p>
                  <div className="grid gap-2">
                    {app.licensePlans.map((lp) => {
                      const lpSelected = isThisApp && selectedAddonLicense?.slug === lp.slug
                      const feats = describeLicenseFeatures(lp.features, t)
                      return (
                        <SelectableCard
                          key={lp.slug}
                          selected={lpSelected}
                          onClick={() => selectAddonPlan(app.catalogId, lp.slug)}
                          className="w-full rounded-xl p-3.5 text-left"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[0.875rem] font-semibold text-[var(--win-text)]">{lp.name}</span>
                                {lp.highlighted ? <Badge tone="primary" size="sm">{t('hosting.landing.recommended')}</Badge> : null}
                              </div>
                              {lp.tagline ? (
                                <p className="mt-0.5 text-[0.75rem] leading-snug text-[var(--text-secondary)]">{lp.tagline}</p>
                              ) : null}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="panel-mono text-[0.875rem] font-bold text-[var(--win-text)]">
                                {formatRupiah(lp.priceAmount)}
                              </span>
                              <span className="block text-[0.75rem] text-[var(--text-secondary)]">
                                {licenseUnitLabel(lp, t)}
                              </span>
                            </div>
                          </div>
                          {feats.length > 0 ? (
                            <ul className="mt-2.5 grid gap-1 border-t border-[var(--win-border)]/70 pt-2.5 text-[0.75rem] sm:grid-cols-2">
                              {feats.map((feat) => (
                                <li key={feat} className="flex items-start gap-1.5 text-[var(--win-text)]">
                                  <Check size={13} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" strokeWidth={1.75} aria-hidden="true" />
                                  <span className="leading-snug">{feat}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </SelectableCard>
                      )
                    })}
                  </div>
                </div>

                {isThisApp && selectedAddonLicense ? (
                  <div className="space-y-2.5 border-t border-[var(--win-border)] pt-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      {t('order.addon.durationTitle')}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <SelectableCard
                        selected={effectiveAddonMode === 'follow'}
                        onClick={() => canFollowPlan && setAddonDurationMode('follow')}
                        className={`rounded-lg p-3 text-left ${!canFollowPlan ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <p className="text-[0.8125rem] font-semibold text-[var(--win-text)]">{t('order.addon.followPlan')}</p>
                        <p className="mt-0.5 text-[0.75rem] text-[var(--text-secondary)]">
                          {canFollowPlan
                            ? t('order.addon.followPlanHint', { duration: monthsLabel(t, hostingMonths) })
                            : t('order.addon.followPlanDisabled')}
                        </p>
                      </SelectableCard>

                      <SelectableCard
                        selected={effectiveAddonMode === 'custom'}
                        onClick={() => setAddonDurationMode('custom')}
                        className="rounded-lg p-3 text-left"
                      >
                        <p className="text-[0.8125rem] font-semibold text-[var(--win-text)]">{t('order.addon.customDuration')}</p>
                        <p className="mt-0.5 text-[0.75rem] text-[var(--text-secondary)]">{t('order.addon.customDurationHint')}</p>
                      </SelectableCard>
                    </div>

                    {effectiveAddonMode === 'custom' ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg-soft)] p-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {customChoices.map((qtyChoice) => (
                            <Button
                              key={qtyChoice}
                              type="button"
                              size="sm"
                              variant={addonCount === qtyChoice ? 'primary' : 'outline'}
                              onClick={() => setAddonUnits(String(qtyChoice))}
                            >
                              {monthsLabel(t, qtyChoice * unitMonths)}
                            </Button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={addonCount <= 1}
                            onClick={() => setAddonUnits(String(Math.max(1, addonCount - 1)))}
                            aria-label={t('order.addon.qtyDecrease')}
                          >
                            <Minus size={13} strokeWidth={1.75} />
                          </Button>
                          <span className="panel-mono min-w-[4.5rem] text-center text-[0.8125rem] font-semibold text-[var(--win-text)]">
                            {monthsLabel(t, addonMonths)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={addonCount >= maxAddonUnits}
                            onClick={() => setAddonUnits(String(Math.min(maxAddonUnits, addonCount + 1)))}
                            aria-label={t('order.addon.qtyIncrease')}
                          >
                            <Plus size={13} strokeWidth={1.75} />
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.8125rem]">
                      <span className="text-[var(--text-secondary)]">
                        {t('order.addon.subtotalLabel', {
                          tier: selectedAddonLicense.name,
                          duration: monthsLabel(t, addonMonths),
                        })}
                      </span>
                      <span className="panel-mono font-semibold text-[var(--win-text)]">
                        {formatRupiah(addonAmount)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="space-y-1 border-t border-[var(--win-border)] pt-3 text-[0.8125rem]">
        <div className="flex items-baseline justify-between gap-2 text-[var(--text-secondary)]">
          <span>{t('order.addon.hostingLine', { plan: plan?.name ?? '' })}</span>
          <span className="panel-mono text-[var(--win-text)]">
            {basePrice.subtotal === 0 ? t('hosting.landing.free') : formatRupiah(basePrice.subtotal)}
          </span>
        </div>
        {addonSelected && selectedAddonLicense ? (
          <div className="flex items-baseline justify-between gap-2 text-[var(--text-secondary)]">
            <span>{t('order.addon.lineItem', { tier: selectedAddonLicense.name, duration: monthsLabel(t, addonMonths) })}</span>
            <span className="panel-mono text-[var(--win-text)]">{formatRupiah(addonAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-2 pt-1 font-semibold text-[var(--win-text)]">
          <span>{t('order.addon.estimatedTotal')}</span>
          <span className="panel-mono">
            {basePrice.subtotal + addonAmount === 0 ? t('hosting.landing.free') : formatRupiah(basePrice.subtotal + addonAmount)}
          </span>
        </div>
      </div>
    </section>
  )
}
