import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'
import { createCloudflareWafRule, type CreateWafRulePayload } from '@/api/cloudflare'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { cfErrDesc, splitCommaList } from './tunnelForms'

interface WafRuleModalProps {
  zoneId: string
  zoneName?: string
  onClose: () => void
}

// Structured builder for custom Cloudflare WAF rules without raw expression injection.
export function WafRuleModal({ zoneId, zoneName, onClose }: WafRuleModalProps) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const [description, setDescription] = useState('')
  const [action, setAction] = useState<CreateWafRulePayload['action']>('skip')
  const [combineWith, setCombineWith] = useState<'and' | 'or'>('and')
  const [hostname, setHostname] = useState(zoneName ? `panel.${zoneName}` : '')
  const [pathMatchMode, setPathMatchMode] = useState<'starts_with' | 'eq' | 'contains'>('starts_with')
  const [pathValue, setPathValue] = useState('')
  const [userAgentsText, setUserAgentsText] = useState('')
  const [countriesText, setCountriesText] = useState('')
  const [sourceIpsText, setSourceIpsText] = useState('')
  const [includeVerifiedBots, setIncludeVerifiedBots] = useState(false)

  const createMut = useMutation({
    mutationFn: () =>
      createCloudflareWafRule(zoneId, {
        description: description.trim() || undefined,
        action,
        combineWith,
        hostname: hostname.trim() || undefined,
        pathValue: pathValue.trim() || undefined,
        pathMatchMode,
        userAgents: splitCommaList(userAgentsText),
        countries: splitCommaList(countriesText).map((c) => c.toUpperCase()),
        sourceIps: splitCommaList(sourceIpsText),
        includeVerifiedBots,
        enabled: true,
      }),
    onSuccess: () => {
      toast.success(t('tunnels.security.ruleCreated'))
      void qc.invalidateQueries({ queryKey: ['cloudflare-zone-security', zoneId] })
      onClose()
    },
    onError: (e: unknown) => toast.error(t('tunnels.security.ruleCreateFailed'), { description: cfErrDesc(e) }),
  })

  const hasCondition =
    !!hostname.trim() ||
    !!pathValue.trim() ||
    splitCommaList(userAgentsText).length > 0 ||
    splitCommaList(countriesText).length > 0 ||
    splitCommaList(sourceIpsText).length > 0 ||
    includeVerifiedBots

  return (
    <Modal
      open
      onClose={onClose}
      title={t('tunnels.security.modalTitle')}
      subtitle={zoneName || t('tunnels.security.modalSubtitle')}
      icon={<Shield />}
      size="md"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!hasCondition || createMut.isPending}
            loading={createMut.isPending}
            variant="primary"
          >
            {t('tunnels.security.saveRule')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label={t('tunnels.security.ruleDesc')}>
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('tunnels.security.ruleDescPlaceholder')}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('tunnels.security.ruleAction')}>
            <Select
              value={action}
              onChange={(v) => setAction(v as CreateWafRulePayload['action'])}
              options={[
                { value: 'skip', label: t('tunnels.security.action.skip') },
                { value: 'managed_challenge', label: t('tunnels.security.action.managed_challenge') },
                { value: 'js_challenge', label: t('tunnels.security.action.js_challenge') },
                { value: 'block', label: t('tunnels.security.action.block') },
                { value: 'log', label: t('tunnels.security.action.log') },
              ]}
            />
          </Field>

          <Field label={t('tunnels.security.combineWith')}>
            <Select
              value={combineWith}
              onChange={(v) => setCombineWith(v as 'and' | 'or')}
              options={[
                { value: 'and', label: t('tunnels.security.combineAnd') },
                { value: 'or', label: t('tunnels.security.combineOr') },
              ]}
            />
          </Field>
        </div>

        <Field label={t('tunnels.security.filterHost')}>
          <TextInput
            mono
            value={hostname}
            autoComplete="off"
            onChange={(e) => setHostname(e.target.value)}
            placeholder={t('tunnels.security.filterHostPlaceholder')}
          />
        </Field>

        <Field label={t('tunnels.security.filterPath')}>
          <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] mobile:grid-cols-1">
            <Select
              value={pathMatchMode}
              onChange={(v) => setPathMatchMode(v as 'starts_with' | 'eq' | 'contains')}
              options={[
                { value: 'starts_with', label: t('tunnels.security.pathMode.starts_with') },
                { value: 'eq', label: t('tunnels.security.pathMode.eq') },
                { value: 'contains', label: t('tunnels.security.pathMode.contains') },
              ]}
            />
            <TextInput
              mono
              value={pathValue}
              autoComplete="off"
              onChange={(e) => setPathValue(e.target.value)}
              placeholder={t('tunnels.security.filterPathPlaceholder')}
            />
          </div>
        </Field>

        <Field label={t('tunnels.security.filterAgents')}>
          <TextInput
            mono
            value={userAgentsText}
            autoComplete="off"
            onChange={(e) => setUserAgentsText(e.target.value)}
            placeholder={t('tunnels.security.filterAgentsPlaceholder')}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('tunnels.security.filterCountries')}>
            <TextInput
              mono
              value={countriesText}
              autoComplete="off"
              onChange={(e) => setCountriesText(e.target.value)}
              placeholder={t('tunnels.security.filterCountriesPlaceholder')}
            />
          </Field>
          <Field label={t('tunnels.security.filterIps')}>
            <TextInput
              mono
              value={sourceIpsText}
              autoComplete="off"
              onChange={(e) => setSourceIpsText(e.target.value)}
              placeholder={t('tunnels.security.filterIpsPlaceholder')}
            />
          </Field>
        </div>

        <Checkbox
          checked={includeVerifiedBots}
          onChange={setIncludeVerifiedBots}
          label={t('tunnels.security.presetVerifiedBots')}
        />

        {!hasCondition ? (
          <p className="text-[11.5px] text-[var(--text-secondary)]">{t('tunnels.security.filterHint')}</p>
        ) : null}
      </div>
    </Modal>
  )
}
