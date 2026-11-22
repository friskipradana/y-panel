import { useEffect, useId, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { useI18n } from '@/lib/i18n'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'sheet'

const WIDTH: Record<Exclude<ModalSize, 'sheet'>, number> = { sm: 420, md: 520, lg: 720, xl: 980 }

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: ReactNode
  /** sm 420, md 520 (default), lg 720, xl 980, sheet = lembar penuh tinggi window */
  size?: ModalSize
  /** Override lebar (px) untuk kasus khusus; tetap dibatasi 100% window */
  width?: number
  /** Baris tombol aksi di bawah (Button); dipisah garis dari isi */
  footer?: ReactNode
  /** Lapisan "sedang bekerja" di atas seluruh kartu (mis. DockerProgressOverlay) */
  busyOverlay?: ReactNode
  /** Klik latar menutup dialog (default true) */
  closeOnOverlay?: boolean
  /** Tambahan class pada area isi */
  bodyClassName?: string
  /** Class pada lapisan luar; untuk window bertema sendiri (mis. terminal) yang menimpa token warna */
  className?: string
  children: ReactNode
}

// Dialog di dalam window: animasi masuk/keluar, Esc menutup, isi scroll, header/footer tetap
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  width,
  footer,
  busyOverlay,
  closeOnOverlay = true,
  bodyClassName = '',
  className = '',
  children,
}: ModalProps) {
  const { t } = useI18n()
  const titleId = useId()
  const sheet = size === 'sheet'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const px = width ?? (sheet ? undefined : WIDTH[size as Exclude<ModalSize, 'sheet'>])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="overlay"
          className={`ui-modal-overlay ${sheet ? 'ui-modal-overlay--sheet' : ''} ${className}`.trim()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => closeOnOverlay && e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`ui-modal ${sheet ? 'ui-modal--sheet' : ''}`}
            style={px ? { width: `min(100%, ${px}px)` } : undefined}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          >
            {busyOverlay}
            <div className="ui-modal__header">
              <div className="min-w-0">
                <h3 id={titleId} className="flex min-w-0 items-center gap-2 text-[15px] font-bold leading-[22px] text-[var(--win-text)]">
                  {icon ? <span className="panel-window__icon shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
                  <span className="truncate">{title}</span>
                </h3>
                {subtitle ? <p className="mt-0.5 text-[12px] leading-[16px] text-[var(--text-secondary)]">{subtitle}</p> : null}
              </div>
              <IconButton label={t('common.close')} onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className={`ui-modal__body ${bodyClassName}`.trim()}>{children}</div>
            {footer ? <div className="ui-modal__footer">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
