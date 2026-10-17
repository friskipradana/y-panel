import { type CloudflareDNSRecord, type Tunnel } from '@/api/agent'
import { toast } from 'sonner'
import { Copy, ExternalLink, Globe2, LoaderCircle, Network, Pencil, RefreshCcw, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { ListRowIcon } from '@/components/ui/ListTable'
import type { UiTone } from '@/components/ui/IconBadge'
import { STATUS_CONFIG } from './tunnelForms'

// The pill of each tone: the classes the list windows share
const TONE_PILL: Record<UiTone, string> = {
  success: 'running',
  primary: 'running',
  warning: 'paused',
  info: 'paused',
  danger: 'dead',
  neutral: 'exited',
}

const indexLabel = (index: number) => String(index + 1).padStart(2, '0')

// One DNS record, in the same row as a container: its name, what it points to, whether Cloudflare proxies it, and its actions
export function DnsRow({ record, index, onEdit, onDelete, deleting }: { record: CloudflareDNSRecord; index: number; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  const { t } = useI18n()
  const ttl = record.ttl === 1 ? t('tunnels.auto') : String(record.ttl)
  const detail = `${record.type} · TTL ${ttl}`
  return (
    <div className="docker-row">
      <div className="docker-row__num">{indexLabel(index)}</div>
      <div className="docker-row__app">
        <ListRowIcon><Globe2 className="h-3.5 w-3.5" /></ListRowIcon>
        <div className="docker-row__text">
          <span className="docker-app-name docker-app-name--mono" title={record.name}>{record.name}</span>
          <span className="docker-row__sub">{detail}</span>
          <span className="docker-row__meta">{`${detail} · ${record.content}`}</span>
        </div>
      </div>
      <div className="docker-cell docker-cell--mono" title={record.content}>{record.content}</div>
      <div className="docker-cell--keep">
        <span className={`docker-status-pill docker-status-pill--${record.proxied ? 'paused' : 'exited'}`}>
          <span className="docker-status-dot" />
          <span>{record.proxied ? t('tunnels.proxied') : t('tunnels.dnsOnly')}</span>
        </span>
      </div>
      <div className="docker-action-btns">
        <button type="button" className="docker-act-btn" title={t('common.edit')} aria-label={t('common.edit')} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={deleting} onClick={onDelete}>
          {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}

// One tunnel route: its public address, where it leads, its state, and its actions
export function RouteRow({ route, index, onEdit, onDelete, onSync, syncing, deleting }: { route: Tunnel; index: number; onEdit: () => void; onDelete: () => void; onSync: () => void; syncing: boolean; deleting: boolean }) {
  const { t } = useI18n()
  const status = STATUS_CONFIG[route.status] ?? STATUS_CONFIG.inactive
  const address = route.cfHostname || t('tunnels.hostnamePending')

  const copyAddress = async () => {
    if (!route.cfHostname) return
    try {
      await navigator.clipboard.writeText(`https://${route.cfHostname}`)
      toast.success(t('tunnels.hostnameCopied'))
    } catch {
      toast.error(t('tunnels.hostnameCopyFailed'))
    }
  }

  return (
    <div className="docker-row">
      <div className="docker-row__num">{indexLabel(index)}</div>
      <div className="docker-row__app">
        <ListRowIcon><Network className="h-3.5 w-3.5" /></ListRowIcon>
        <div className="docker-row__text">
          <span className="docker-app-name" title={route.name}>{route.name}</span>
          <span className="docker-row__sub" title={address}>{address}</span>
          <span className="docker-row__meta">{`${address} → ${route.targetUrl}`}</span>
        </div>
      </div>
      <div className="docker-cell docker-cell--mono" title={route.targetUrl}>{route.targetUrl}</div>
      <div className="docker-cell--keep">
        <span className={`docker-status-pill docker-status-pill--${TONE_PILL[status.tone]}`}>
          <span className="docker-status-dot" />
          <span>{route.status === 'active' ? t('tunnels.live') : t(status.labelKey)}</span>
        </span>
      </div>
      <div className="docker-action-btns">
        {route.status === 'active' ? (
          <button type="button" className="docker-act-btn" title={t('common.sync')} aria-label={t('common.sync')} disabled={syncing} onClick={onSync}>
            <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
        ) : null}
        {route.cfHostname ? (
          <>
            <button type="button" className="docker-act-btn" title={t('tunnels.copy')} aria-label={t('tunnels.copy')} onClick={() => void copyAddress()}>
              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <a className="docker-act-btn" href={`https://${route.cfHostname}`} target="_blank" rel="noopener noreferrer" title={t('tunnels.openSite')} aria-label={t('tunnels.openSite')}>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>
          </>
        ) : null}
        <button type="button" className="docker-act-btn" title={t('common.edit')} aria-label={t('common.edit')} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={deleting} onClick={onDelete}>
          {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}
