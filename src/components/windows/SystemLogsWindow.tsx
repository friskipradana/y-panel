import { useMemo, useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowDownToLine, RefreshCcw, ScrollText, Search } from 'lucide-react'
import { getSystemLogs } from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

const SERVICE_OPTIONS = [
  { value: 'reneo', label: 'Reneo Agent' },
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
  const [service, setService] = useState('reneo')
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
      {/* ── Compact Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--win-border)] px-3 py-1.5 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
        <div className="flex items-center gap-2 flex-1 max-w-[540px] mobile:max-w-none mobile:flex-wrap">
          <Select
            id="system-logs-service"
            value={service}
            onChange={setService}
            options={SERVICE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
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

          <label className="panel-search flex-1 max-w-[240px] h-[30px] mobile:min-w-full mobile:max-w-none">
            <Search className="h-3.5 w-3.5" />
            <input
              id="system-logs-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="panel-search__input text-xs"
              placeholder={t('systemLogs.searchPlaceholder')}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setAutoScroll((value) => !value)} variant={autoScroll ? 'primary-soft' : 'ghost'} className="text-xs py-1 px-2.5">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            {autoScroll ? t('systemLogs.autoScrollOn') : t('systemLogs.autoScrollOff')}
          </Button>
          <IconButton id="system-logs-refresh" type="button" onClick={() => void query.refetch()} disabled={query.isFetching} label={t('systemLogs.refreshAria')}>
            <RefreshCcw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      <div className="panel-window__body p-0 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="panel-window__stack h-full p-3 flex flex-col flex-1 min-h-0">

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
                <LoadingState className="min-h-[320px] border-none bg-transparent shadow-none">{t('systemLogs.loadingHostLogs')}</LoadingState>
              ) : lines.length === 0 ? (
                <EmptyState icon={<ScrollText />} className="min-h-[320px] border-none bg-transparent">{search.trim() ? t('systemLogs.noMatchingLogs') : t('systemLogs.noLogs')}</EmptyState>
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




