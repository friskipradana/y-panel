import { useMemo, useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, RefreshCcw, ScrollText, Terminal, Search } from 'lucide-react'
import { getSystemLogs } from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'

const SERVICE_OPTIONS = [
  { value: 'ypanel', label: 'YPanel Agent' },
  { value: 'docker', label: 'docker' },
  { value: 'postgresql', label: 'postgresql' },
  { value: 'nginx', label: 'nginx' },
  { value: 'ssh', label: 'ssh' },
]

const LIMIT_OPTIONS = [80, 160, 240, 320, 400]

function lineToneClass(line: string): string {
  if (/\[error\]|level=error|ERROR|FATAL|failed|panic/i.test(line)) return 'text-[var(--panel-danger-text)]'
  if (/\[warn\]|level=warn|WARN|warning/i.test(line)) return 'text-[var(--panel-warning-text)]'
  if (/\[auth\]|auth|login|logout/i.test(line)) return 'text-[var(--panel-success-text)]'
  if (/\[http\]|method=GET|method=POST|method=PUT|method=PATCH|method=DELETE/i.test(line)) return 'text-[var(--panel-info-text)]'
  if (/\[settings\]|settings/i.test(line)) return 'text-[var(--panel-primary-text)]'
  return 'text-[color:color-mix(in_srgb,var(--win-text)_82%,white)]'
}

export function SystemLogsWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const [service, setService] = useState('ypanel')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(160)
  const [autoScroll, setAutoScroll] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  const query = useQuery({
    queryKey: ['system-logs', service, limit],
    queryFn: () => getSystemLogs(service, limit),
    refetchInterval: 5000,
    retry: 1,
  })

  useEffect(() => {
    if (typeof win?.params?.service === 'string' && win.params.service.trim()) {
      setService(win.params.service.trim())
    }
    if (typeof win?.params?.search === 'string') {
      setSearch(win.params.search)
    }
  }, [win?.params?.search, win?.params?.service])

  useEffect(() => {
    if (authenticated) {
      void query.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const lines = useMemo(() => {
    if (!query.data?.lines?.length) return []
    const rawLines = query.data.lines.map((entry) => entry.line)
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return rawLines
    return rawLines.filter((line) => line.toLowerCase().includes(normalizedSearch))
  }, [query.data, search])

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Terminal className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('systemLogs.title')}</div>
            <div className="panel-window__meta">{t('systemLogs.meta')}</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button id="system-logs-refresh" type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="panel-icon-btn" aria-label={t('systemLogs.refreshAria')}>
            <RefreshCcw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack h-full">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <ScrollText className="h-3 w-3" />
              {t('systemLogs.hostJournalStream')}
            </div>
            <div className="panel-hero__title">{t('systemLogs.heroTitle')}</div>
            <p className="panel-hero__description">
              {t('systemLogs.heroDescription')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <select id="system-logs-service" value={service} onChange={(e) => setService(e.target.value)} className="panel-select max-w-[180px] px-3 py-2 text-[12px] panel-input--mono">
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select id="system-logs-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="panel-select max-w-[120px] px-3 py-2 text-[12px] panel-input--mono">
                {LIMIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>

              <label className="panel-search max-w-[320px] flex-1">
                <Search className="h-4 w-4" />
                <input
                  id="system-logs-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="panel-search__input"
                  placeholder={t('systemLogs.searchPlaceholder')}
                />
              </label>

              <button type="button" onClick={() => setAutoScroll((value) => !value)} className={`panel-btn ${autoScroll ? 'panel-btn--primary-soft' : 'panel-btn--ghost'} rounded-full px-3 py-2 text-[12px]`}>
                ↓ {autoScroll ? t('systemLogs.autoScrollOn') : t('systemLogs.autoScrollOff')}
              </button>
            </div>
          </section>

          <div className="panel-log-surface flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--win-border)] px-4 py-2">
              <div className="flex items-center gap-2">
                <ScrollText size={11} className="text-[var(--text-secondary)]" />
                <span className="panel-mono text-[12px] text-[var(--win-text)]">{service}</span>
                {query.isFetching ? (
                  <>
                    <Activity size={10} className="animate-pulse text-[var(--panel-warning-text)]" />
                    <span className="text-[12px] text-[var(--panel-warning-text)]">{t('systemLogs.updating')}</span>
                  </>
                ) : null}
              </div>

              <span className="panel-mono text-[12px] text-[var(--text-secondary)]">{lines.length}/{limit}</span>
            </div>

            <div ref={logContainerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {query.isError ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="panel-error-state max-w-sm">
                    <AlertTriangle size={14} />
                    <div>
                      <p className="font-semibold">{t('systemLogs.loadFailed')}</p>
                      <p className="mt-1 text-[12px] leading-relaxed opacity-90">
                        {(query.error as Error)?.message || t('systemLogs.loadFailedHint')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : query.isLoading ? (
                <div className="panel-loading min-h-[320px] border-none bg-transparent shadow-none">
                  <Activity size={13} className="animate-pulse" />
                  {t('systemLogs.loadingHostLogs')}
                </div>
              ) : lines.length === 0 ? (
                <div className="panel-empty min-h-[320px] border-none bg-transparent">
                  <ScrollText className="h-8 w-8" />
                  <span>{search.trim() ? t('systemLogs.noMatchingLogs') : t('systemLogs.noLogs')}</span>
                </div>
              ) : (
                <div className="py-2">
                  {lines.map((line, index) => (
                    <div key={index} className="flex py-px hover:bg-[var(--panel-surface-hover)] dark:hover:bg-[var(--panel-surface-hover)]">
                      <span className="w-11 flex-shrink-0 self-start pr-3 pt-px text-right font-mono text-[12px] leading-[1.65] text-[var(--text-secondary)] select-none">
                        {index + 1}
                      </span>
                      <span className={`flex-1 break-all pr-4 font-mono text-[12px] leading-[1.65] whitespace-pre-wrap ${lineToneClass(line)}`}>
                        {line}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} className="h-2" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




