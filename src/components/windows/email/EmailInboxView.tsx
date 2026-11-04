import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Mail,
  MailCheck,
  RefreshCw,
  Reply,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  deleteInboxMessage,
  listInboxMessages,
  markInboxMessageRead,
  syncInboxMessages,
  type EmailInboxMessage,
} from '@/api/email'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DateTimeText } from '@/components/common/DateTimeText'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

interface EmailInboxViewProps {
  onReply: (info: { to: string; subject: string }) => void
}

const getApiError = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ? (localizeServerMessage(msg) ?? msg) : fallback
}

export function EmailInboxView({ onReply }: EmailInboxViewProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const isMobile = useIsMobileLayout()

  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'sent'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const inboxQuery = useQuery({
    queryKey: ['email-inbox'],
    queryFn: () => listInboxMessages({ limit: 50 }),
  })

  const messages = inboxQuery.data?.items ?? []

  const syncMut = useMutation({
    mutationFn: syncInboxMessages,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['email-inbox'] })
      toast.success(t('email.inbox.syncSuccess', { count: res.synced }))
    },
    onError: (err) => toast.error(getApiError(err, t('email.inbox.syncFailed'))),
  })

  const markReadMut = useMutation({
    mutationFn: ({ id, isRead }: { id: number; isRead: boolean }) =>
      markInboxMessageRead(id, isRead),
    onSuccess: (_, { id, isRead }) => {
      qc.setQueryData(['email-inbox'], (old: { items?: EmailInboxMessage[]; total?: number; unread?: number } | undefined) => {
        if (!old?.items) return old
        const nextItems = old.items.map((m) => (m.id === id ? { ...m, isRead } : m))
        return { ...old, items: nextItems, unread: nextItems.filter((m) => !m.isRead).length }
      })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInboxMessage(id),
    onSuccess: (_, id) => {
      qc.setQueryData(['email-inbox'], (old: { items?: EmailInboxMessage[]; total?: number; unread?: number } | undefined) => {
        if (!old?.items) return old
        const nextItems = old.items.filter((m) => m.id !== id)
        return { ...old, items: nextItems, total: Math.max(0, (old.total ?? 1) - 1), unread: nextItems.filter((m) => !m.isRead).length }
      })
      if (selectedId === id) setSelectedId(null)
      toast.success(t('email.inbox.deleted'))
    },
    onError: (err) => toast.error(getApiError(err, t('email.inbox.deleteFailed'))),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return messages.filter((m) => {
      if (filterMode === 'unread' && m.isRead) return false
      if (filterMode === 'sent' && m.direction !== 'outbound') return false
      if (!q) return true
      return (
        m.subject.toLowerCase().includes(q) ||
        m.fromAddr.toLowerCase().includes(q) ||
        m.fromName.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q)
      )
    })
  }, [messages, filterMode, search])

  const selectedMessage = useMemo(() => {
    if (!selectedId) return filtered[0] ?? null
    return messages.find((m) => m.id === selectedId) ?? filtered[0] ?? null
  }, [selectedId, messages, filtered])

  const handleSelect = (msg: EmailInboxMessage) => {
    setSelectedId(msg.id)
    if (!msg.isRead) markReadMut.mutate({ id: msg.id, isRead: true })
  }

  const handleReplyClick = (msg: EmailInboxMessage) => {
    const subj = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`
    onReply({ to: msg.fromAddr, subject: subj })
  }

  if (inboxQuery.isLoading) return <LoadingState>{t('common.loading')}</LoadingState>
  if (inboxQuery.isError) {
    return (
      <div className="p-4">
        <ErrorState title={t('email.accounts.loadFailed')} hint={t('settings.payment.loadFailedHint')} />
      </div>
    )
  }

  if (isMobile && selectedId && selectedMessage) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-[var(--win-bg)] p-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--win-border)]">
          <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setSelectedId(null)}>
            {t('common.back')}
          </Button>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" icon={<Reply className="h-3.5 w-3.5" />} onClick={() => handleReplyClick(selectedMessage)}>
              {t('email.inbox.reply')}
            </Button>
            <Button type="button" variant="outline" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => deleteMut.mutate(selectedMessage.id)}>
              {t('email.inbox.delete')}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pt-3 space-y-3">
          <h2 className="text-base font-bold text-[var(--win-text)]">{selectedMessage.subject || t('common.noContent')}</h2>
          <div className="panel-muted-block p-2.5 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--win-text)]">{selectedMessage.fromName || selectedMessage.fromAddr}</span>
              <span className="text-[var(--text-secondary)] text-[11px]"><DateTimeText value={selectedMessage.receivedAt} /></span>
            </div>
            <div className="text-[var(--text-secondary)] font-mono text-[11px]">{selectedMessage.fromAddr}</div>
          </div>
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--win-text)] font-sans">{selectedMessage.bodyText || selectedMessage.snippet}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--win-bg)]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-[var(--win-border)] bg-[var(--panel-surface)] shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Button type="button" variant={filterMode === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilterMode('all')}>
            {t('email.inbox.filterAll')}
          </Button>
          <Button type="button" variant={filterMode === 'unread' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilterMode('unread')}>
            {t('email.inbox.filterUnread')}
            {(inboxQuery.data?.unread ?? 0) > 0 && (
              <Badge tone="primary" className="ml-1 px-1.5 py-0 text-[10px]">{inboxQuery.data?.unread}</Badge>
            )}
          </Button>
          <Button type="button" variant={filterMode === 'sent' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilterMode('sent')}>
            {t('email.inbox.filterSent')}
          </Button>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <SearchInput className="w-48 sm:w-60" value={search} onChange={setSearch} placeholder={t('email.inbox.search')} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={syncMut.isPending || inboxQuery.isFetching}
            onClick={() => syncMut.mutate()}
          >
            {isMobile ? undefined : t('email.inbox.sync')}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-full sm:w-[320px] md:w-[360px] flex flex-col border-r border-[var(--win-border)] overflow-y-auto shrink-0 divide-y divide-[var(--win-border)]">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<Mail className="h-5 w-5" />}>
                {t('email.inbox.empty')}
              </EmptyState>
            </div>
          ) : (
            filtered.map((msg) => {
              const isSelected = selectedMessage?.id === msg.id
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => handleSelect(msg)}
                  className={`w-full p-3 text-left transition-colors flex flex-col gap-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--panel-primary-bg)] ${
                    isSelected ? 'bg-[var(--panel-surface-hover)]' : 'hover:bg-[var(--panel-surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {!msg.isRead && <span className="h-2 w-2 rounded-full bg-[var(--panel-primary-text)] shrink-0" aria-label={t('email.inbox.filterUnread')} />}
                      <span className={`truncate text-[12.5px] ${!msg.isRead ? 'font-bold text-[var(--win-text)]' : 'font-medium text-[var(--text-secondary)]'}`}>
                        {msg.fromName || msg.fromAddr}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--text-secondary)]"><DateTimeText value={msg.receivedAt} /></span>
                  </div>
                  <div className={`truncate text-[12px] ${!msg.isRead ? 'font-semibold text-[var(--win-text)]' : 'text-[var(--win-text)]'}`}>
                    {msg.subject || t('common.noContent')}
                  </div>
                  <p className="line-clamp-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">{msg.snippet || msg.bodyText}</p>
                </button>
              )
            })
          )}
        </div>

        <div className="hidden sm:flex flex-1 min-w-0 flex-col overflow-y-auto p-4 sm:p-5">
          {selectedMessage ? (
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--win-border)]">
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-bold text-[var(--win-text)] leading-snug">{selectedMessage.subject || t('common.noContent')}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--win-text)]">{selectedMessage.fromName || selectedMessage.fromAddr}</span>
                    <span className="font-mono text-[11.5px] text-[var(--text-secondary)]">&lt;{selectedMessage.fromAddr}&gt;</span>
                    <span>&bull;</span>
                    <span><DateTimeText value={selectedMessage.receivedAt} /></span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button type="button" variant="outline" size="sm" icon={<Reply className="h-3.5 w-3.5" />} onClick={() => handleReplyClick(selectedMessage)}>
                    {t('email.inbox.reply')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={selectedMessage.isRead ? <Mail className="h-3.5 w-3.5" /> : <MailCheck className="h-3.5 w-3.5" />}
                    onClick={() => markReadMut.mutate({ id: selectedMessage.id, isRead: !selectedMessage.isRead })}
                  >
                    {selectedMessage.isRead ? t('email.inbox.markUnread') : t('email.inbox.markRead')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => deleteMut.mutate(selectedMessage.id)}>
                    {t('email.inbox.delete')}
                  </Button>
                </div>
              </div>
              <div className="panel-muted-block p-3 text-xs space-y-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-[var(--text-secondary)]">{t('email.inbox.from')}: </span>
                    <span className="font-mono text-[var(--win-text)] font-medium">{selectedMessage.fromAddr}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)]">{t('email.inbox.to')}: </span>
                    <span className="font-mono text-[var(--win-text)] font-medium">{selectedMessage.toAddr}</span>
                  </div>
                </div>
              </div>
              <div className="panel-shell-card !p-4 border border-[var(--win-border)] bg-[var(--win-bg)]">
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--win-text)] font-sans">{selectedMessage.bodyText || selectedMessage.snippet}</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-[var(--text-secondary)]">
              <div className="max-w-xs space-y-2">
                <Mail className="h-8 w-8 mx-auto text-[var(--text-secondary)] opacity-50" />
                <p className="font-medium text-[var(--win-text)]">{t('email.inbox.selectPrompt')}</p>
                <p className="text-[11px] leading-normal opacity-80">{t('email.inbox.emptyHint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
