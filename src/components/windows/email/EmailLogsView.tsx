import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  Copy,
  Download,
  Pause,
  Play,
  RefreshCcw,
  ScrollText,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { getEmailLogs, type EmailLogServiceOption } from '@/api/email'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs } from '@/components/ui/Tabs'
import { useI18n } from '@/lib/i18n'

const DEFAULT_SERVICE_OPTIONS: EmailLogServiceOption[] = [
  { value: 'auto', label: 'Deteksi Otomatis' },
  { value: 'postfix', label: 'Postfix (MTA)' },
  { value: 'dovecot', label: 'Dovecot (IMAP)' },
  { value: 'exim4', label: 'Exim4 (MTA)' },
  { value: 'mail.log', label: 'Log Sistem (/var/log/mail.log)' },
  { value: 'activity', label: 'Aktivitas Email Panel' },
]

const LIMIT_OPTIONS = [80, 160, 240, 320]

type Level = 'error' | 'warn' | 'info'
type LevelFilter = 'all' | Level

function levelOf(line: string): Level {
  if (/\[error\]|level=error|\bERROR\b|\bFATAL\b|\bfailed\b|\brejected\b|\bstatus=deferred\b|\bstatus=bounced\b|\bpanic\b/i.test(line)) {
    return 'error'
  }
  if (/\[warn(ing)?\]|level=warn|\bWARN(ING)?\b|\bwarning\b/i.test(line)) {
    return 'warn'
  }
  return 'info'
}

const LEVEL_CLASS: Record<Level, string> = {
  error: 'text-[var(--panel-danger-text)]',
  warn: 'text-[var(--panel-warning-text)]',
  info: 'text-[var(--win-text)]',
}

const LEVEL_BAR: Record<Level, string> = {
  error: 'border-l-[var(--panel-danger-text)]',
  warn: 'border-l-[var(--panel-warning-text)]',
  info: 'border-l-transparent',
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = term.toLowerCase()
  const parts: Array<string | { hit: string }> = []
  let from = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push({ hit: text.slice(at, at + needle.length) })
    from = at + needle.length
  }
  if (from < text.length) parts.push(text.slice(from))
  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <mark key={i} className="bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold rounded-[2px] px-0.5">
            {part.hit}
          </mark>
        ),
      )}
    </>
  )
}

export function EmailLogsView() {
  const { t } = useI18n()

  const [service, setService] = useState('auto')
  const [limit, setLimit] = useState(160)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [live, setLive] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ['email-logs', service, limit],
    queryFn: () => getEmailLogs(service, limit),
    refetchInterval: live ? 5000 : false,
    retry: 1,
  })

  const services = useMemo(() => {
    return query.data?.services?.length ? query.data.services : DEFAULT_SERVICE_OPTIONS
  }, [query.data?.services])

  const all = useMemo(() => {
    return (query.data?.lines ?? []).map((l, i) => ({
      id: i,
      raw: l.line,
      level: levelOf(l.line),
    }))
  }, [query.data?.lines])

  const counts = useMemo(() => {
    let error = 0
    let warn = 0
    let info = 0
    for (const item of all) {
      if (item.level === 'error') error++
      else if (item.level === 'warn') warn++
      else info++
    }
    return { all: all.length, error, warn, info }
  }, [all])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((item) => {
      if (level !== 'all' && item.level !== level) return false
      if (q && !item.raw.toLowerCase().includes(q)) return false
      return true
    })
  }, [all, level, search])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [visible.length, autoScroll])

  const copyVisible = async () => {
    if (visible.length === 0) return
    const text = visible.map((v) => v.raw).join('\n')
    await copyTextToClipboard(text)
    toast.success(t('systemLogs.copied'))
  }

  const download = () => {
    if (visible.length === 0) return
    const text = visible.map((v) => v.raw).join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `email-${service}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--win-bg)]">
      {/* Top Toolbar */}
      <div className="flex min-h-[42px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            id="email-logs-service"
            value={service}
            onChange={setService}
            options={services}
            className="min-w-[160px] max-w-[210px]"
            buttonClassName="h-[30px] py-0 text-xs panel-input--mono"
          />
          <Select
            id="email-logs-limit"
            value={String(limit)}
            onChange={(val) => setLimit(Number(val))}
            options={LIMIT_OPTIONS.map((val) => ({
              value: String(val),
              label: `${val} baris`,
            }))}
            className="w-[105px]"
            buttonClassName="h-[30px] py-0 text-xs panel-input--mono"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="panel-search h-[30px] min-w-[130px] max-w-[240px] px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              id="email-logs-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="panel-search__input !text-[11.5px] !font-normal"
              placeholder={t('systemLogs.searchShort')}
            />
          </label>

          <IconButton
            label={live ? t('systemLogs.pause') : t('systemLogs.resume')}
            onClick={() => setLive((v) => !v)}
            tone={live ? 'success' : 'warning'}
          >
            {live ? <Pause size={14} /> : <Play size={14} />}
          </IconButton>

          <IconButton
            label={autoScroll ? t('systemLogs.autoScrollOn') : t('systemLogs.autoScrollOff')}
            onClick={() => setAutoScroll((v) => !v)}
            tone={autoScroll ? 'primary' : undefined}
          >
            <ArrowDownToLine size={14} />
          </IconButton>

          <IconButton
            label={t('systemLogs.copy')}
            onClick={() => void copyVisible()}
            disabled={visible.length === 0}
          >
            <Copy size={14} />
          </IconButton>

          <IconButton
            label={t('systemLogs.download')}
            onClick={download}
            disabled={visible.length === 0}
          >
            <Download size={14} />
          </IconButton>

          <IconButton
            label={t('common.refresh')}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCcw size={14} className={query.isFetching && !query.isLoading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {/* Filter Tabs and Count Bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1.5">
        <Tabs
          label={t('email.logs.levelAria')}
          value={level}
          onChange={(val) => setLevel(val as LevelFilter)}
          className="overflow-x-auto no-scrollbar min-w-0"
          items={[
            { key: 'all', label: t('systemLogs.levelAll'), count: counts.all },
            { key: 'error', label: t('systemLogs.levelError'), count: counts.error },
            { key: 'warn', label: t('systemLogs.levelWarn'), count: counts.warn },
            { key: 'info', label: t('systemLogs.levelInfo'), count: counts.info },
          ]}
        />
        <div className="flex items-center gap-2 shrink-0">
          {query.data?.detected && query.data.detected !== service && (
            <span className="hidden sm:inline-block rounded bg-[var(--panel-surface-strong)] px-1.5 py-0.5 panel-mono text-[11px] text-[var(--text-secondary)]">
              unit: {query.data.detected}
            </span>
          )}
          <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">
            {visible.length}/{all.length}
          </span>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--terminal-bg,var(--win-content-bg))] p-2 font-mono text-[12px] leading-5">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingState>{t('email.logs.loading')}</LoadingState>
          </div>
        ) : query.isError ? (
          <div className="flex h-full items-center justify-center p-4">
            <ErrorState
              title={t('email.logs.loadFailed')}
              hint={query.error?.message || 'Periksa koneksi ke daemon Reneo agent.'}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <EmptyState icon={<ScrollText />}>
              <span className="block font-medium text-[var(--win-text)]">{t('email.logs.empty')}</span>
              <span className="block text-[11px] text-[var(--text-secondary)] mt-0.5">
                {search ? t('email.logs.emptySearchHint') : t('email.logs.emptyHint')}
              </span>
            </EmptyState>
          </div>
        ) : (
          <div className="space-y-0.5">
            {visible.map((item) => (
              <div
                key={item.id}
                className={`group flex items-start gap-2 rounded px-1.5 py-0.5 hover:bg-[var(--panel-surface-hover)] border-l-2 ${LEVEL_BAR[item.level]}`}
              >
                <span className="w-9 shrink-0 select-none text-right text-[10.5px] text-[var(--text-secondary)] opacity-40 group-hover:opacity-80">
                  {item.id + 1}
                </span>
                <span className={`min-w-0 flex-1 break-all select-text font-mono text-[12px] ${LEVEL_CLASS[item.level]}`}>
                  <Highlight text={item.raw} term={search.trim()} />
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}
