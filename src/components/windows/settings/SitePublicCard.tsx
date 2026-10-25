import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, LayoutTemplate, Search } from 'lucide-react'
import { toast } from 'sonner'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/api/system'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

// Superadmin switches for the public pages: do they exist, and may crawlers index them
export function SitePublicCard({ bare = false }: { bare?: boolean } = {}) {
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
    <div className={bare ? "flex flex-col gap-2.5" : "panel-shell-card settings-card !p-3.5 !gap-2.5"}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('settings.site.title')}</h2>
        </div>
        <span className="text-[11px] text-[var(--text-secondary)]">{t('settings.site.subtitle')}</span>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <SettingRow
          title={t('settings.site.landingTitle')}
          description={data?.landingEnabled === false ? t('settings.site.landingOff') : t('settings.site.landingOn')}
          icon={<LayoutTemplate className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} />}
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
          icon={<Search className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} />}
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
    </div>
  )
}
