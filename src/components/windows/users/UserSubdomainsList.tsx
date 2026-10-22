import { useQuery } from '@tanstack/react-query'
import { listAllSubdomains, type SubdomainStatus } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/lib/i18n'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

// The subdomains an account holds, read-only; the Subdomains card in the Hosting window manages them
export function UserSubdomainsList({ userId }: { userId: number }) {
  const { t } = useI18n()
  const all = useQuery({ queryKey: ['hosting', 'subdomains'], queryFn: listAllSubdomains, staleTime: 15_000, retry: 0 })
  const mine = (all.data ?? []).filter((row) => row.userId === userId)
  if (mine.length === 0) return null
  return (
    <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]" aria-label={t('hosting.users.subdomainsOfAccount')}>
      {mine.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
          <span className="panel-mono font-semibold">{row.hostname}</span>
          <Badge tone={TONE[row.status]} dot>{t(`hosting.sub.status.${row.status}`)}</Badge>
          {row.note ? <span className="text-[11.5px] text-[var(--text-secondary)]">{row.note}</span> : null}
        </li>
      ))}
    </ul>
  )
}
