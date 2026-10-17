import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, LayoutTemplate, Search } from 'lucide-react'
import { toast } from 'sonner'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/api/system'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

// Superadmin switches for the public pages: do they exist, and may crawlers index them
export function SitePublicCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })

  const mutation = useMutation({
    mutationFn: (patch: Partial<SiteSettings>) => setSiteSettings(patch),
    onSuccess: (data) => {
      qc.setQueryData(['settings', 'site'], data)
      void qc.invalidateQueries({ queryKey: ['public-site'] })
      toast.success(t('settings.site.saved'))
    },
    onError: () => toast.error(t('settings.site.failed')),
  })

  const data = query.data
  const busy = !data || mutation.isPending

  return (
    <div className="panel-shell-card flex flex-col gap-4 p-4.5">
      <SectionHeader icon={<Globe2 />} title={t('settings.site.title')} subtitle={t('settings.site.subtitle')} />

      <SettingRow
        title={t('settings.site.landingTitle')}
        description={data?.landingEnabled === false ? t('settings.site.landingOff') : t('settings.site.landingOn')}
        icon={<LayoutTemplate />}
        control={
          <ToggleSwitch
            checked={data?.landingEnabled ?? true}
            disabled={busy}
            label={t('settings.site.landingTitle')}
            onChange={() => mutation.mutate({ landingEnabled: !(data?.landingEnabled ?? true) })}
          />
        }
      />

      <SettingRow
        title={t('settings.site.indexingTitle')}
        description={
          data?.landingEnabled === false
            ? t('settings.site.indexingNeedsLanding')
            : data?.indexingEnabled === false
              ? t('settings.site.indexingOff')
              : t('settings.site.indexingOn')
        }
        icon={<Search />}
        control={
          <ToggleSwitch
            checked={(data?.indexingEnabled ?? true) && data?.landingEnabled !== false}
            disabled={busy || data?.landingEnabled === false}
            label={t('settings.site.indexingTitle')}
            onChange={() => mutation.mutate({ indexingEnabled: !(data?.indexingEnabled ?? true) })}
          />
        }
      />
    </div>
  )
}
