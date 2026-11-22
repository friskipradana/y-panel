import { useState } from 'react'
import { ShieldPlus } from 'lucide-react'
import type { RuleSpec } from '@/api/firewall'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { FirewallWindowState } from './useFirewallWindow'

const EMPTY: RuleSpec = { action: 'allow', direction: 'in', proto: 'tcp', port: '', from: '', comment: '' }

// A new rule: what to do, for which traffic, from where. Opens empty, or filled in from a port of the list.
export function RuleModal({ fw }: { fw: FirewallWindowState }) {
  const { ruleDraft } = fw
  if (!ruleDraft) return null
  return <RuleDialog key={JSON.stringify(ruleDraft)} fw={fw} initial={{ ...EMPTY, ...ruleDraft }} />
}

function RuleDialog({ fw, initial }: { fw: FirewallWindowState; initial: RuleSpec }) {
  const { t, setRuleDraft, addRule, busy } = fw
  const [spec, setSpec] = useState<RuleSpec>(initial)
  const set = <K extends keyof RuleSpec>(key: K, value: RuleSpec[K]) => setSpec((s) => ({ ...s, [key]: value }))
  const pending = busy === 'add'
  const ready = (spec.port.trim() !== '' || spec.from.trim() !== '') && (spec.proto === 'any' || spec.port.trim() !== '')

  const submit = async () => {
    if (!ready || pending) return
    if (await addRule({ ...spec, port: spec.port.trim(), from: spec.from.trim(), comment: spec.comment.trim() })) setRuleDraft(null)
  }

  return (
    <Modal
      open
      onClose={() => setRuleDraft(null)}
      title={t('firewall.rule.title')}
      subtitle={t('firewall.rule.subtitle')}
      icon={<ShieldPlus />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => setRuleDraft(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form="firewall-rule-form" disabled={!ready} loading={pending}>{t('firewall.rule.submit')}</Button>
        </>
      }
    >
      <form
        id="firewall-rule-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('firewall.rule.action')} htmlFor="fw-action">
            <Select
              id="fw-action"
              value={spec.action}
              onChange={(v) => set('action', v as RuleSpec['action'])}
              options={(['allow', 'deny', 'reject', 'limit'] as const).map((a) => ({ value: a, label: t(`firewall.action.${a}`), description: t(`firewall.actionHint.${a}`) }))}
            />
          </Field>
          <Field label={t('firewall.rule.direction')} htmlFor="fw-direction">
            <Select
              id="fw-direction"
              value={spec.direction}
              onChange={(v) => set('direction', v as RuleSpec['direction'])}
              options={(['in', 'out'] as const).map((d) => ({ value: d, label: t(`firewall.direction.${d}`) }))}
            />
          </Field>
          <Field label={t('firewall.rule.proto')} htmlFor="fw-proto">
            <Select
              id="fw-proto"
              value={spec.proto}
              onChange={(v) => set('proto', v as RuleSpec['proto'])}
              options={(['tcp', 'udp', 'any'] as const).map((p) => ({ value: p, label: p === 'any' ? t('firewall.rule.anyProto') : p.toUpperCase() }))}
            />
          </Field>
        </div>
        <Field label={t('firewall.rule.port')} htmlFor="fw-port" hint={t('firewall.rule.portHint')}>
          <TextInput id="fw-port" mono value={spec.port} placeholder="80  |  8000:8100" spellCheck={false} onChange={(e) => set('port', e.target.value)} />
        </Field>
        <Field label={t('firewall.rule.from')} htmlFor="fw-from" hint={t('firewall.rule.fromHint')}>
          <TextInput id="fw-from" mono value={spec.from} placeholder="203.0.113.7  |  10.0.0.0/24" spellCheck={false} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label={t('firewall.rule.comment')} htmlFor="fw-comment">
          <TextInput id="fw-comment" value={spec.comment} maxLength={60} onChange={(e) => set('comment', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
