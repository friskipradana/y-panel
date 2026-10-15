import { ArrowRight, Bot } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { CopyBlock } from '@/components/public/CopyBlock'
import { IconBadge } from '@/components/ui/IconBadge'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface InstallGuideProps {
  installCommand: string
  onNavigate: (path: string) => void
}

const AFTER_INSTALL = [
  { id: 'status', command: 'systemctl status reneo' },
  { id: 'logs', command: 'journalctl -u reneo -f' },
  { id: 'menu', command: 'sudo reneo' },
  { id: 'update', command: '' },
  { id: 'uninstall', command: 'sudo bash /opt/reneo/installer/uninstall.sh' },
] as const

// Step-by-step install guide: requirements, one command, first login, then the optional parts
export function InstallGuide({ installCommand, onNavigate }: InstallGuideProps) {
  const { t } = useI18n()

  return (
    <section id="landing-guide" className="mt-16 scroll-mt-20 sm:mt-20" aria-labelledby="landing-guide-title">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h2 id="landing-guide-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t('landing.guide.title')}
        </h2>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.subtitle')}</p>
      </div>

      <ol className="mx-auto max-w-3xl space-y-3">
        {/* 1. requirements */}
        <li className="flex gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 sm:gap-4 sm:p-5">
          <IconBadge tone="primary">1</IconBadge>
          <div className="min-w-0 flex-1">
            <h3 className="text-[0.9375rem] font-semibold">{t('landing.guide.prepare.title')}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              <li>{t('landing.guide.prepare.os')}</li>
              <li>{t('landing.guide.prepare.root')}</li>
              <li>{t('landing.guide.prepare.net')}</li>
              <li>{t('landing.guide.prepare.port')}</li>
            </ul>
          </div>
        </li>

        {/* 2. install */}
        <li className="flex gap-4 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5">
          <IconBadge tone="primary">2</IconBadge>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="text-[0.9375rem] font-semibold">{t('landing.guide.install.title')}</h3>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.install.desc')}</p>
            </div>
            <CopyBlock text={installCommand} />
            <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.install.options')}</p>
          </div>
        </li>

        {/* 3. first login */}
        <li className="flex gap-4 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5">
          <IconBadge tone="primary">3</IconBadge>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="text-[0.9375rem] font-semibold">{t('landing.guide.open.title')}</h3>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.open.desc')}</p>
            </div>
            <CopyBlock text="http://IP-SERVER:8787" />
          </div>
        </li>

        {/* 4. optional: domain */}
        <li className="flex gap-4 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5">
          <IconBadge tone="info">4</IconBadge>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold">
              {t('landing.guide.domain.title')}
              <Badge>{t('landing.guide.optional')}</Badge>
            </h3>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.domain.desc')}</p>
          </div>
        </li>

        {/* 5. optional: agent */}
        <li className="flex gap-4 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5">
          <IconBadge tone="warning">5</IconBadge>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold">
              {t('landing.guide.agent.title')}
              <Badge>{t('landing.guide.optional')}</Badge>
            </h3>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.guide.agent.desc')}</p>
            <Button variant="primary-soft" onClick={() => onNavigate('/docs/mcp')} className="mt-3">
              <Bot size={14} />
              <span>{t('landing.agent.cta')}</span>
              <ArrowRight size={13} />
            </Button>
          </div>
        </li>
      </ol>

      <div className="mx-auto mt-8 max-w-3xl">
        <h3 className="mb-3 text-[0.9375rem] font-semibold">{t('landing.guide.after.title')}</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {AFTER_INSTALL.map((item) => (
            <div key={item.id} className="min-w-0">
              <CopyBlock label={t(`landing.guide.after.${item.id}`)} text={item.command || installCommand} wrap />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
