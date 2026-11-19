import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Pause, Play, Plus, Shield, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteCloudflareWafRule,
  toggleCloudflareWafRule,
  type FirewallCustomRule,
} from '@/api/cloudflare'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { UiTone } from '@/components/ui/IconBadge'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { CfPermissionNotice } from './CfPermissionNotice'
import { cfErrDesc } from './tunnelForms'

const ACTION_TONE: Record<string, UiTone> = {
  skip: 'success',
  log: 'info',
  managed_challenge: 'warning',
  js_challenge: 'warning',
  block: 'danger',
}

interface WafRulesSectionProps {
  zoneId: string
  customRules: FirewallCustomRule[]
  wafPermissionError?: boolean
  wafError?: string
  search: string
  onOpenAddModal: () => void
}

// Custom WAF rules section with search filtering, enable/pause toggle, and delete confirmation.
export function WafRulesSection({
  zoneId,
  customRules,
  wafPermissionError,
  wafError,
  search,
  onOpenAddModal,
}: WafRulesSectionProps) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const toggleRuleMut = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      toggleCloudflareWafRule(zoneId, ruleId, enabled),
    onSuccess: () => {
      toast.success(t('tunnels.security.ruleToggled'))
      void qc.invalidateQueries({ queryKey: ['cloudflare-zone-security', zoneId] })
    },
    onError: (e: unknown) => toast.error(t('tunnels.security.ruleToggleFailed'), { description: cfErrDesc(e) }),
  })

  const deleteRuleMut = useMutation({
    mutationFn: (ruleId: string) => deleteCloudflareWafRule(zoneId, ruleId),
    onSuccess: () => {
      toast.success(t('tunnels.security.ruleDeleted'))
      void qc.invalidateQueries({ queryKey: ['cloudflare-zone-security', zoneId] })
    },
    onError: (e: unknown) => toast.error(t('tunnels.security.ruleDeleteFailed'), { description: cfErrDesc(e) }),
  })

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customRules
    return customRules.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        r.expression.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        (r.ref ?? '').toLowerCase().includes(q),
    )
  }, [customRules, search])

  const actionLabel = (action: string) => {
    const key = `tunnels.security.action.${action}`
    const translated = t(key)
    return translated === key ? action : translated
  }

  return (
    <section className="space-y-2.5">
      <SectionHeader
        icon={<Shield />}
        tone="neutral"
        title={`${t('tunnels.security.wafSectionTitle')} (${customRules.length})`}
        subtitle={t('tunnels.security.wafSectionDesc')}
        className="mb-0"
        actions={
          <Button
            size="sm"
            variant="outline"
            icon={<Plus className="h-3.5 w-3.5" />}
            disabled={!!wafPermissionError}
            onClick={onOpenAddModal}
          >
            {t('tunnels.createWafRule')}
          </Button>
        }
      />

      {wafPermissionError || (wafError && customRules.length === 0) ? (
        <CfPermissionNotice
          title={t('tunnels.security.wafPermMissing')}
          hint={t('tunnels.security.wafPermHint')}
          rawError={wafError}
        />
      ) : (
        <div className="cloudflare-security__table">
          <ListTable
            variant="waf-rules"
            empty={filteredRules.length === 0}
            columns={[
              { label: t('docker.colIndex') },
              { label: t('tunnels.security.colRule') },
              { label: t('tunnels.security.colAction') },
              { label: t('tunnels.security.colExpression') },
              { label: t('tunnels.security.colStatus') },
              { label: t('tunnels.col.actions'), actions: true },
            ]}
          >
            <ListState
              loading={false}
              error={false}
              errorTitle={t('tunnels.security.loadFailed')}
              loadingText={t('tunnels.security.loading')}
              empty={filteredRules.length === 0}
              emptyIcon={<Shield />}
              emptyTitle={search.trim() ? t('docker.noResults') : t('tunnels.security.wafEmpty')}
              emptyHint={search.trim() ? undefined : t('tunnels.security.wafEmptyHint')}
            >
              {filteredRules.map((rule, idx) => {
                const ruleKey = rule.id || rule.ref || String(idx)
                const ruleIdOrRef = rule.id || rule.ref || ''
                const toggling = toggleRuleMut.isPending && toggleRuleMut.variables?.ruleId === ruleIdOrRef
                const deleting = deleteRuleMut.isPending && deleteRuleMut.variables === ruleIdOrRef
                const label = rule.description || rule.ref || actionLabel(rule.action)

                return (
                  <div key={ruleKey} className="docker-row">
                    <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                    <div className="docker-row__app">
                      <ListRowIcon>
                        {rule.action === 'skip' ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <Shield className="h-3.5 w-3.5" />
                        )}
                      </ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-app-name" title={label}>
                          {label}
                        </span>
                        {rule.ref ? <span className="docker-row__sub">{rule.ref}</span> : null}
                        <span className="docker-row__meta" title={rule.expression}>
                          {`${actionLabel(rule.action)} · ${rule.expression}`}
                        </span>
                      </div>
                    </div>
                    <div>
                      <Badge size="sm" tone={ACTION_TONE[rule.action] ?? 'neutral'}>
                        {actionLabel(rule.action)}
                      </Badge>
                    </div>
                    <div className="docker-cell docker-cell--mono" title={rule.expression}>
                      {rule.expression}
                    </div>
                    <div className="docker-cell--keep">
                      <Badge size="sm" dot tone={rule.enabled ? 'success' : 'neutral'}>
                        {rule.enabled ? t('tunnels.security.enabled') : t('tunnels.security.disabled')}
                      </Badge>
                    </div>
                    <div className="docker-action-btns">
                      <button
                        type="button"
                        className="docker-act-btn"
                        disabled={!ruleIdOrRef || toggling}
                        title={
                          rule.enabled
                            ? t('tunnels.security.toggleDisabled')
                            : t('tunnels.security.toggleEnabled')
                        }
                        aria-label={
                          rule.enabled
                            ? t('tunnels.security.toggleDisabled')
                            : t('tunnels.security.toggleEnabled')
                        }
                        onClick={() => toggleRuleMut.mutate({ ruleId: ruleIdOrRef, enabled: !rule.enabled })}
                      >
                        {toggling ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                        ) : rule.enabled ? (
                          <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                        ) : (
                          <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="docker-act-btn docker-act-btn--danger"
                        disabled={!ruleIdOrRef || deleting}
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                        onClick={async () => {
                          const confirmed = await alertLib.confirm(
                            t('tunnels.security.deleteRuleQuestion'),
                            t('tunnels.security.deleteRuleMessage', { name: label }),
                            t('common.delete'),
                            t('common.cancel'),
                            'warning',
                            'tunnels',
                          )
                          if (confirmed) deleteRuleMut.mutate(ruleIdOrRef)
                        }}
                      >
                        {deleting ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </ListState>
          </ListTable>
        </div>
      )}
    </section>
  )
}
