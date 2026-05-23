import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, HelpCircle } from 'lucide-react'
import { useAlertStore, AlertType } from '@/store/alertStore'
import { useI18n } from '@/lib/i18n'

const iconMap: Record<AlertType, React.ReactNode> = {
  success: <CheckCircle2 className="text-[var(--panel-success-text)]" size={32} />,
  warning: <AlertTriangle className="text-[var(--panel-warning-text)]" size={32} />,
  error: <XCircle className="text-[var(--panel-danger-text)]" size={32} />,
  info: <Info className="text-[var(--panel-primary-text)]" size={32} />,
  question: <HelpCircle className="text-violet-400" size={32} />,
  loading: <Loader2 className="text-[var(--panel-primary-text)] animate-spin" size={32} />,
  confirm: <AlertTriangle className="text-[var(--panel-warning-text)]" size={32} />,
}

export function InnerAlert({ data, closeDialog }: { data: any, closeDialog: (val: boolean) => void }) {
  const { t } = useI18n()

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
          if (data.type !== 'loading') closeDialog(false)
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -15 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="relative w-full max-w-[340px] overflow-hidden rounded-[20px] border p-6 text-center backdrop-blur-[48px] sm:max-w-[380px]"
        style={{
          zIndex: 999999,
          color: 'var(--win-text)',
          borderColor: 'var(--win-border)',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--win-bg) 94%, transparent), color-mix(in srgb, var(--panel-surface) 88%, transparent))',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, white 28%, transparent), var(--win-shadow-focus)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-inner"
          style={{
            background: 'color-mix(in srgb, var(--panel-primary-bg) 58%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--win-border) 82%, transparent)',
          }}
        >
          {iconMap[data.type as AlertType]}
        </div>

        <h3 className="mb-2 text-[16px] font-semibold tracking-[-0.02em] text-[var(--win-text)]">
          {data.title}
        </h3>
        
        <div 
          className="mb-6 text-[12.5px] leading-relaxed text-[var(--text-secondary)]"
          dangerouslySetInnerHTML={{ __html: String(data.description) }}
        />

        {data.type !== 'loading' && (
          <div className="flex w-full items-center justify-center gap-3">
            {data.type === 'confirm' && (
              <button
                onMouseDown={(e) => { e.stopPropagation(); closeDialog(false) }}
                className="flex-1 rounded-full border px-4 py-2 text-[12px] font-medium transition focus:outline-none focus:ring-2"
                style={{
                  borderColor: 'var(--win-border)',
                  background: 'var(--panel-surface)',
                  color: 'var(--win-text)',
                  ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--win-text) 24%, transparent)',
                }}
              >
                {data.cancelText || t('common.cancel')}
              </button>
            )}
            <button
              onMouseDown={(e) => { e.stopPropagation(); closeDialog(true) }}
              className="flex-1 rounded-full border px-4 py-2 text-[12px] font-semibold text-[var(--win-text)] shadow-[0_2px_12px_rgba(14,165,233,0.3)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              style={{
                borderColor: 'color-mix(in srgb, var(--panel-primary-solid) 75%, var(--win-border))',
                background: 'linear-gradient(135deg, var(--panel-primary-solid), var(--panel-primary-text))',
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




