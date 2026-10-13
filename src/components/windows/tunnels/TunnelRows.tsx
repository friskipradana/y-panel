import {
  type CloudflareDNSRecord,
  type CloudflareDomain,
  type CloudflareTunnelProfile,
  type Tunnel,
} from '@/api/agent'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe2,
  Network,
  RefreshCcw,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { STATUS_CONFIG } from './tunnelForms'
import { RowActions } from './TunnelsShared'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'

export function DomainRow({ domain, active, onClick, onDelete, deleting }: { domain: CloudflareDomain; active: boolean; onClick: () => void; onDelete: () => void; deleting: boolean }) {
  const { t } = useI18n()
  return (
    <div className={`cloudflare-row cloudflare-row--with-action ${active ? 'is-active' : ''}`}>
      <button type="button" onClick={onClick} className="cloudflare-row__select">
        <div className="cloudflare-row__icon"><Globe2 className="h-4 w-4" /></div>
        <div className="cloudflare-row__body">
          <div className="cloudflare-row__title">{domain.name}</div>
          <div className="cloudflare-row__meta">Zone ID: {domain.id}</div>
        </div>
      </button>
      <IconButton type="button" onClick={onDelete} disabled={deleting} tone="danger" label={t('tunnels.deleteDomainTitle')}>
        {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </IconButton>
    </div>
  )
}

export function ProfileRow({ profile, active, onClick, onDelete, deleting }: { profile: CloudflareTunnelProfile; active: boolean; onClick: () => void; onDelete: () => void; deleting: boolean }) {
  const { t } = useI18n()
  const sc = STATUS_CONFIG[profile.status] ?? { variant: 'panel-status--neutral', labelKey: 'tunnels.status.unknown' }
  return (
    <div className={`cloudflare-row cloudflare-row--with-action cloudflare-profile-row ${active ? 'is-active' : ''}`}>
      <button type="button" onClick={onClick} className="cloudflare-row__select cloudflare-profile-row__select">
        <div className="cloudflare-row__icon"><Network className="h-4 w-4" /></div>
        <div className="cloudflare-row__body">
          <div className="cloudflare-profile-row__title-line">
            <span className="cloudflare-row__title">{profile.name}</span>
            <span className={`panel-badge ${sc.variant}`}>{t(sc.labelKey)}</span>
          </div>
          <div className="cloudflare-profile-row__meta-grid">
            <span>{profile.routeCount === 1 ? t('tunnels.routeCount', { count: profile.routeCount }) : t('tunnels.routesCount', { count: profile.routeCount })}</span>
            <span>{profile.daemonRunning ? t('tunnels.daemonRunning') : t('tunnels.daemonIdle')}</span>
            <span title={profile.id}>ID {profile.id.slice(0, 8)}...</span>
          </div>
        </div>
      </button>
      <IconButton type="button" onClick={onDelete} disabled={deleting || profile.id === 'pending'} tone="danger" label={t('tunnels.deleteProfileTitle')}>
        {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </IconButton>
    </div>
  )
}

export function DNSRow({ record, onEdit, onDelete }: { record: CloudflareDNSRecord; onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  return (
    <div className="cloudflare-detail-row">
      <div className="cloudflare-detail-row__main">
        <div className="cloudflare-detail-row__title">
          <Badge tone="info">{record.type}</Badge>
          <span className="truncate font-semibold text-[var(--win-text)]">{record.name}</span>
          {record.proxied && <Badge tone="warning">{t('tunnels.proxied')}</Badge>}
        </div>
        <div className="cloudflare-detail-row__meta">{record.content} • TTL {record.ttl === 1 ? t('tunnels.auto') : record.ttl}</div>
      </div>
      <RowActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

export function TunnelCard({ tunnel: t, onEdit, onDelete, onSync, isSyncing }: { tunnel: Tunnel; onEdit: () => void; onDelete: () => void; onSync: () => void; isSyncing: boolean }) {
  const { t: translate } = useI18n()
  const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.inactive
  const copyHostname = async () => {
    if (!t.cfHostname) return
    try {
      await navigator.clipboard.writeText(`https://${t.cfHostname}`)
      toast.success(translate('tunnels.hostnameCopied'))
    } catch {
      toast.error(translate('tunnels.hostnameCopyFailed'))
    }
  }

  return (
    <div className="cloudflare-detail-row">
      <div className="cloudflare-detail-row__main">
        <div className="cloudflare-detail-row__title">
          <span className="tunnel-flat-row__name">{t.name}</span>
          <span className={`panel-badge ${sc.variant}`}><span className="panel-status-dot" />{translate(sc.labelKey)}</span>
          {t.status === 'active' && <Badge tone="success"><CheckCircle2 className="h-3 w-3" />{translate('tunnels.live')}</Badge>}
          {t.status === 'creating' && <Badge tone="warning"><Clock className="h-3 w-3 animate-spin" />{translate('tunnels.provisioning')}</Badge>}
        </div>
        <div className="cloudflare-detail-row__meta cloudflare-route-line">
          {t.cfHostname ? (
            <>
              <span className="tunnel-flat-row__hostname">{t.cfHostname}</span>
              <IconButton onClick={copyHostname} label={translate('tunnels.copy')} className="h-5 w-5"><Copy className="h-3 w-3" /></IconButton>
              <a href={`https://${t.cfHostname}`} target="_blank" rel="noopener noreferrer" className="panel-icon-btn h-5 w-5"><ExternalLink className="h-3 w-3" /></a>
              <span className="tunnel-flat-row__arrow">→</span>
              <span className="tunnel-flat-row__target">{t.targetUrl}</span>
            </>
          ) : (
            <>
              <span className="tunnel-flat-row__pending">{translate('tunnels.hostnamePending')}</span>
              <span className="tunnel-flat-row__arrow">→</span>
              <span className="tunnel-flat-row__target">{t.targetUrl}</span>
            </>
          )}
        </div>
      </div>
      <div className="tunnel-flat-row__actions">
        {t.status === 'active' && (
          <IconButton onClick={onSync} disabled={isSyncing} tone="primary" label={translate('common.sync')}>
            <RefreshCcw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </IconButton>
        )}
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}
