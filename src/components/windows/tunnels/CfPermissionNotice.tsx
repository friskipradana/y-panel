import { KeyRound, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { openCloudflareSettings, useCanOpenCloudflareSettings } from './openCloudflareSettings'

interface CfPermissionNoticeProps {
  title: string
  hint: string
  rawError?: string
}

// Non-fatal warning notice shown when a token lacks an optional Bot Management or WAF scope.
export function CfPermissionNotice({ title, hint, rawError }: CfPermissionNoticeProps) {
  const { t } = useI18n()
  const canOpenSettings = useCanOpenCloudflareSettings()

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[var(--panel-warning-border)] bg-[var(--panel-warning-bg)] p-3.5 text-[var(--panel-warning-text)]"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <div className="min-w-0 space-y-1">
          <p className="text-[12.5px] font-semibold">{title}</p>
          <p className="text-[11.5px] opacity-90 leading-relaxed">{hint}</p>
          {rawError ? <p className="panel-mono text-[11px] opacity-80 break-all">{rawError}</p> : null}
        </div>
      </div>
      {canOpenSettings ? (
        <Button
          size="sm"
          variant="outline"
          icon={<KeyRound className="h-3.5 w-3.5" />}
          onClick={openCloudflareSettings}
          className="shrink-0 self-start sm:self-center"
        >
          {t('tunnels.security.openSettings')}
        </Button>
      ) : null}
    </div>
  )
}
