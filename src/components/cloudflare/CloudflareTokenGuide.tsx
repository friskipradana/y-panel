import { useQuery } from '@tanstack/react-query'
import { Circle, CircleAlert, CircleCheck, Cloud, ExternalLink } from 'lucide-react'
import type { CFPermissionDetails } from '@/api/cloudflare'
import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

type Level = 'required' | 'optional' | 'hosting'

interface Permission {
  key: string
  /** The wording of the Cloudflare dashboard, which is not translated */
  path: string
  level: Level
  granted: (d: CFPermissionDetails) => boolean | undefined
}

const PERMISSIONS: Permission[] = [
  { key: 'tunnel', path: 'Account · Cloudflare Tunnel · Edit', level: 'required', granted: (d) => d.canEditTunnels },
  { key: 'zone', path: 'Zone · Zone · Read', level: 'required', granted: (d) => d.canReadZones },
  { key: 'dns', path: 'Zone · DNS · Edit', level: 'required', granted: (d) => d.canManageDNS },
  { key: 'redirect', path: 'Zone · Single Redirect · Edit', level: 'optional', granted: (d) => d.canManageRedirects },
  { key: 'ssl', path: 'Zone · SSL and Certificates · Edit', level: 'hosting', granted: (d) => d.canManageCustomHostnames },
]

const TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens'

interface Props {
  /** "hosting" shows only what the seller of hosting adds for domains of buyers */
  focus?: 'all' | 'hosting'
}

// Which permissions a Cloudflare API token needs and why, with a mark for each one the last verification could read.
export function CloudflareTokenGuide({ focus = 'all' }: Props) {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const verified = useQuery({ queryKey: ['cf-verify'], queryFn: () => null as CFPermissionDetails | null, enabled: false, staleTime: Infinity })
  const details = verified.data ?? undefined

  const rows = PERMISSIONS.filter((p) => (focus === 'hosting' ? p.level === 'hosting' : p.level !== 'hosting' || isSuperadmin))

  return (
    <div className="rounded-xl border border-[var(--win-border)] bg-[var(--win-content-bg)] p-3.5 space-y-3 text-[12px] leading-relaxed">
      <div className="flex items-start gap-2.5">
        <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-[var(--win-text)]">{t(focus === 'hosting' ? 'cfguide.hostingTitle' : 'cfguide.title')}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] leading-relaxed">{t(focus === 'hosting' ? 'cfguide.hostingIntro' : 'cfguide.intro')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/60 divide-y divide-[var(--win-border)]/50 overflow-hidden">
        {rows.map((p) => {
          const ok = details ? p.granted(details) : undefined
          return (
            <div key={p.key} className="flex items-start gap-2.5 px-3 py-2">
              {ok === true ? (
                <CircleCheck size={14} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" aria-label={t('cfguide.granted')} />
              ) : ok === false ? (
                <CircleAlert size={14} className={`mt-0.5 shrink-0 ${p.level === 'required' ? 'text-[var(--panel-danger-text)]' : 'text-[var(--panel-warning-text)]'}`} aria-label={t('cfguide.missing')} />
              ) : (
                <Circle size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" aria-label={t('cfguide.unknown')} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="panel-mono text-[11.5px] font-semibold text-[var(--win-text)]">{p.path}</span>
                  <Badge size="sm" tone={p.level === 'required' ? 'primary' : p.level === 'hosting' ? 'info' : 'neutral'}>
                    {t(`cfguide.level.${p.level}`)}
                  </Badge>
                </div>
                <p className="text-[10.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">{t(`cfguide.why.${p.key}`)}</p>
                {ok === false && p.key === 'ssl' && details?.customHostnamesReason === 'quota' ? (
                  <p className="mt-1 rounded-md bg-[var(--panel-warning-bg)] px-2 py-1.5 text-[10.5px] leading-snug text-[var(--panel-warning-text)]">{t('cfguide.sslQuota')}</p>
                ) : null}
                {ok === false && p.key === 'ssl' && details?.customHostnamesError ? (
                  <p className="mt-1 text-[10.5px] leading-snug text-[var(--text-secondary)]">
                    {t('cfguide.cloudflareSaid')} <span className="panel-mono break-all">{details.customHostnamesError}</span>
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {!details ? <p className="text-[10.5px] text-[var(--text-muted)]">{t('cfguide.verifyHint')}</p> : null}

      {focus === 'hosting' ? (
        <div className="space-y-1 text-[11px] border-t border-[var(--win-border)]/50 pt-2.5">
          <p className="font-semibold text-[var(--win-text)]">{t('cfguide.hostingSwitchTitle')}</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-[var(--text-secondary)]">
            <li>{t('cfguide.hostingSwitch1')}</li>
            <li>{t('cfguide.hostingSwitch2')}</li>
            <li>{t('cfguide.hostingSwitch3')}</li>
          </ol>
        </div>
      ) : (
        <div className="space-y-2 text-[11px] border-t border-[var(--win-border)]/50 pt-2.5">
          <div className="space-y-1">
            <p className="font-semibold text-[var(--win-text)]">{t('cfguide.resourcesTitle')}</p>
            <ul className="list-disc space-y-0.5 pl-4 text-[var(--text-secondary)]">
              <li>{t('cfguide.resourcesAccount')}</li>
              <li>{t(isSuperadmin ? 'cfguide.resourcesZoneSeller' : 'cfguide.resourcesZone')}</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-[var(--win-text)]">{t('cfguide.stepsTitle')}</p>
            <ol className="list-decimal space-y-0.5 pl-4 text-[var(--text-secondary)]">
              <li>{t('cfguide.step1')}</li>
              <li>{t('cfguide.step2')}</li>
              <li>{t('cfguide.step3')}</li>
              <li>{t('cfguide.step4')}</li>
              <li>{t('cfguide.step5')}</li>
            </ol>
          </div>
          {isSuperadmin ? <p className="text-[var(--text-secondary)]">{t('cfguide.sellerNote')}</p> : null}
        </div>
      )}

      <div className="pt-1">
        <a
          href={TOKENS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--panel-primary-text)] hover:underline"
        >
          {t('settings.cloudflare.openDashboard')}
          <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}
