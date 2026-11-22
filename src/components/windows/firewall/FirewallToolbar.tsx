import { LoaderCircle, Plus, Power, RefreshCw, RotateCw } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import type { FirewallWindowState, Section } from './useFirewallWindow'

// The bar of the Firewall window: which part, whether ufw is on (and the switch), a new rule, reload and refresh
export function FirewallToolbar({ fw }: { fw: FirewallWindowState }) {
  const { t, data, query, section, setSection, busy, enable, disable, reload, setRuleDraft } = fw
  const isMobile = useIsMobileLayout()
  const ufw = data?.ufw
  const state = !ufw ? null : !ufw.installed ? 'missing' : ufw.active ? 'active' : 'inactive'
  const working = busy === 'enable' || busy === 'disable'
  const sectionItems = [
    { key: 'rules', label: t('firewall.section.rules'), count: ufw?.rules.length },
    { key: 'ports', label: t('firewall.section.ports'), count: data?.listeners.length },
    { key: 'policy', label: t('firewall.section.policy') },
  ]
  const statusPill = state ? (
    <span className={`docker-status-pill docker-status-pill--${state === 'active' ? 'running' : state === 'inactive' ? 'paused' : 'exited'}`}>
      <span className="docker-status-dot" />
      <span>{t(`firewall.status.${state}`)}</span>
    </span>
  ) : null

  if (isMobile) {
    return (
      <div className="docker-topbar docker-topbar--mobile">
        <div className="docker-topbar__row justify-between">
          <FilterMenu label={t('firewall.sections')} value={section} onChange={(key) => setSection(key as Section)} items={sectionItems} />
          {statusPill}
        </div>
        <div className="docker-topbar__row">
          <button type="button" className="docker-primary-btn flex-1 justify-center" disabled={!ufw?.installed} onClick={() => setRuleDraft({})}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('firewall.addRule')}</span>
          </button>
          {ufw?.installed ? (
            <button type="button" className="docker-secondary-btn" disabled={busy !== null} onClick={() => void (ufw.active ? disable() : enable())}>
              {working ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Power className="h-3.5 w-3.5" strokeWidth={1.75} />}
              <span className="docker-secondary-btn__text">{ufw.active ? t('firewall.disable') : t('firewall.enable')}</span>
            </button>
          ) : null}
          {ufw?.active ? (
            <button type="button" className="docker-icon-btn" title={t('firewall.reload')} aria-label={t('firewall.reload')} disabled={busy !== null} onClick={() => void reload()}>
              <RotateCw className={`h-3.5 w-3.5 ${busy === 'reload' ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          ) : null}
          <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching && !query.isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <FilterMenu label={t('firewall.sections')} value={section} onChange={(key) => setSection(key as Section)} items={sectionItems} />
        <button type="button" className="docker-primary-btn" disabled={!ufw?.installed} onClick={() => setRuleDraft({})}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{t('firewall.addRule')}</span>
        </button>
      </div>
      <div className="docker-topbar__right">
        {statusPill}
        {ufw?.installed ? (
          <button type="button" className="docker-secondary-btn" disabled={busy !== null} onClick={() => void (ufw.active ? disable() : enable())}>
            {working ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Power className="h-3.5 w-3.5" strokeWidth={1.75} />}
            <span className="docker-secondary-btn__text">{ufw.active ? t('firewall.disable') : t('firewall.enable')}</span>
          </button>
        ) : null}
        {ufw?.active ? (
          <button type="button" className="docker-icon-btn" title={t('firewall.reload')} aria-label={t('firewall.reload')} disabled={busy !== null} onClick={() => void reload()}>
            <RotateCw className={`h-3.5 w-3.5 ${busy === 'reload' ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
        ) : null}
        <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching && !query.isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
