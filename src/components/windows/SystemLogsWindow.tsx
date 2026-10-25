import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, Copy, Download, Pause, Play, RefreshCcw, ScrollText, Search } from 'lucide-react'
import { copyTextToClipboard, getSystemLogs } from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import type { WindowState } from '@/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs } from '@/components/ui/Tabs'
import { toast } from 'sonner'

const SERVICE_OPTIONS = [
  { value: 'reneo', label: 'Reneo Agent' },
  { value: 'docker', label: 'docker' },
  { value: 'postgresql', label: 'postgresql' },
  { value: 'nginx', label: 'nginx' },
  { value: 'ssh', label: 'ssh' },
]

const LIMIT_OPTIONS = [80, 160, 240, 320, 400]

type Level = 'error' | 'warn' | 'info'
type LevelFilter = 'all' | Level

function levelOf(line: string): Level {
  if (/\[error\]|level=error|\bERROR\b|\bFATAL\b|\bfailed\b|\bpanic\b/i.test(line)) return 'error'
  if (/\[warn(ing)?\]|level=warn|\bWARN(ING)?\b/i.test(line)) return 'warn'
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
          part
        ) : (
          <mark key={i} className="rounded-sm bg-[var(--panel-warning-bg)] px-0.5 text-inherit">
            {part.hit}
          </mark>
        ),
      )}
    </>
  )
}

// Superadmin only: reads the service journals of this host.
export function SystemLogsWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()
  const [service, setService] = useState('reneo')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(160)
  const [level, setLevel] = useState<LevelFilter>('all')
  const [live, setLive] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ['system-logs', service, limit],
    queryFn: () => getSystemLogs(service, limit),
    refetchInterval: live ? 5000 : false,
    retry: 1,
  })

  useEffect(() => {
    if (typeof win?.params?.service === 'string' && win.params.service.trim()) setService(win.params.service.trim())
    if (typeof win?.params?.search === 'string') setSearch(win.params.search)
  }, [win?.params?.search, win?.params?.service])

  useEffect(() => {
    if (authenticated) void query.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const all = useMemo(() => (query.data?.lines ?? []).map((entry) => ({ text: entry.line, level: levelOf(entry.line) })), [query.data])
  const counts = useMemo(
    () => ({
      all: all.length,
      error: all.filter((l) => l.level === 'error').length,
      warn: all.filter((l) => l.level === 'warn').length,
      info: all.filter((l) => l.level === 'info').length,
    }),
    [all],
  )
  const term = search.trim()
  const visible = useMemo(
    () => all.filter((l) => (level === 'all' || l.level === level) && (!term || l.text.toLowerCase().includes(term.toLowerCase()))),
    [all, level, term],
  )

  useEffect(() => {
    if (autoScroll && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [visible, autoScroll])

  const visibleText = () => visible.map((l) => l.text).join('\n')

  const copyVisible = async () => {
    try {
      if (await copyTextToClipboard(visibleText())) toast.success(t('systemLogs.copied', { count: visible.length }))
    } catch {
      toast.error(t('systemLogs.copyFailed'))
    }
  }

  const download = () => {
    const blob = new Blob([visibleText() + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${service}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel-window flex h-full flex-col">
      {isMobile ? (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-[var(--win-border)] bg-[var(--win-bar)] p-2">
          {/* Row 1: Source & Stream control */}
          <div className="flex items-center gap-1.5">
            <Select
              id="system-logs-service"
              value={service}
              onChange={setService}
              options={SERVICE_OPTIONS}
              className="min-w-0 flex-1"
              buttonClassName="h-[30px] py-0 text-xs panel-input--mono"
            />
            <Select
              id="system-logs-limit"
              value={String(limit)}
              onChange={(value) => setLimit(Number(value))}
              options={LIMIT_OPTIONS.map((value) => ({ value: String(value), label: t('systemLogs.linesOption', { count: value }) }))}
              className="w-[84px] shrink-0"
              buttonClassName="h-[30px] py-0 text-xs panel-input--mono"
            />
            <IconButton label={live ? t('systemLogs.pause') : t('systemLogs.resume')} onClick={() => setLive((v) => !v)} tone={live ? 'success' : 'warning'}>
              {live ? <Pause size={14} /> : <Play size={14} />}
            </IconButton>
            <IconButton id="system-logs-refresh" label={t('systemLogs.refreshAria')} onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCcw size={14} className={(query.isFetching && !query.isLoading) ? 'animate-spin' : ''} />
            </IconButton>
          </div>

          {/* Row 2: Search & Utility actions */}
          <div className="flex items-center gap-1.5">
            <label className="panel-search h-[30px] min-w-0 flex-1 px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <input
                id="system-logs-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="panel-search__input !text-[11px] !font-normal"
                placeholder={t('systemLogs.searchShort')}
              />
            </label>
            <IconButton label={autoScroll ? t('systemLogs.autoScrollOn') : t('systemLogs.autoScrollOff')} onClick={() => setAutoScroll((v) => !v)} tone={autoScroll ? 'primary' : undefined}>
              <ArrowDownToLine size={14} />
            </IconButton>
            <IconButton label={t('systemLogs.copy')} onClick={() => void copyVisible()} disabled={visible.length === 0}>
              <Copy size={14} />
            </IconButton>
            <IconButton label={t('systemLogs.download')} onClick={download} disabled={visible.length === 0}>
              <Download size={14} />
            </IconButton>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[40px] shrink-0 flex-wrap items-center gap-2 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1.5">
          <Select
            id="system-logs-service"
            value={service}
            onChange={setService}
            options={SERVICE_OPTIONS}
            className="min-w-[150px] max-w-[190px]"
            buttonClassName="h-[30px] py-0 text-xs panel-input--mono"
          />
          <Select
            id="system-logs-limit"
            value={String(limit)}
            onChange={(value) => setLimit(Number(value))}
            options={LIMIT_OPTIONS.map((value) => ({ value: String(value), label: t('systemLogs.linesOption', { count: value }) }))}
            className="min-w-[110px] max-w-[140px]"
            buttonClassName="h-[30px] py-0 text-xs panel-input--mono"
          />
          <label className="panel-search h-[30px] min-w-[10rem] max-w-[320px] flex-1 system-logs__search">
            <Search className="h-3.5 w-3.5" />
            <input id="system-logs-search" value={search} onChange={(e) => setSearch(e.target.value)} className="panel-search__input text-xs" placeholder={t('systemLogs.searchPlaceholder')} />
          </label>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={live ? t('systemLogs.pause') : t('systemLogs.resume')} onClick={() => setLive((v) => !v)} tone={live ? 'success' : 'warning'}>
              {live ? <Pause size={14} /> : <Play size={14} />}
            </IconButton>
            <IconButton label={autoScroll ? t('systemLogs.autoScrollOn') : t('systemLogs.autoScrollOff')} onClick={() => setAutoScroll((v) => !v)} tone={autoScroll ? 'primary' : undefined}>
              <ArrowDownToLine size={14} />
            </IconButton>
            <IconButton label={t('systemLogs.copy')} onClick={() => void copyVisible()} disabled={visible.length === 0}>
              <Copy size={14} />
            </IconButton>
            <IconButton label={t('systemLogs.download')} onClick={download} disabled={visible.length === 0}>
              <Download size={14} />
            </IconButton>
            <IconButton id="system-logs-refresh" label={t('systemLogs.refreshAria')} onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCcw size={14} className={(query.isFetching && !query.isLoading) ? 'animate-spin' : ''} />
            </IconButton>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          {isMobile ? (
            <Select
              id="system-logs-level"
              value={level}
              onChange={(val) => setLevel(val as LevelFilter)}
              options={[
                { value: 'all', label: t('systemLogs.levelAll'), badge: String(counts.all) },
                { value: 'error', label: t('systemLogs.levelError'), badge: String(counts.error), dotTone: counts.error > 0 ? 'danger' : undefined },
                { value: 'warn', label: t('systemLogs.levelWarn'), badge: String(counts.warn), dotTone: counts.warn > 0 ? 'warning' : undefined },
                { value: 'info', label: t('systemLogs.levelInfo'), badge: String(counts.info) },
              ]}
              className="w-[145px]"
              buttonClassName="h-7 text-xs"
              size="sm"
            />
          ) : (
            <Tabs
              label={t('systemLogs.levelFilter')}
              value={level}
              onChange={setLevel}
              className="overflow-x-auto no-scrollbar min-w-0 flex-1"
              items={[
                { key: 'all', label: t('systemLogs.levelAll'), count: counts.all },
                { key: 'error', label: t('systemLogs.levelError'), count: counts.error },
                { key: 'warn', label: t('systemLogs.levelWarn'), count: counts.warn },
                { key: 'info', label: t('systemLogs.levelInfo'), count: counts.info },
              ]}
            />
          )}
          <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)] shrink-0">
            {visible.length}/{all.length}
          </span>
        </div>

        <div className="panel-log-surface flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {query.isError ? (
              <div className="flex h-full items-center justify-center p-6">
                <ErrorState
                  className="max-w-sm"
                  title={t('systemLogs.loadFailed')}
                  hint={(query.error as Error)?.message || t('systemLogs.loadFailedHint')}
                  action={
                    <Button variant="ghost" loading={query.isFetching} onClick={() => void query.refetch()}>
                      {t('common.retry')}
                    </Button>
                  }
                />
              </div>
            ) : query.isLoading ? (
              <LoadingState className="min-h-[240px] border-none bg-transparent shadow-none">{t('systemLogs.loadingHostLogs')}</LoadingState>
            ) : visible.length === 0 ? (
              <EmptyState icon={<ScrollText />} className="min-h-[240px] border-none bg-transparent">
                {term || level !== 'all' ? t('systemLogs.noMatchingLogs') : t('systemLogs.noLogs')}
              </EmptyState>
            ) : (
              <div className="py-1">
                {visible.map((line, index) => (
                  <div key={index} className={`flex border-l-2 py-px hover:bg-[var(--panel-surface-hover)] ${LEVEL_BAR[line.level]}`}>
                    <span className="w-8 sm:w-10 shrink-0 select-none self-start pr-1.5 sm:pr-2 text-right font-mono text-[11px] sm:text-[12px] leading-[1.5] sm:leading-[1.65] text-[var(--text-secondary)]">{index + 1}</span>
                    <span className={`flex-1 whitespace-pre-wrap break-all pr-2 sm:pr-3 font-mono text-[11px] sm:text-[12px] leading-[1.5] sm:leading-[1.65] ${LEVEL_CLASS[line.level]}`}>
                      <Highlight text={line.text} term={term} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
