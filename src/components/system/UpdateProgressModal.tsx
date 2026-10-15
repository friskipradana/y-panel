import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react'
import { getUpdateStatus } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { useUpdateProgress } from '@/store/updateStore'

const RELOAD_DELAY_MS = 2500

// Live view of a panel update. It cannot be dismissed while the installer runs, covers every
// other layer, and keeps polling through the short outage when the service restarts.
export function UpdateProgressModal() {
  const { t } = useI18n()
  const open = useUpdateProgress((s) => s.open)
  const hide = useUpdateProgress((s) => s.hide)
  const logRef = useRef<HTMLPreElement>(null)
  const [sawRunning, setSawRunning] = useState(false)

  const status = useQuery({
    queryKey: ['update-progress'],
    queryFn: getUpdateStatus,
    enabled: open,
    refetchInterval: open ? 1000 : false,
    retry: false,
    gcTime: 0,
  })

  const state = status.data?.state
  // the agent is unreachable while its service restarts
  const restarting = open && status.isError
  const finished = state === 'done' || (sawRunning && state === 'idle')
  const failed = state === 'failed'
  const working = open && !finished && !failed
  const log = status.data?.log ?? []

  // idle right after running means the installer wrote its result and the agent restarted
  useEffect(() => {
    if (state === 'running') setSawRunning(true)
  }, [state])

  useEffect(() => {
    if (!open) setSawRunning(false)
  }, [open])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log.length, open])

  useEffect(() => {
    if (!open || !finished) return
    const timer = window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [open, finished])

  // nothing may be pressed behind the dialog while it is up
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const heading = finished
    ? t('update.progress.doneTitle')
    : failed
      ? t('update.progress.failedTitle')
      : t('update.progress.runningTitle')
  const detail = finished
    ? t('update.progress.doneBody', { version: status.data?.to ?? '' })
    : failed
      ? t('update.progress.failedBody')
      : restarting
        ? t('update.progress.restarting')
        : t('update.progress.runningBody')

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-progress-title"
      aria-describedby="update-progress-body"
    >
      <div className="flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--win-bg)] p-5 text-[var(--win-text)] shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            {finished ? (
              <CheckCircle2 className="h-6 w-6 text-[var(--panel-success-text)]" />
            ) : failed ? (
              <TriangleAlert className="h-6 w-6 text-[var(--panel-danger-text)]" />
            ) : (
              <LoaderCircle className="h-6 w-6 animate-spin text-[var(--panel-primary-text)]" />
            )}
          </span>
          <div className="min-w-0">
            <h2 id="update-progress-title" className="text-[1rem] font-semibold">
              {heading}
              {status.data?.to ? <span className="panel-mono ml-2 text-[0.8125rem] text-[var(--text-secondary)]">v{status.data.from} → v{status.data.to}</span> : null}
            </h2>
            <p id="update-progress-body" className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
              {detail}
            </p>
          </div>
        </div>

        {working ? <div className="boot-bar self-center text-[var(--panel-primary-text)]" aria-hidden="true" /> : null}

        <pre
          ref={logRef}
          aria-live="polite"
          aria-label={t('update.progress.logLabel')}
          className="panel-mono min-h-[8rem] flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--win-border)] bg-[#0b0f16] p-3 text-[0.75rem] leading-relaxed text-[#d1d9e0]"
        >
          {log.length > 0 ? log.join('\n') : t('update.progress.waitingLog')}
        </pre>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.75rem] text-[var(--text-secondary)]">{working ? t('update.progress.noClose') : ''}</span>
          <div className="flex gap-2">
            {finished ? (
              <Button variant="primary" onClick={() => window.location.reload()}>
                {t('update.progress.reload')}
              </Button>
            ) : null}
            {failed ? (
              <Button variant="ghost" onClick={hide}>
                {t('common.close')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
