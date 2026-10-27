import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  addFirewallRule,
  deleteFirewallRule,
  disableFirewall,
  enableFirewall,
  getFirewall,
  reloadFirewall,
  riskOf,
  setFirewallDefault,
  setFirewallLogging,
  type FirewallRule,
  type FirewallState,
  type LoggingLevel,
  type Policy,
  type PolicyDirection,
  type RuleSpec,
} from '@/api/firewall'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'

export type Section = 'rules' | 'ports' | 'policy'

const KEY = ['firewall']

const apiError = (error: unknown, fallback: string) => (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// State, queries and changes of the Firewall window. A change that would cut off SSH, the panel or the web ports is held until the owner confirms it.
export function useFirewallWindow(win?: WindowState) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const active = useWindowPollingActive(win)
  const [section, setSection] = useState<Section>('rules')
  const [ruleDraft, setRuleDraft] = useState<Partial<RuleSpec> | null>(null)
  // which change is running: 'enable', 'disable', 'reload', 'default', 'logging', 'add' or 'rule:<number>'
  const [busy, setBusy] = useState<string | null>(null)

  const query = useQuery({ queryKey: KEY, queryFn: getFirewall, retry: 0, refetchInterval: active ? 15_000 : false })

  const change = async (key: string, send: (confirm: boolean) => Promise<FirewallState>, done: string): Promise<boolean> => {
    setBusy(key)
    try {
      let next: FirewallState
      try {
        next = await send(false)
      } catch (error) {
        const risk = riskOf(error)
        if (!risk) throw error
        const ports = risk.ports.map((p) => `${p.port} (${t(`firewall.reason.${p.reason}`)})`).join(', ')
        const ok = await alertLib.confirm(t('firewall.risk.title'), t('firewall.risk.message', { ports }), t('firewall.risk.confirm'), t('common.cancel'), 'warning', 'firewall')
        if (!ok) return false
        next = await send(true)
      }
      qc.setQueryData(KEY, next)
      toast.success(done)
      return true
    } catch (error) {
      alertLib.fire(t('firewall.failed'), apiError(error, t('firewall.failedHint')), 'error', 'firewall')
      return false
    } finally {
      setBusy(null)
    }
  }

  return {
    t,
    query,
    data: query.data,
    section,
    setSection,
    ruleDraft,
    setRuleDraft,
    busy,
    enable: () => change('enable', () => enableFirewall(), t('firewall.enabled')),
    disable: async () => {
      const ok = await alertLib.confirm(t('firewall.disableTitle'), t('firewall.disableMessage'), t('firewall.disable'), t('common.cancel'), 'warning', 'firewall')
      return ok ? change('disable', () => disableFirewall(), t('firewall.disabled')) : false
    },
    reload: () => change('reload', () => reloadFirewall(), t('firewall.reloaded')),
    setDefault: (direction: PolicyDirection, policy: Policy) => change('default', (confirm) => setFirewallDefault(direction, policy, confirm), t('firewall.policySaved')),
    setLogging: (level: LoggingLevel) => change('logging', () => setFirewallLogging(level), t('firewall.loggingSaved')),
    addRule: (spec: RuleSpec) => change('add', (confirm) => addFirewallRule(spec, confirm), t('firewall.ruleAdded')),
    deleteRule: async (rule: FirewallRule) => {
      const ok = await alertLib.confirm(
        t('firewall.deleteTitle'),
        t('firewall.deleteMessage', { rule: `${rule.to} ${rule.action} ${rule.from}` }),
        t('common.delete'),
        t('common.cancel'),
        'warning',
        'firewall',
      )
      return ok ? change(`rule:${rule.number}`, (confirm) => deleteFirewallRule(rule, confirm), t('firewall.ruleDeleted')) : false
    },
  }
}

export type FirewallWindowState = ReturnType<typeof useFirewallWindow>
