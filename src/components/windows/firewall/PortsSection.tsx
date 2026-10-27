import { Network, ShieldPlus } from 'lucide-react'
import type { Exposure } from '@/api/firewall'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import type { FirewallWindowState } from './useFirewallWindow'

// the pill of each exposure: the classes the list windows share
const PILL: Record<Exposure, string> = { local: 'exited', docker: 'paused', unfiltered: 'paused', open: 'running', blocked: 'dead' }

// The ports this machine listens on and whether anyone from outside can reach them
export function PortsSection({ fw }: { fw: FirewallWindowState }) {
  const { t, data, query, busy, setRuleDraft } = fw
  const listeners = data?.listeners ?? []
  const filtering = !!data?.ufw.active

  return (
    <ListTable
      variant="firewall-ports"
      empty={query.isLoading || query.isError || listeners.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('firewall.col.port') },
        { label: t('firewall.col.process') },
        { label: t('firewall.col.reach') },
        { label: t('firewall.col.actions'), actions: true },
      ]}
    >
      <ListState
        loading={query.isLoading}
        error={query.isError}
        errorTitle={t('firewall.loadFailed')}
        errorHint={t('firewall.loadFailedHint')}
        loadingText={t('firewall.loading')}
        empty={listeners.length === 0}
        emptyIcon={<Network />}
        emptyTitle={t('firewall.portsEmpty')}
      >
        {listeners.map((l, index) => {
          const process = l.process ? (l.pid ? `${l.process} (${l.pid})` : l.process) : '-'
          const reach = t(`firewall.exposure.${l.exposure}`)
          return (
            <div key={`${l.proto}-${l.address}-${l.port}`} className="docker-row">
              <div className="docker-row__num">{String(index + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><Network className="h-3.5 w-3.5" /></ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name docker-app-name--mono">{`${l.port}/${l.proto}`}</span>
                  <span className="docker-row__sub" title={l.address}>{l.address}</span>
                  <span className="docker-row__meta">{`${l.address} · ${process} · ${reach}`}</span>
                </div>
              </div>
              <div className="docker-cell docker-cell--mono" title={process}>{process}</div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${PILL[l.exposure]}`} title={t(`firewall.exposureHint.${l.exposure}`)}>
                  <span className="docker-status-dot" />
                  <span>{reach}</span>
                </span>
              </div>
              {filtering && l.exposure === 'blocked' ? (
                <div className="docker-action-btns">
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--start"
                    title={t('firewall.openPort')}
                    aria-label={t('firewall.openPortAria', { port: l.port })}
                    disabled={busy !== null}
                    onClick={() => setRuleDraft({ action: 'allow', direction: 'in', proto: l.proto, port: String(l.port) })}
                  >
                    <ShieldPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </ListState>
    </ListTable>
  )
}
