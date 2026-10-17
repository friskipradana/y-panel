import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, Download, Pause, Play, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { useContainerLogs } from '@/hooks/useContainerLogs'
import { parseAnsi, splitLogTimestamp, stripAnsi, type AnsiSegment } from '@/lib/ansi'
import { useI18n } from '@/lib/i18n'

const TAILS = [100, 200, 500, 1000, 2000]

// The term marked inside a piece of text
function mark(text: string, term: string): ReactNode {
  if (!term) return text
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at} className="docker-log-mark">{text.slice(at, at + term.length)}</mark>)
    from = at + term.length
  }
  if (from === 0) return text
  if (from < text.length) parts.push(text.slice(from))
  return parts
}

function segmentClass(s: AnsiSegment) {
  return [
    typeof s.fg === 'number' ? `ansi-fg-${s.fg}` : '',
    typeof s.bg === 'number' ? `ansi-bg-${s.bg}` : '',
    s.bold ? 'ansi-bold' : '',
    s.dim ? 'ansi-dim' : '',
    s.italic ? 'ansi-italic' : '',
    s.underline ? 'ansi-underline' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

interface LogLineProps {
  line: string
  term: string
  showTime: boolean
  wrap: boolean
}

// One line: its time, then the message with its colors; a line is drawn again only when its own inputs change
const LogLine = memo(function LogLine({ line, term, showTime, wrap }: LogLineProps) {
  const { stamp, time, message } = splitLogTimestamp(line)
  const segments = parseAnsi(message)
  return (
    <div className={`docker-log-line${wrap ? ' docker-log-line--wrap' : ''}`}>
      {showTime && time ? (
        <time className="docker-log-time" title={stamp}>
          {time}
        </time>
      ) : null}
      <span className="docker-log-msg">
        {segments.map((s, k) => (
          <span
            key={k}
            className={segmentClass(s) || undefined}
            style={{ color: typeof s.fg === 'string' ? s.fg : undefined, backgroundColor: typeof s.bg === 'string' ? s.bg : undefined }}
          >
            {mark(s.text, term)}
          </span>
        ))}
      </span>
    </div>
  )
})

interface LogTarget {
  id: string
  name: string
}

// Live logs of one container, over a WebSocket
export function LogModal({ target, onClose }: { target: LogTarget | null; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal open={!!target} onClose={onClose} title={t('docker.realtimeLogs')} subtitle={target?.name} size="sheet" width={1040}>
      {target ? <LogViewer key={target.id} target={target} /> : null}
    </Modal>
  )
}

function LogViewer({ target }: { target: LogTarget }) {
  const { t } = useI18n()
  const [tail, setTail] = useState(200)
  const [autoScroll, setAutoScroll] = useState(true)
  const [wrap, setWrap] = useState(false)
  const [showTime, setShowTime] = useState(true)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { lines, status, transport, detail, paused, setPaused, clear, reconnect } = useContainerLogs(target.id, tail)
  const viewerRef = useRef<HTMLDivElement>(null)

  const term = query.trim().toLowerCase()
  const visible = useMemo(
    () => lines.map((line, index) => ({ line, index })).filter(({ line }) => !term || stripAnsi(line).toLowerCase().includes(term)),
    [lines, term],
  )

  // follow the newest line, unless the reader scrolled up
  useEffect(() => {
    const el = viewerRef.current
    if (autoScroll && el) el.scrollTop = el.scrollHeight
  }, [autoScroll, visible])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const onScroll = () => {
    const el = viewerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (atBottom !== autoScroll) setAutoScroll(atBottom)
  }

  const plain = () => visible.map(({ line }) => stripAnsi(line)).join('\n')
  const copy = () => void copyTextToClipboard(plain()).then(() => toast.success(t('docker.logs.copied')))
  const download = () => {
    const url = URL.createObjectURL(new Blob([plain()], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${target.name}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const finished = status === 'ended' || status === 'error'
  const statusLabel = t(`docker.logs.status.${status}`) + (status === 'live' && transport === 'polling' ? ` \u00b7 ${t('docker.logs.polling')}` : '')

  return (
    <>
      <div className="docker-log-toolbar">
        <div className="docker-log-toolbar__left">
          <span className={`docker-log-status docker-log-status--${status}`} title={transport === 'polling' ? t('docker.logs.pollingHint') : undefined}>
            <span className="docker-log-status__dot" />
            {statusLabel}
          </span>
          <span className="docker-log-count">
            {term ? t('docker.logs.matches', { shown: visible.length, total: lines.length }) : t('docker.logs.count', { count: lines.length })}
          </span>
        </div>
        <div className="docker-log-toolbar__right">
          <SearchInput className="docker-log-search" value={query} onChange={setQuery} placeholder={t('docker.logs.filter')} />
          <IconButton label={paused ? t('docker.logs.resume') : t('docker.logs.pause')} onClick={() => setPaused(!paused)}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </IconButton>
          <IconButton label={t('docker.logs.copy')} onClick={copy} disabled={visible.length === 0}>
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton label={t('docker.logs.download')} onClick={download} disabled={visible.length === 0}>
            <Download className="h-4 w-4" />
          </IconButton>
          <div className="docker-log-menu" ref={menuRef}>
            <IconButton label={t('docker.logs.view')} onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="menu">
              <SlidersHorizontal className="h-4 w-4" />
            </IconButton>
            {menuOpen ? (
              <div className="docker-log-menu__panel" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}>
                <Checkbox checked={autoScroll} onChange={setAutoScroll} label={t('docker.autoScroll')} />
                <Checkbox checked={wrap} onChange={setWrap} label={t('docker.logs.wrap')} />
                <Checkbox checked={showTime} onChange={setShowTime} label={t('docker.logs.time')} />
                <div className="docker-log-menu__row">
                  <span>{t('docker.logs.startWith')}</span>
                  <Select
                    id="docker-log-tail-select"
                    value={String(tail)}
                    onChange={(value: string) => setTail(Number(value))}
                    options={TAILS.map((n) => ({ value: String(n), label: t('docker.lines', { count: n }) }))}
                  />
                </div>
                <Button variant="ghost" size="sm" block onClick={() => { clear(); setMenuOpen(false) }} disabled={lines.length === 0}>
                  {t('docker.logs.clear')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={viewerRef} className="docker-log-viewer" role="log" aria-label={t('docker.realtimeLogs')} onScroll={onScroll}>
        {visible.length === 0 ? (
          <div className="docker-log-empty">
            <p>{finished ? (status === 'ended' ? t('docker.logs.endedHint') : t('docker.logs.errorHint')) : status === 'connecting' ? t('docker.loadingLogs') : term ? t('docker.noResults') : t('docker.noLogs')}</p>
            {finished ? (
              <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={reconnect}>
                {t('docker.logs.reconnect')}
              </Button>
            ) : null}
          </div>
        ) : (
          visible.map(({ line, index }) => <LogLine key={index} line={line} term={term} showTime={showTime} wrap={wrap} />)
        )}
        {finished && visible.length > 0 ? (
          <div className="docker-log-end">
            <span>{status === 'ended' ? t('docker.logs.endedHint') : t('docker.logs.errorHint')}{detail ? ` (${detail})` : ''}</span>
            <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={reconnect}>
              {t('docker.logs.reconnect')}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}
