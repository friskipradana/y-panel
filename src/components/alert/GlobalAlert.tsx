import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, HelpCircle } from 'lucide-react'
import { useAlertStore, AlertType } from '@/store/alertStore'

const iconMap: Record<AlertType, React.ReactNode> = {
  success: <CheckCircle2 className="text-emerald-400" size={32} />,
  warning: <AlertTriangle className="text-amber-400" size={32} />,
  error: <XCircle className="text-red-400" size={32} />,
  info: <Info className="text-sky-400" size={32} />,
  question: <HelpCircle className="text-violet-400" size={32} />,
  loading: <Loader2 className="text-sky-400 animate-spin" size={32} />,
  confirm: <AlertTriangle className="text-amber-400" size={32} />,
}

export function InnerAlert({ data, closeDialog }: { data: any, closeDialog: (val: boolean) => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[4px]"
        style={{ zIndex: 999998 }}
        onClick={() => {
          if (data.type !== 'loading') closeDialog(false)
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -15 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="relative w-full max-w-[340px] overflow-hidden rounded-[20px] border border-white/10 bg-white/5 p-6 text-center shadow-[0_32px_64px_rgba(0,0,0,0.6)] backdrop-blur-[48px] sm:max-w-[380px]"
        style={{
          zIndex: 999999,
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 32px 64px rgba(0,0,0,0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/5 shadow-inner ring-1 ring-white/10">
          {iconMap[data.type as AlertType]}
        </div>

        <h3 className="mb-2 text-[16px] font-semibold tracking-[-0.02em] text-white">
          {data.title}
        </h3>
        
        <div 
          className="mb-6 text-[12.5px] leading-relaxed text-slate-300"
          dangerouslySetInnerHTML={{ __html: String(data.description) }}
        />

        {data.type !== 'loading' && (
          <div className="flex w-full items-center justify-center gap-3">
            {data.type === 'confirm' && (
              <button
                onClick={() => closeDialog(false)}
                className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-400/50"
              >
                {data.cancelText || 'Batal'}
              </button>
            )}
            <button
              onClick={() => closeDialog(true)}
              className="flex-1 rounded-full border border-white/10 bg-sky-500/90 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_2px_12px_rgba(14,165,233,0.3)] transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            >
              {data.confirmText || 'Tutup'}
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
