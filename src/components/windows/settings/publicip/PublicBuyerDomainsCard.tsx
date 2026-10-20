import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { getPublicProxy, setPublicProxy } from '@/api/publicProxy'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

const apiError = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
  return message ? (localizeServerMessage(message) ?? message) : fallback
}

// The domains of buyers served by this server: instead of Cloudflare for SaaS, a buyer proves the domain with a TXT record,
// points it here, and the certificate is made by the proxy. The seller names the address buyers point at.
export function PublicBuyerDomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['public-proxy'], queryFn: getPublicProxy, retry: 0 })
  const [target, setTarget] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (body: { buyerDomains?: boolean; target?: string }) => setPublicProxy(body),
    onSuccess: (next) => {
      qc.setQueryData(['public-proxy'], next)
      setTarget(null)
      toast.success(t('publicip.saved'))
    },
    onError: (e) => toast.error(apiError(e, t('publicip.saveFailed'))),
  })

  const data = status.data
  if (!data) return null
  const suggestion = data.addresses.find((a) => a.public)?.ip ?? ''
  const value = target ?? (data.target || suggestion)
  const dirty = value.trim() !== data.target
  const live = data.buyerDomains && data.running && data.target !== ''

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Users />}
        title={t('publicip.buyers.title')}
        subtitle={t('publicip.buyers.subtitle')}
        tone="primary"
        className="mb-0"
        actions={live ? <Badge tone="success" dot>{t('publicip.buyers.live')}</Badge> : <Badge tone="neutral" dot>{t('publicip.state.off')}</Badge>}
      />
      <Field label={t('publicip.buyers.target')} hint={t('publicip.buyers.targetHint')}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <TextInput mono value={value} placeholder={t('publicip.buyers.targetPlaceholder')} autoComplete="off" onChange={(e) => setTarget(e.target.value)} />
          </div>
          <Button variant="outline" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ target: value.trim() })}>
            {t('common.save')}
          </Button>
        </div>
      </Field>
      <SettingRow
        title={t('publicip.buyers.toggle')}
        description={t('publicip.buyers.toggleHint')}
        control={
          <ToggleSwitch
            checked={data.buyerDomains}
            disabled={save.isPending || (!data.buyerDomains && data.target === '' && value.trim() === '')}
            label={t('publicip.buyers.toggle')}
            // the address in the field is saved together with the switch, so one press is enough
            onChange={() => save.mutate({ buyerDomains: !data.buyerDomains, ...(!data.buyerDomains && value.trim() !== data.target ? { target: value.trim() } : {}) })}
          />
        }
      />
      {data.buyerDomains && !data.running ? <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('publicip.buyers.needsProxy')}</p> : null}
    </div>
  )
}
