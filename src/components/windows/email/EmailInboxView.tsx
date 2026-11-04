import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Mail,
  MailCheck,
  RefreshCw,
  Reply,
  Send,
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
  const unreadCount = inboxQuery.data?.unread ?? 0

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
    const initial = (selectedMessage.fromName || selectedMessage.fromAddr || '?')[0].toUpperCase()
    return (
      <div className="flex flex-col h-full overflow-hidden bg-[var(--win-bg)] p-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--win-border)] shrink-0">
          <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setSelectedId(null)}>
            {t('common.back')}
          </Button>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="primary" size="sm" icon={<Reply className="h-3.5 w-3.5" />} onClick={() => handleReplyClick(selectedMessage)}>
              {t('email.inbox.reply')}
            </Button>
            <Button type="button" variant="outline" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => deleteMut.mutate(selectedMessage.id)}>
              {t('email.inbox.delete')}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pt-3 space-y-4">
          <h2 className="text-base font-bold text-[var(--win-text)] leading-snug">{selectedMessage.subject || t('common.noContent')}</h2>
          <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--win-border)]">
            <div className="w-8 h-8 rounded-full bg-[var(--panel-surface-hover)] border border-[var(--win-border)] flex items-center justify-center font-bold text-xs text-[var(--win-text)] shrink-0 select-none">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-[var(--win-text)] truncate">{selectedMessage.fromName || selectedMessage.fromAddr}</span>
                <span className="text-[11px] text-[var(--text-secondary)] font-mono shrink-0"><DateTimeText value={selectedMessage.receivedAt} /></span>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">&lt;{selectedMessage.fromAddr}&gt;</div>
            </div>
          </div>
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--win-text)] font-sans">{selectedMessage.bodyText || selectedMessage.snippet}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-[var(--win-bg)]">
      <div className="w-full sm:w-[320px] md:w-[350px] lg:w-[370px] flex flex-col border-r border-[var(--win-border)] bg-[var(--panel-surface-subtle)] shrink-0 overflow-hidden">
        <div className="p-2.5 border-b border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <SearchInput value={search} onChange={setSearch} placeholder={t('email.inbox.search')} />
            </div>
            <button
              type="button"
              className="docker-icon-btn shrink-0"
              title={t('email.inbox.sync')}
              aria-label={t('email.inbox.sync')}
              disabled={syncMut.isPending || inboxQuery.isFetching}
              onClick={() => syncMut.mutate()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncMut.isPending || inboxQuery.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex items-center p-0.5 rounded-md bg-[var(--win-bg)] border border-[var(--win-border)] text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`flex-1 py-1 px-2 text-center rounded text-[11.5px] font-medium transition-colors ${
                filterMode === 'all'
                  ? 'bg-[var(--panel-surface-hover)] text-[var(--win-text)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
              }`}
            >
              {t('email.inbox.filterAll')}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('unread')}
              className={`flex-1 py-1 px-2 text-center rounded text-[11.5px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                filterMode === 'unread'
                  ? 'bg-[var(--panel-surface-hover)] text-[var(--win-text)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
              }`}
            >
              <span>{t('email.inbox.filterUnread')}</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--panel-primary-bg)] text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('sent')}
              className={`flex-1 py-1 px-2 text-center rounded text-[11.5px] font-medium transition-colors ${
                filterMode === 'sent'
                  ? 'bg-[var(--panel-surface-hover)] text-[var(--win-text)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
              }`}
            >
              {t('email.inbox.filterSent')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--win-border)]">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<Mail className="h-5 w-5" />}>
                {search.trim() ? t('email.inbox.noMatch') : t('email.inbox.empty')}
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
                  className={`w-full p-3 text-left transition-colors flex flex-col gap-1 relative focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--panel-primary-border)] ${
                    isSelected ? 'bg-[var(--panel-surface-hover)]' : 'hover:bg-[var(--panel-surface)]'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--panel-primary-border)]" />
                  )}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!msg.isRead && (
                        <span className="h-2 w-2 rounded-full bg-[var(--panel-primary-bg)] shrink-0" aria-label={t('email.inbox.filterUnread')} />
                      )}
                      <span className={`truncate text-[12.5px] ${!msg.isRead ? 'font-bold text-[var(--win-text)]' : 'font-medium text-[var(--text-secondary)]'}`}>
                        {msg.fromName || msg.fromAddr}
                      </span>
                      {msg.direction === 'outbound' && (
                        <Send className="h-3 w-3 text-[var(--text-secondary)] shrink-0" aria-label={t('email.inbox.filterSent')} />
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--text-secondary)] font-mono">
                      <DateTimeText value={msg.receivedAt} />
                    </span>
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
      </div>

      <div className="hidden sm:flex flex-1 min-w-0 flex-col overflow-hidden bg-[var(--win-bg)]">
        {selectedMessage ? (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--win-border)] bg-[var(--panel-surface-subtle)] flex flex-col gap-3 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-base sm:text-lg font-bold text-[var(--win-text)] leading-snug break-words flex-1 min-w-0">
                  {selectedMessage.subject || t('common.noContent')}
                </h1>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button type="button" variant="primary" size="sm" icon={<Reply className="h-3.5 w-3.5" />} onClick={() => handleReplyClick(selectedMessage)}>
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
                  <Button type="button" variant="outline" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} className="hover:text-[var(--panel-danger-text)]" onClick={() => deleteMut.mutate(selectedMessage.id)}>
                    {t('email.inbox.delete')}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[var(--panel-surface-hover)] border border-[var(--win-border)] flex items-center justify-center font-bold text-xs text-[var(--win-text)] shrink-0 select-none">
                    {(selectedMessage.fromName || selectedMessage.fromAddr || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-xs text-[var(--win-text)] truncate">{selectedMessage.fromName || selectedMessage.fromAddr}</span>
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate">&lt;{selectedMessage.fromAddr}&gt;</span>
                      {selectedMessage.direction === 'outbound' && (
                        <Badge tone="info" className="ml-1 text-[10px] px-1.5 py-0">{t('email.inbox.filterSent')}</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                      <span>{t('email.inbox.to')}:</span>
                      <span className="font-mono text-[var(--win-text)] truncate">{selectedMessage.toAddr}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <DateTimeText value={selectedMessage.receivedAt} className="text-xs text-[var(--text-secondary)] font-mono" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 select-text">
              <div className="max-w-3xl whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--win-text)] font-sans">
                {selectedMessage.bodyText || selectedMessage.snippet}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-[var(--text-secondary)]">
            <div className="max-w-xs space-y-2">
              <Mail className="h-8 w-8 mx-auto text-[var(--text-secondary)] opacity-40" />
              <p className="font-medium text-[var(--win-text)]">{t('email.inbox.selectPrompt')}</p>
              <p className="text-[11px] leading-normal opacity-80">{t('email.inbox.emptyHint')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
