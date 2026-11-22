import { useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconBadge, type UiTone } from '@/components/ui/IconBadge'
import { useAlertStore, type AlertType } from '@/store/alertStore'
import { useI18n } from '@/lib/i18n'
import { renderAlertText } from './alertText'

const ICON: Record<AlertType, ReactNode> = {
  success: <CheckCircle2 />,
  warning: <AlertTriangle />,
  error: <XCircle />,
  info: <Info />,
  question: <HelpCircle />,
  loading: <Loader2 className="animate-spin" />,
  confirm: <AlertTriangle />,
}

const TONE: Record<AlertType, UiTone> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
  question: 'primary',
  loading: 'primary',
  confirm: 'warning',
}

interface AlertData {
  type: AlertType
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  icon?: 'warning' | 'question'
}

// One dialog for confirmations, results and busy states. Used by the global layer and,
// inside a window (or the phone shell), scoped to that window.
export function InnerAlert({ data, closeDialog }: { data: AlertData | null; closeDialog: (val: boolean) => void }) {
  if (!data) return null
  return <AlertBody data={data} closeDialog={closeDialog} />
}

function AlertBody({ data, closeDialog }: { data: AlertData; closeDialog: (val: boolean) => void }) {
  const { t } = useI18n()
  const titleId = useId()
  const bodyId = useId()
  const primaryRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busy = data.type === 'loading'
  const isConfirm = data.type === 'confirm'
  // a confirmation that asks the user to accept a risk is red; a plain question is the primary colour
  const asksQuestion = isConfirm && data.icon === 'question'
  const tone: UiTone = asksQuestion ? 'primary' : TONE[data.type]

  // keyboard: Esc dismisses, focus starts on the safe choice (cancel for confirmations)
  useEffect(() => {
    const target = isConfirm ? cancelRef.current : primaryRef.current
    target?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        closeDialog(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, closeDialog, isConfirm])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-[var(--panel-overlay)] backdrop-blur-[4px]"
        style={{ zIndex: 999998 }}
        onClick={() => {
          if (!busy) closeDialog(false)
        }}
      />
      <motion.div
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={busy || undefined}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
        className="relative mx-4 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[26rem] overflow-y-auto rounded-2xl border border-[var(--win-border)] bg-[var(--win-content-bg)] p-5 text-[var(--win-text)] shadow-[var(--panel-card-shadow)] sm:mx-0 sm:w-full sm:p-6"
        style={{ zIndex: 999999 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <IconBadge size="lg" tone={tone}>
            {ICON[data.type]}
          </IconBadge>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[15px] font-bold leading-[22px]">
              {data.title}
            </h3>
            <div id={bodyId} className="mt-1.5 space-y-2 break-words text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {renderAlertText(data.description)}
            </div>
          </div>
        </div>

        {!busy ? (
          <div className="mt-5 flex flex-col-reverse gap-2 pb-[env(safe-area-inset-bottom)] sm:flex-row sm:justify-end">
            {isConfirm ? (
              <Button ref={cancelRef} variant="outline" onClick={() => closeDialog(false)} className="min-h-11 w-full sm:min-h-9 sm:w-auto sm:px-4">
                {data.cancelText || t('common.cancel')}
              </Button>
            ) : null}
            <Button
              ref={primaryRef}
              variant={isConfirm && !asksQuestion ? 'danger' : 'primary'}
              onClick={() => closeDialog(true)}
              className="min-h-11 w-full sm:min-h-9 sm:w-auto sm:px-4"
            >
              {data.confirmText || t('common.close')}
            </Button>
          </div>
        ) : null}
      </motion.div>
    </>
  )
}

export function GlobalAlert() {
  const { isOpen, data, closeDialog } = useAlertStore()

  return (
    <AnimatePresence>
      {isOpen && data && !data.windowId && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center">
          <InnerAlert data={data} closeDialog={closeDialog} />
        </div>
      )}
    </AnimatePresence>
  )
}
