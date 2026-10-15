import { motion, AnimatePresence } from 'framer-motion'
import type { FileManagerState } from './useFileManager'

export function FileActionModal({ fm }: { fm: FileManagerState }) {
  const {
    modal,
    setModal,
    renderModalContent,
  } = fm

  return (
    <AnimatePresence>
      {modal && (
        <div className="absolute inset-0 z-[50] flex items-center justify-center p-4 mobile:fixed">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[var(--panel-overlay)] backdrop-blur-[4px]"
            onClick={() => setModal(null)}
          />
          {/* Dialog Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -15 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="relative w-full max-w-[340px] overflow-hidden rounded-[20px] border border-[var(--win-border)] p-6 backdrop-blur-[48px] sm:max-w-[370px]"
            style={{
              background: 'var(--menu-bg)',
              boxShadow: 'var(--menu-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {renderModalContent()}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
