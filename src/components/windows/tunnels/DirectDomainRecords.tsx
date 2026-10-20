import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { IconButton } from '@/components/ui/IconButton'
import { addressRecordType, VERIFY_LABEL, VERIFY_PREFIX } from '@/lib/directDomain'
import { useI18n } from '@/lib/i18n'

function Line({ type, name, value }: { type: string; name: string; value: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-2.5 py-1.5">
      <p className="panel-mono min-w-0 break-all text-[0.75rem]">
        <span className="font-semibold">{type}</span>
        {'  '}
        {name}
        {'  '}
        <span className="text-[var(--text-secondary)]">&rarr;</span>
        {'  '}
        {value}
      </p>
      <IconButton label={t('hosting.custom.copyRecord')} onClick={() => void copyTextToClipboard(value).then(() => toast.success(t('hosting.custom.recordCopied')))}>
        <Copy className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

// The records a buyer creates in the DNS of a domain that this server serves: where it points, and the proof that it is theirs
export function DirectDomainRecords({ hostname, target, token }: { hostname: string; target: string; token?: string }) {
  const { t } = useI18n()
  return (
    <div className="space-y-1.5">
      <p className="text-[0.75rem] font-medium">{t('hosting.custom.records')}</p>
      <Line type={addressRecordType(target)} name={hostname} value={target} />
      {token ? <Line type="TXT" name={`${VERIFY_LABEL}.${hostname}`} value={`${VERIFY_PREFIX}${token}`} /> : <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('hosting.custom.txtAfter')}</p>}
    </div>
  )
}
