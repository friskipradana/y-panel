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
// Everyone connects their own Cloudflare; the seller of hosting needs one more permission and one switch.
export function CloudflareTokenGuide({ focus = 'all' }: Props) {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  // what the last verification of the token found; the verify button stores it
  const verified = useQuery({ queryKey: ['cf-verify'], queryFn: () => null as CFPermissionDetails | null, enabled: false, staleTime: Infinity })
  const details = verified.data ?? undefined

  const rows = PERMISSIONS.filter((p) => (focus === 'hosting' ? p.level === 'hosting' : p.level !== 'hosting' || isSuperadmin))

  return (
    <div className="rounded-2xl border border-[var(--panel-primary-text)]/20 bg-[var(--panel-primary-bg)] p-4 text-[12px] leading-relaxed">
      <div className="flex items-start gap-3">
        <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[13px] font-bold text-[var(--win-text)]">{t(focus === 'hosting' ? 'cfguide.hostingTitle' : 'cfguide.title')}</p>
            <p className="mt-1 text-[var(--text-secondary)]">{t(focus === 'hosting' ? 'cfguide.hostingIntro' : 'cfguide.intro')}</p>
          </div>

          <ul className="space-y-1.5" aria-label={t('cfguide.permissions')}>
            {rows.map((p) => {
              const ok = details ? p.granted(details) : undefined
              return (
                <li key={p.key} className="flex items-start gap-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
                  {ok === true ? (
                    <CircleCheck size={16} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" aria-label={t('cfguide.granted')} />
                  ) : ok === false ? (
                    <CircleAlert size={16} className={`mt-0.5 shrink-0 ${p.level === 'required' ? 'text-[var(--panel-danger-text)]' : 'text-[var(--panel-warning-text)]'}`} aria-label={t('cfguide.missing')} />
                  ) : (
                    <Circle size={16} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-label={t('cfguide.unknown')} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="panel-mono text-[12px] font-semibold text-[var(--win-text)]">{p.path}</span>
                      <Badge tone={p.level === 'required' ? 'primary' : p.level === 'hosting' ? 'info' : 'neutral'}>{t(`cfguide.level.${p.level}`)}</Badge>
                    </div>
                    <p className="text-[11.5px] text-[var(--text-secondary)]">{t(`cfguide.why.${p.key}`)}</p>
                  </div>
                </li>
              )
            })}
          </ul>

          {!details ? <p className="text-[11.5px] text-[var(--text-secondary)]">{t('cfguide.verifyHint')}</p> : null}

          {focus === 'hosting' ? (
            <div className="space-y-1">
              <p className="font-semibold text-[var(--win-text)]">{t('cfguide.hostingSwitchTitle')}</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-[var(--text-secondary)]">
                <li>{t('cfguide.hostingSwitch1')}</li>
                <li>{t('cfguide.hostingSwitch2')}</li>
                <li>{t('cfguide.hostingSwitch3')}</li>
              </ol>
            </div>
          ) : (
            <>
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
            </>
          )}

          <a
            href={TOKENS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[var(--panel-primary-text)] underline underline-offset-2 hover:brightness-110"
          >
            {t('settings.cloudflare.openDashboard')}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  )
}
