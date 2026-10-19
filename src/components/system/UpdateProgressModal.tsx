import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, CheckCircle2, Copy, LoaderCircle, RefreshCw, ShieldAlert, Terminal, TriangleAlert } from 'lucide-react'
import { getUpdateStatus } from '@/api/system'
import { copyTextToClipboard } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/IconBadge'
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
  const [copied, setCopied] = useState(false)

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

  // Parse step progress from log output, e.g. [1/9] Prasyarat sistem
  let currentStep = 0
  let totalSteps = 9
  let currentStepTitle = ''
  for (let i = log.length - 1; i >= 0; i--) {
    const match = log[i].match(/\[(\d+)\/(\d+)\]\s*(.+)/)
    if (match) {
      currentStep = parseInt(match[1], 10)
      totalSteps = parseInt(match[2], 10)
      currentStepTitle = match[3].trim()
      break
    }
  }

  // Calculate percentage
  let progressPercent = 0
  if (finished) {
    progressPercent = 100
  } else if (restarting) {
    progressPercent = 95
  } else if (currentStep > 0 && totalSteps > 0) {
    progressPercent = Math.min(92, Math.round((currentStep / totalSteps) * 90))
  } else if (log.length > 0) {
    progressPercent = 8
  }

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

  const handleCopyLog = async () => {
    if (log.length === 0) return
    try {
      if (await copyTextToClipboard(log.join('\n'))) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // ignore
    }
  }

  const statusIcon = finished ? (
    <IconBadge size="lg" tone="success">
      <CheckCircle2 />
    </IconBadge>
  ) : failed ? (
    <IconBadge size="lg" tone="danger">
      <TriangleAlert />
    </IconBadge>
  ) : restarting ? (
    <IconBadge size="lg" tone="primary">
      <RefreshCw className="animate-spin" />
    </IconBadge>
  ) : (
    <IconBadge size="lg" tone="primary">
      <LoaderCircle className="animate-spin" />
    </IconBadge>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-progress-title"
      aria-describedby="update-progress-body"
    >
      <div className="flex max-h-[min(38rem,calc(100dvh-2rem))] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--win-bg)] p-5 text-[var(--win-text)] shadow-2xl">
        {/* Header Section */}
        <div className="flex items-start gap-3.5">
          {statusIcon}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="update-progress-title" className="text-[15px] font-semibold text-[var(--win-text)]">
                {heading}
              </h2>
              {status.data?.to ? (
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  {status.data.from ? (
                    <>
                      <span className="rounded bg-[var(--panel-surface-hover)] border border-[var(--win-border)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                        v{status.data.from}
                      </span>
                      <ArrowRight size={11} className="text-[var(--text-secondary)]" />
                    </>
                  ) : null}
                  <span className="rounded bg-[var(--panel-primary-bg)] border border-[var(--panel-primary-text)]/25 px-1.5 py-0.5 font-semibold text-[var(--panel-primary-text)]">
                    v{status.data.to}
                  </span>
                </div>
              ) : null}
            </div>
            <p id="update-progress-body" className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {detail}
            </p>
          </div>
        </div>

        {/* Progress Bar & Current Step */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="font-medium text-[var(--win-text)] truncate">
              {finished ? (
                t('update.progress.doneTitle')
              ) : restarting ? (
                t('update.progress.restarting')
              ) : currentStepTitle ? (
                t('update.progress.stepLabel', {
                  step: currentStep,
                  total: totalSteps,
                  title: currentStepTitle,
                })
              ) : (
                t('update.progress.downloading')
              )}
            </span>
            <span className="panel-mono text-[11.5px] font-semibold text-[var(--panel-primary-text)] shrink-0">
              {progressPercent}%
            </span>
          </div>

          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--panel-surface-strong)] border border-[var(--win-border)]">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                finished
                  ? 'bg-[var(--panel-success-text)]'
                  : failed
                    ? 'bg-[var(--panel-danger-text)]'
                    : 'bg-[var(--panel-primary-text)]'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Terminal Log Card */}
        <div className="flex flex-1 min-h-[9rem] flex-col overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-code-bg)] shadow-inner">
          <div className="flex h-8 items-center justify-between border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-3 text-[11px]">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Terminal size={12} />
              <span className="font-medium text-[var(--win-text)]">{t('update.progress.terminalTitle')}</span>
            </div>

            <div className="flex items-center gap-2">
              {working ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-[var(--panel-success-text)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--panel-success-text)] animate-ping" />
                  LIVE
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={handleCopyLog}
                className="!h-6 !px-2 text-[10.5px]"
                icon={copied ? <Check size={11} className="text-[var(--panel-success-text)]" /> : <Copy size={11} />}
              >
                {copied ? t('update.progress.copied') : t('update.progress.copyLog')}
              </Button>
            </div>
          </div>

          <pre
            ref={logRef}
            aria-live="polite"
            aria-label={t('update.progress.logLabel')}
            className="panel-mono flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 text-[11.5px] leading-relaxed text-[var(--panel-code-text)] select-text"
          >
            {log.length > 0 ? log.join('\n') : t('update.progress.waitingLog')}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--win-border)]">
          <div className="text-[11.5px] text-[var(--text-secondary)]">
            {working ? (
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-[var(--panel-warning-text)] shrink-0" />
                <span>{t('update.progress.noClose')}</span>
              </span>
            ) : restarting ? (
              <span className="flex items-center gap-1.5 text-[var(--panel-primary-text)] font-medium">
                <RefreshCw size={13} className="animate-spin shrink-0" />
                <span>{t('update.progress.restarting')}</span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {finished ? (
              <Button variant="primary" icon={<RefreshCw size={13} />} onClick={() => window.location.reload()}>
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

