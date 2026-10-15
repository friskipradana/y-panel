import { ArrowRight, Bot } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconBadge } from '@/components/ui/IconBadge'

interface InstallGuideProps {
  installCommand: string
  onNavigate: (path: string) => void
}

const AFTER_INSTALL = [
  { id: 'status', command: 'systemctl status reneo' },
  { id: 'logs', command: 'journalctl -u reneo -f' },
  { id: 'menu', command: 'sudo reneo' },
  { id: 'update', command: 'sudo reneo update' },
  { id: 'uninstall', command: 'sudo bash /opt/reneo/installer/uninstall.sh' },
] as const

function Step({ n, title, optional, children }: { n: number; title: string; optional?: string; children?: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3 pb-6 last:pb-0">
      <IconBadge size="sm">{n}</IconBadge>
      <div className="min-w-0 space-y-2">
        <h3 className="flex flex-wrap items-center gap-2 pt-0.5 text-[0.9375rem] font-semibold">
          {title}
          {optional ? <Badge>{optional}</Badge> : null}
        </h3>
        {children}
      </div>
    </li>
  )
}

const bodyText = 'text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]'

// Step-by-step install guide: requirements, one command, first login, then the optional parts
export function InstallGuide({ installCommand, onNavigate }: InstallGuideProps) {
  const { t } = useI18n()
  const optional = t('landing.guide.optional')

  return (
    <section id="landing-guide" className="mt-14 scroll-mt-20" aria-labelledby="landing-guide-title">
      <h2 id="landing-guide-title" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.guide.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.guide.subtitle')}</p>

      <ol className="mt-5 max-w-3xl">
        <Step n={1} title={t('landing.guide.prepare.title')}>
          <ul className={`list-disc space-y-1 pl-5 ${bodyText}`}>
            <li>{t('landing.guide.prepare.os')}</li>
            <li>{t('landing.guide.prepare.root')}</li>
            <li>{t('landing.guide.prepare.net')}</li>
            <li>{t('landing.guide.prepare.port')}</li>
          </ul>
        </Step>

        <Step n={2} title={t('landing.guide.install.title')}>
          <p className={bodyText}>{t('landing.guide.install.desc')}</p>
          <CopyBlock text={installCommand} prompt="$" />
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.install.options')}</p>
        </Step>

        <Step n={3} title={t('landing.guide.open.title')}>
          <p className={bodyText}>{t('landing.guide.open.desc')}</p>
          <CopyBlock text="http://IP-SERVER:8787" />
        </Step>

        <Step n={4} title={t('landing.guide.domain.title')} optional={optional}>
          <p className={bodyText}>{t('landing.guide.domain.desc')}</p>
        </Step>

        <Step n={5} title={t('landing.guide.agent.title')} optional={optional}>
          <p className={bodyText}>{t('landing.guide.agent.desc')}</p>
          <Button variant="primary-soft" onClick={() => onNavigate('/docs/mcp')}>
            <Bot size={14} />
            <span>{t('landing.agent.cta')}</span>
            <ArrowRight size={13} />
          </Button>
        </Step>
      </ol>

      <h3 className="mb-3 mt-8 text-[0.9375rem] font-semibold">{t('landing.guide.after.title')}</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {AFTER_INSTALL.map((item) => (
          <div key={item.id} className="min-w-0">
            <CopyBlock label={t(`landing.guide.after.${item.id}`)} text={item.command} wrap />
          </div>
        ))}
      </div>
    </section>
  )
}
