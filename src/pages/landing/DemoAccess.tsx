import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Eye } from 'lucide-react'
import { getDemoInfo } from '@/api/agent'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

// Shown only when this instance has the demo account enabled
export function DemoAccess({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useI18n()
  const { data } = useQuery({ queryKey: ['public-demo'], queryFn: getDemoInfo, staleTime: 5 * 60_000, retry: false })

  if (!data?.enabled || !data.username || !data.password) return null

  return (
    <section className="mt-14" aria-labelledby="landing-demo">
      <h2 id="landing-demo" className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <Eye size={20} aria-hidden="true" />
        {t('landing.demo.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.demo.subtitle')}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <CopyBlock label={t('landing.demo.username')} text={data.username} />
          <CopyBlock label={t('landing.demo.password')} text={data.password} />
          <Button variant="primary" onClick={() => onNavigate('/login?demo=1')}>
            <span>{t('landing.demo.cta')}</span>
            <ArrowRight size={13} />
          </Button>
        </div>

        <dl className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
          <div className="px-4 py-3">
            <dt className="text-[0.8125rem] font-semibold">{t('landing.demo.canTitle')}</dt>
            <dd className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.demo.canBody')}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-[0.8125rem] font-semibold">{t('landing.demo.cannotTitle')}</dt>
            <dd className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.demo.cannotBody')}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
