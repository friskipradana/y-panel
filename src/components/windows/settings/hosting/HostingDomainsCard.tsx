import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2 } from 'lucide-react'
import { toast } from 'sonner'
import { listHostingDomains, setHostingDomain } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The domains of the superadmin's Cloudflare account, and which of them buyers may take subdomains under
export function HostingDomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })

  const toggle = useMutation({
    mutationFn: ({ zoneId, enabled }: { zoneId: string; enabled: boolean }) => setHostingDomain(zoneId, enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting', 'domains'] })
      void qc.invalidateQueries({ queryKey: ['my-subdomains'] })
      toast.success(t('hosting.domains.saved'))
    },
    onError: (error) => toast.error(apiError(error, t('hosting.domains.saveFailed'))),
  })

  return (
    <div className="panel-shell-card flex flex-col gap-4 p-4.5">
      <SectionHeader icon={<Globe2 />} title={t('hosting.domains.title')} subtitle={t('hosting.domains.subtitle')} />

      {domains.isLoading ? (
        <LoadingState>{t('hosting.domains.loading')}</LoadingState>
      ) : domains.isError ? (
        <ErrorState title={t('hosting.domains.loadFailed')} hint={apiError(domains.error, t('hosting.domains.loadFailedHint'))} />
      ) : domains.data && domains.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          {domains.data.map((domain) => (
            <SettingRow
              key={domain.zoneId}
              title={domain.name}
              description={domain.enabled ? t('hosting.domains.on') : t('hosting.domains.off')}
              icon={<Globe2 />}
              tone={domain.enabled ? 'primary' : 'neutral'}
              control={
                <div className="flex items-center gap-3">
                  {domain.status && domain.status !== 'active' ? <Badge tone="warning">{domain.status}</Badge> : null}
                  <ToggleSwitch
                    checked={domain.enabled}
                    disabled={toggle.isPending}
                    label={t('hosting.domains.toggle', { name: domain.name })}
                    onChange={() => toggle.mutate({ zoneId: domain.zoneId, enabled: !domain.enabled })}
                  />
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Globe2 size={18} />}>{t('hosting.domains.empty')}</EmptyState>
      )}
    </div>
  )
}
