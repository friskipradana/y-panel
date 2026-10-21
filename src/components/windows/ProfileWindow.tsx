import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, Boxes, LockKeyhole, Mail, Settings, User, UserRound, Users, Wrench } from 'lucide-react'
import type { ComponentType } from 'react'
import { getMeV2 } from '@/api/agent'
import { getMyPlan } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SettingRow } from '@/components/ui/SettingRow'
import { AccountPassword, AccountUsage } from '@/components/windows/profile/AccountSecurityCard'
import { MyNotices } from '@/components/windows/profile/MyNotices'
import { MyPlanCard } from '@/components/windows/profile/MyPlanCard'
import { ToolchainTools } from '@/components/windows/profile/ToolchainTools'
import { formatDateID } from '@/lib/datetime'
import { daysUntil, planNotice } from '@/lib/planNotice'
import { useI18n } from '@/lib/i18n'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'

type ProfileSection = 'account' | 'plan' | 'notify' | 'tools' | 'security'

const SECTIONS: Array<{ key: ProfileSection; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'account', icon: UserRound },
  { key: 'plan', icon: Boxes },
  { key: 'notify', icon: Bell },
  { key: 'tools', icon: Wrench },
  { key: 'security', icon: LockKeyhole },
]

const VALUE = 'text-[12px] font-medium text-[var(--win-text)]'
const PLAN_TONE = { active: 'success', grace: 'warning', expired: 'danger', none: 'neutral' } as const

// The profile of the signed-in account, laid out like Settings: a menu on the left (a strip on a phone), a title, and the cards of one page
export default function ProfileWindow() {
  const { t } = useI18n()
  const openWindow = useWindowStore((s) => s.openWindow)
  const requestSettingsTab = useSettingsNavStore((s) => s.request)
  const [section, setSection] = useState<ProfileSection>('account')
  const { data: me } = useQuery({ queryKey: ['me-v2'], queryFn: getMeV2, retry: 1 })
  const plan = useQuery({ queryKey: ['me-plan'], queryFn: getMyPlan, retry: 0, staleTime: 60_000 })

  const displayName = me?.displayName || me?.username || 'Admin'
  const displayRole = me?.role || 'superadmin'
  const clientHost = typeof window !== 'undefined' ? (window.location.hostname || '127.0.0.1') : '127.0.0.1'
  // only the owner and the admins manage other accounts
  const managesUsers = displayRole === 'superadmin' || displayRole === 'admin'
  // the owner sets notices up in Settings; the demo account only looks
  const hasNotices = displayRole !== 'demo' && displayRole !== 'superadmin'
  const hasPlan = !!plan.data?.plan
  const planView = plan.data
  const notice = planNotice(planView)
  const daysLeft = planView?.state === 'active' ? daysUntil(planView.expiresAt) : 0
  // the demo account only looks: it installs nothing
  const hasTools = displayRole !== 'demo'
  const sections = SECTIONS.filter((s) => (s.key === 'plan' ? hasPlan : s.key === 'notify' ? hasNotices : s.key === 'tools' ? hasTools : true))
  const shown = sections.some((s) => s.key === section) ? section : 'account'
  const current = sections.find((s) => s.key === shown) ?? sections[0]
  const CurrentIcon = current.icon

  return (
    <div className="panel-window flex flex-col h-full overflow-hidden">
      <div className="panel-window__body flex-1 min-h-0 flex flex-row overflow-hidden p-0 mobile:flex-col">
        <nav className="settings-nav" aria-label={t('profile.accountProfile')}>
          <p className="settings-nav__title">{t('profile.accountProfile')}</p>
          <div className="settings-nav__group" role="group">
            {sections.map(({ key, icon: Icon }) => {
              const active = key === shown
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-current={active ? 'page' : undefined}
                  className={`settings-nav__item${active ? ' settings-nav__item--active' : ''}`}
                >
                  <Icon size={14} className="settings-nav__icon" />
                  <span className="truncate">{t(`profile.section.${key}`)}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0 overflow-y-auto p-3.5 md:p-4 flex flex-col">
          <header className="settings-page__head shrink-0">
            <CurrentIcon size={16} className="settings-page__icon" />
            <div className="min-w-0">
              <h1 className="settings-page__title">{t(`profile.section.${shown}`)}</h1>
              <p className="settings-page__desc">{t(`profile.section.${shown}.desc`)}</p>
            </div>
          </header>

          <div className="space-y-3">
            {shown === 'account' ? (
              <>
                <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="profile-avatar h-11 w-11 shrink-0 rounded-lg text-lg font-semibold">{displayName.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className="truncate text-[13px] font-semibold text-[var(--win-text)]">{displayName}</h2>
                          <Badge tone="primary">{displayRole}</Badge>
                          <Badge tone="success" dot>
                            {t('profile.plan.state.active')}
                          </Badge>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-secondary)]">
                          {me?.username ? (
                            <span className="panel-mono inline-flex items-center gap-1">
                              <User size={12} aria-hidden="true" />@{me.username}
                            </span>
                          ) : null}
                          {me?.email ? (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Mail size={12} aria-hidden="true" />
                              <span className="truncate">{me.email}</span>
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Settings className="h-3.5 w-3.5" />}
                        onClick={() => {
                          requestSettingsTab('security')
                          openWindow('settings')
                        }}
                      >
                        {t('profile.securityTitle')}
                      </Button>
                      {managesUsers ? (
                        <Button size="sm" variant="outline" icon={<Users className="h-3.5 w-3.5" />} onClick={() => openWindow('users')}>
                          {t('profile.usersTitle')}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <SettingRow title={t('account.memberSince')} control={<span className={VALUE}>{formatDateID(me?.createdAt)}</span>} />
                  <SettingRow
                    title={t('account.lastLogin')}
                    control={<span className={VALUE}>{me?.lastLoginAt ? <DateTimeText value={me.lastLoginAt} /> : t('account.currentSession')}</span>}
                  />
                  {hasPlan && planView?.plan ? (
                    <>
                      <SettingRow
                        title={t('profile.plan.title')}
                        control={
                          <span className="flex items-center gap-2">
                            <span className={VALUE}>{planView.plan.name}</span>
                            <Badge tone={notice?.kind === 'expiring' ? 'warning' : PLAN_TONE[planView.state]} dot>
                              {notice?.kind === 'expiring' ? t('profile.plan.state.expiring') : t(`profile.plan.state.${planView.state}`)}
                            </Badge>
                          </span>
                        }
                      />
                      <SettingRow
                        title={t('profile.validity')}
                        control={
                          <span className={VALUE}>
                            {!planView.expiresAt ? (
                              t('profile.plan.noEnd')
                            ) : planView.state === 'grace' && planView.graceEndsAt ? (
                              t('profile.validity.grace', { date: formatDateID(planView.graceEndsAt) })
                            ) : planView.state === 'expired' ? (
                              t('profile.validity.ended', { date: formatDateID(planView.expiresAt) })
                            ) : (
                              <>
                                {formatDateID(planView.expiresAt)}
                                {daysLeft > 0 ? (
                                  <span className={notice?.kind === 'expiring' ? 'font-semibold text-[var(--panel-warning-text)]' : 'text-[var(--text-secondary)]'}> · {t('profile.plan.daysLeft', { days: daysLeft })}</span>
                                ) : null}
                              </>
                            )}
                          </span>
                        }
                      />
                      {planView.trial ? (
                        <SettingRow
                          title={t('profile.validity.trial')}
                          control={<span className={VALUE}>{t('profile.validity.trialValue', { plan: planView.trial.plan?.name ?? '-', date: formatDateID(planView.trial.endsAt) })}</span>}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {managesUsers ? <SettingRow title={t('profile.sessionHost')} control={<span className={`panel-mono ${VALUE}`}>{clientHost}</span>} /> : null}
                </div>
                <AccountUsage />
              </>
            ) : null}
            {shown === 'plan' ? <MyPlanCard /> : null}
            {shown === 'notify' ? <MyNotices /> : null}
            {shown === 'tools' ? <ToolchainTools /> : null}
            {shown === 'security' ? <AccountPassword /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
