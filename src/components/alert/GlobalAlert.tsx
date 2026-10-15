import { useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, HelpCircle } from 'lucide-react'
import { useAlertStore, type AlertType } from '@/store/alertStore'
import { useI18n } from '@/lib/i18n'
import { renderAlertText } from './alertText'

const iconMap: Record<AlertType, React.ReactNode> = {
  success: <CheckCircle2 className="text-[var(--panel-success-text)]" size={32} />,
  warning: <AlertTriangle className="text-[var(--panel-warning-text)]" size={32} />,
  error: <XCircle className="text-[var(--panel-danger-text)]" size={32} />,
  info: <Info className="text-[var(--panel-primary-text)]" size={32} />,
  question: <HelpCircle className="text-[var(--global-alert-question-text)]" size={32} />,
  loading: <Loader2 className="text-[var(--panel-primary-text)] animate-spin" size={32} />,
  confirm: <AlertTriangle className="text-[var(--panel-warning-text)]" size={32} />,
}

interface AlertData {
  type: AlertType
  title: string
  description: string
  confirmText?: string
  cancelText?: string
}

const BUTTON_BASE =
  'min-h-11 flex-1 rounded-full border px-4 py-2 text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:min-h-0 sm:text-[12px]'

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
        className="absolute inset-0 backdrop-blur-[5px]"
        style={{
          zIndex: 999998,
          background: 'color-mix(in srgb, var(--win-text) 32%, transparent)',
        }}
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
        initial={{ opacity: 0, scale: 0.95, y: -15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -15 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="relative mx-4 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[22rem] overflow-y-auto rounded-[20px] border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center backdrop-blur-[48px] sm:mx-0 sm:w-full sm:max-w-[24rem] sm:p-6"
        style={{
          zIndex: 999999,
          color: 'var(--win-text)',
          borderColor: 'var(--win-border)',
          background: 'var(--global-alert-card-bg)',
          boxShadow: 'var(--global-alert-card-highlight), var(--win-shadow-focus)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--panel-primary-bg) 58%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--win-border) 82%, transparent)',
          }}
        >
          {iconMap[data.type]}
        </div>

        <h3 id={titleId} className="mb-2 text-[16px] font-semibold tracking-[-0.02em] text-[var(--win-text)]">
          {data.title}
        </h3>

        <div id={bodyId} className="mb-6 break-words text-[13px] leading-relaxed text-[var(--text-secondary)] sm:text-[12.5px]">
          {renderAlertText(data.description)}
        </div>

        {!busy && (
          <div className="flex w-full flex-col-reverse items-stretch gap-2.5 sm:flex-row sm:gap-3">
            {isConfirm && (
              <button
                ref={cancelRef}
                type="button"
                onClick={() => closeDialog(false)}
                className={`${BUTTON_BASE} font-medium`}
                style={{
                  borderColor: 'var(--win-border)',
                  background: 'var(--panel-surface)',
                  color: 'var(--win-text)',
                }}
              >
                {data.cancelText || t('common.cancel')}
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              onClick={() => closeDialog(true)}
              className={`${BUTTON_BASE} font-semibold text-[var(--win-text)] shadow-[var(--global-alert-confirm-shadow)] hover:brightness-110`}
              style={{
                borderColor: 'color-mix(in srgb, var(--panel-primary-solid) 75%, var(--win-border))',
                background: 'var(--global-alert-confirm-bg)',
              }}
            >
              {data.confirmText || t('common.close')}
            </button>
          </div>
        )}
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
