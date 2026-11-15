import { Check, Minus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const ROWS = [
  { key: 'row1', sshOk: false, homelabOk: false, cpanelOk: false },
  { key: 'row2', sshOk: true, homelabOk: true, cpanelOk: false },
  { key: 'row3', sshOk: true, homelabOk: false, cpanelOk: false },
  { key: 'row4', sshOk: false, homelabOk: false, cpanelOk: false },
  { key: 'row5', sshOk: false, homelabOk: false, cpanelOk: false },
  { key: 'row6', sshOk: false, homelabOk: false, cpanelOk: false },
] as const

// Side-by-side comparison against manual SSH, homelab panels, and traditional hosting panels
export function Comparison() {
  const { t } = useI18n()

  return (
    <section className="mt-14" aria-labelledby="landing-comparison">
      <h2 id="landing-comparison" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.comparison.title')}
      </h2>
      <p className="mt-1 max-w-2xl text-[0.875rem] text-[var(--text-secondary)]">
        {t('landing.comparison.subtitle')}
      </p>

      <div className="mt-4 overflow-x-auto rounded-[14px] border border-[var(--win-border)] bg-[var(--panel-surface)]">
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)] text-[0.75rem] font-semibold text-[var(--win-text)]">
              <th className="w-[24%] px-3.5 py-2.5">{t('landing.comparison.col.feature')}</th>
              <th className="w-[19%] px-3.5 py-2.5 text-[var(--text-secondary)]">{t('landing.comparison.col.ssh')}</th>
              <th className="w-[19%] px-3.5 py-2.5 text-[var(--text-secondary)]">{t('landing.comparison.col.homelab')}</th>
              <th className="w-[19%] px-3.5 py-2.5 text-[var(--text-secondary)]">{t('landing.comparison.col.cpanel')}</th>
              <th className="w-[19%] border-l border-[var(--win-border)] bg-[var(--panel-primary-bg)] px-3.5 py-2.5 text-[var(--panel-primary-text)]">
                {t('landing.comparison.col.reneo')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--win-border)] text-[0.8125rem]">
            {ROWS.map((row) => (
              <tr key={row.key} className="align-top">
                <td className="px-3.5 py-2.5 font-medium text-[var(--win-text)]">
                  {t(`landing.comparison.${row.key}.label`)}
                </td>
                <td className="px-3.5 py-2.5 text-[var(--text-secondary)]">
                  <div className="flex items-start gap-2">
                    {row.sshOk ? (
                      <Check size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" />
                    ) : (
                      <Minus size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" />
                    )}
                    <span>{t(`landing.comparison.${row.key}.ssh`)}</span>
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-[var(--text-secondary)]">
                  <div className="flex items-start gap-2">
                    {row.homelabOk ? (
                      <Check size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" />
                    ) : (
                      <Minus size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" />
                    )}
                    <span>{t(`landing.comparison.${row.key}.homelab`)}</span>
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-[var(--text-secondary)]">
                  <div className="flex items-start gap-2">
                    {row.cpanelOk ? (
                      <Check size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" />
                    ) : (
                      <Minus size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" />
                    )}
                    <span>{t(`landing.comparison.${row.key}.cpanel`)}</span>
                  </div>
                </td>
                <td className="border-l border-[var(--win-border)] bg-[var(--panel-primary-bg)]/45 px-3.5 py-2.5 font-medium text-[var(--win-text)]">
                  <div className="flex items-start gap-2">
                    <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" />
                    <span>{t(`landing.comparison.${row.key}.reneo`)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
