import { KeyRound, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { openCloudflareSettings, useCanOpenCloudflareSettings } from './openCloudflareSettings'

interface CfPermissionNoticeProps {
  title: string
  hint: string
  rawError?: string
}

// Inset warning strip shown when a token lacks an optional Bot Management or WAF scope.
export function CfPermissionNotice({ title, hint, rawError }: CfPermissionNoticeProps) {
  const { t } = useI18n()
  const canOpenSettings = useCanOpenCloudflareSettings()

  return (
    <div role="alert" className="cloudflare-perm-notice">
      <div className="flex items-start gap-2.5 min-w-0 flex-1 basis-[14rem]">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <div className="min-w-0 space-y-0.5">
          <p className="text-[12px] font-semibold leading-snug">{title}</p>
          <p className="text-[11.5px] opacity-90 leading-snug">{hint}</p>
          {rawError ? (
            <p className="panel-mono text-[10.5px] opacity-75 truncate" title={rawError}>
              {rawError}
            </p>
          ) : null}
        </div>
      </div>
      {canOpenSettings ? (
        <Button
          size="sm"
          variant="outline"
          icon={<KeyRound className="h-3.5 w-3.5" />}
          onClick={openCloudflareSettings}
          className="shrink-0 mobile:w-full"
        >
          {t('tunnels.security.openSettings')}
        </Button>
      ) : null}
    </div>
  )
}
