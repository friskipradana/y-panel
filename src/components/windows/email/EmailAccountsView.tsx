import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Forward, Inbox, Mail, Pencil, Power, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { deleteEmailAccount, updateEmailAccount, type EmailAccount } from '@/api/email'
import { DateTimeText } from '@/components/common/DateTimeText'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

interface EmailAccountsViewProps {
  items: EmailAccount[]
  loading: boolean
  error: boolean
  hasFilter: boolean
  isDemo: boolean
  onEdit: (account: EmailAccount) => void
}

const getApiError = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ? (localizeServerMessage(msg) ?? msg) : fallback
}

export function EmailAccountsView({
  items,
  loading,
  error,
  hasFilter,
  isDemo,
  onEdit,
}: EmailAccountsViewProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['email-accounts'] })
    void qc.invalidateQueries({ queryKey: ['email-overview'] })
  }

  const toggleMut = useMutation({
    mutationFn: (row: EmailAccount) => updateEmailAccount(row.id, { enabled: !row.enabled }),
    onSuccess: refresh,
    onError: (err) => toast.error(getApiError(err, t('email.account.saveFailed'))),
  })

  const deleteMut = useMutation({
    mutationFn: (row: EmailAccount) => deleteEmailAccount(row.id),
    onSuccess: () => {
      refresh()
      toast.success(t('email.account.deleted'))
    },
    onError: (err) => toast.error(getApiError(err, t('email.account.deleteFailed'))),
  })

  const handleCopy = async (row: EmailAccount) => {
    try {
      await navigator.clipboard.writeText(row.address)
      setCopiedId(row.id)
      window.setTimeout(() => setCopiedId((curr) => (curr === row.id ? null : curr)), 1600)
    } catch {
      // ignore clipboard errors
    }
  }

  const handleDelete = async (row: EmailAccount) => {
    const confirmed = await alertLib.confirm(
      t('email.account.deleteTitle'),
      t('email.account.deleteMessage', { address: row.address }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      'email',
    )
    if (confirmed) {
      deleteMut.mutate(row)
    }
  }

  return (
    <ListTable
      variant="public-routes"
      empty={loading || error || items.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('email.col.address') },
        { label: t('email.col.targetQuota') },
        { label: t('common.status') },
        { label: t('settings.tokens.col.created') },
        { label: t('hosting.col.actions'), actions: true },
      ]}
    >
      <ListState
        loading={loading}
        error={error}
        errorTitle={t('email.accounts.loadFailed')}
        errorHint={t('settings.payment.loadFailedHint')}
        loadingText={t('email.accounts.loading')}
        empty={items.length === 0}
        emptyIcon={<Mail />}
        emptyTitle={hasFilter ? t('docker.noResults') : t('email.accounts.empty')}
        emptyHint={hasFilter ? undefined : t('email.accounts.emptyHint')}
      >
        {items.map((row, idx) => {
          const subtitle =
            row.displayName ||
            row.note ||
            (row.mode === 'forward' ? t('email.mode.forward') : t('email.mode.mailbox'))
          const metaLine =
            row.mode === 'forward'
              ? `${t('email.mode.forward')} · ${row.forwardTo}`
              : `${t('email.mode.mailbox')} · ${row.quotaMb} MB`

          return (
            <div className="docker-row" key={row.id}>
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon>
                  {row.mode === 'forward' ? (
                    <Forward className="h-3.5 w-3.5" />
                  ) : (
                    <Inbox className="h-3.5 w-3.5" />
                  )}
                </ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name docker-app-name--mono" title={row.address}>
                    {row.address}
                  </span>
                  <span className="docker-row__sub" title={subtitle}>
                    {subtitle}
                  </span>
                  <span className="docker-row__meta">{metaLine}</span>
                </div>
              </div>
              <div className="docker-cell">
                {row.mode === 'forward' ? (
                  <span className="panel-mono text-[0.75rem]" title={row.forwardTo}>
                    {row.forwardTo}
                  </span>
                ) : (
                  <span className="panel-mono text-[0.75rem]">{row.quotaMb} MB</span>
                )}
              </div>
              <div className="docker-cell--keep">
                <span className={`docker-status-pill docker-status-pill--${row.enabled ? 'running' : 'exited'}`}>
                  <span className="docker-status-dot" />
                  <span>{row.enabled ? t('email.settings.statusActive') : t('email.settings.statusInactive')}</span>
                </span>
              </div>
              <div className="docker-cell">
                <DateTimeText value={row.createdAt} />
              </div>
              <div className="docker-action-btns">
                <button
                  type="button"
                  className="docker-act-btn"
                  title={t('common.copy')}
                  aria-label={t('common.copy')}
                  onClick={() => void handleCopy(row)}
                >
                  {copiedId === row.id ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </button>
                {!isDemo && (
                  <>
                    <button
                      type="button"
                      className="docker-act-btn"
                      title={row.enabled ? t('publicip.route.switchOff') : t('publicip.route.switchOn')}
                      aria-label={row.enabled ? t('publicip.route.switchOff') : t('publicip.route.switchOn')}
                      disabled={toggleMut.isPending}
                      onClick={() => toggleMut.mutate(row)}
                    >
                      <Power className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="docker-act-btn"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                      onClick={() => onEdit(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="docker-act-btn docker-act-btn--danger"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                      disabled={deleteMut.isPending}
                      onClick={() => void handleDelete(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </ListState>
    </ListTable>
  )
}
