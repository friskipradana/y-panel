import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { listHostingDomains, setHostingDomain } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { Field } from '@/components/ui/Field'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The domains buyers may take subdomains under. The domains of the superadmin's Cloudflare account
// are picked from a list (an account can hold many); only the ones offered are shown below it.
export function HostingDomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })
  const [pick, setPick] = useState('')

  const toggle = useMutation({
    mutationFn: ({ zoneId, enabled }: { zoneId: string; enabled: boolean }) => setHostingDomain(zoneId, enabled),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['hosting', 'domains'] })
      void qc.invalidateQueries({ queryKey: ['my-subdomains'] })
      if (vars.enabled) setPick('')
      toast.success(t('hosting.domains.saved'))
    },
    onError: (error) => toast.error(apiError(error, t('hosting.domains.saveFailed'))),
  })

  const all = domains.data ?? []
  const offered = all.filter((domain) => domain.enabled)
  const addable = all.filter((domain) => !domain.enabled)

  return (
    <div className="panel-shell-card flex flex-col gap-4 p-4.5">
      <SectionHeader icon={<Globe2 />} title={t('hosting.domains.title')} subtitle={t('hosting.domains.subtitle')} />

      {domains.isLoading ? (
        <LoadingState>{t('hosting.domains.loading')}</LoadingState>
      ) : domains.isError ? (
        <ErrorState title={t('hosting.domains.loadFailed')} hint={apiError(domains.error, t('hosting.domains.loadFailedHint'))} />
      ) : all.length === 0 ? (
        <EmptyState icon={<Globe2 size={18} />}>{t('hosting.domains.empty')}</EmptyState>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label={t('hosting.domains.addLabel')} hint={addable.length === 0 ? t('hosting.domains.allOffered') : t('hosting.domains.addHint', { count: addable.length })}>
              <Select
                value={pick}
                onChange={setPick}
                searchable
                disabled={addable.length === 0}
                placeholder={t('hosting.domains.pick')}
                searchPlaceholder={t('hosting.domains.search')}
                options={addable.map((domain) => ({ value: domain.zoneId, label: domain.name, description: domain.status && domain.status !== 'active' ? domain.status : undefined }))}
              />
            </Field>
            <Button
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={pick === ''}
              loading={toggle.isPending}
              onClick={() => toggle.mutate({ zoneId: pick, enabled: true })}
            >
              {t('hosting.domains.offer')}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.domains.offeredTitle', { count: offered.length })}</p>
            {offered.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--win-border)] p-3 text-[12px] text-[var(--text-secondary)]">{t('hosting.domains.noneOffered')}</p>
            ) : (
              offered.map((domain) => (
                <EntityRow
                  key={domain.zoneId}
                  centered
                  leading={<IconBadge tone="primary"><Globe2 /></IconBadge>}
                  title={<span className="panel-mono">{domain.name}</span>}
                  badges={domain.status && domain.status !== 'active' ? <Badge tone="warning">{domain.status}</Badge> : undefined}
                  subtitle={t('hosting.domains.example', { name: domain.name })}
                  actions={
                    <IconButton label={t('hosting.domains.stop', { name: domain.name })} tone="danger" disabled={toggle.isPending} onClick={() => toggle.mutate({ zoneId: domain.zoneId, enabled: false })}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  }
                />
              ))
            )}
            {offered.length > 0 ? <p className="text-[11.5px] text-[var(--text-secondary)]">{t('hosting.domains.stopHint')}</p> : null}
          </div>
        </>
      )}
    </div>
  )
}
