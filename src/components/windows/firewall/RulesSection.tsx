import { LoaderCircle, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import type { FirewallRule } from '@/api/firewall'
import type { FirewallWindowState } from './useFirewallWindow'

// the pill of each action: the classes the list windows share
const pillOf = (action: string) => (action.startsWith('ALLOW') ? 'running' : action.startsWith('LIMIT') ? 'paused' : 'dead')

function actionLabel(rule: FirewallRule, t: FirewallWindowState['t']) {
  const [verb, direction] = rule.action.split(' ')
  const name = t(`firewall.action.${verb.toLowerCase()}`)
  return direction ? `${name} · ${t(`firewall.direction.${direction.toLowerCase()}`)}` : name
}

// The numbered rules of ufw: what they cover, what they do, from whom, and a way to remove them
export function RulesSection({ fw }: { fw: FirewallWindowState }) {
  const { t, data, query, busy, deleteRule } = fw
  const ufw = data?.ufw
  const rules = ufw?.active ? ufw.rules : []

  return (
    <ListTable
      variant="firewall-rules"
      empty={query.isLoading || query.isError || rules.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('firewall.col.rule') },
        { label: t('firewall.col.action') },
        { label: t('firewall.col.from') },
        { label: t('firewall.col.actions'), actions: true },
      ]}
    >
      <ListState
        loading={query.isLoading}
        error={query.isError}
        errorTitle={t('firewall.loadFailed')}
        errorHint={t('firewall.loadFailedHint')}
        loadingText={t('firewall.loading')}
        empty={rules.length === 0}
        emptyIcon={ufw && !ufw.installed ? <ShieldOff /> : <ShieldCheck />}
        emptyTitle={!ufw?.installed ? t('firewall.notInstalled') : !ufw.active ? t('firewall.inactiveTitle') : t('firewall.rulesEmpty')}
        emptyHint={!ufw?.installed ? t('firewall.notInstalledHint') : !ufw.active ? t('firewall.inactiveHint') : t('firewall.rulesEmptyHint')}
      >
        {rules.map((rule) => {
          const deleting = busy === `rule:${rule.number}`
          const sub = rule.comment || (rule.v6 ? 'IPv6' : 'IPv4')
          const label = actionLabel(rule, t)
          return (
            <div key={rule.number} className="docker-row">
              <div className="docker-row__num">{String(rule.number).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon>{rule.action.startsWith('DENY') || rule.action.startsWith('REJECT') ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}</ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name docker-app-name--mono" title={rule.to}>{rule.to}</span>
                  <span className="docker-row__sub" title={sub}>{sub}</span>
                  <span className="docker-row__meta">{`${label} · ${rule.from}`}</span>
                </div>
              </div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${pillOf(rule.action)}`}>
                  <span className="docker-status-dot" />
                  <span>{label}</span>
                </span>
              </div>
              <div className="docker-cell docker-cell--mono" title={rule.from}>{rule.from}</div>
              <div className="docker-action-btns">
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--danger"
                  title={t('common.delete')}
                  aria-label={t('firewall.deleteAria', { rule: rule.to })}
                  disabled={busy !== null}
                  onClick={() => void deleteRule(rule)}
                >
                  {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </button>
              </div>
            </div>
          )
        })}
      </ListState>
    </ListTable>
  )
}
