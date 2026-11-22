import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, MoreHorizontal } from 'lucide-react'
import { IconButton, type IconButtonSize, type IconButtonVariant } from '@/components/ui/IconButton'

export interface ActionMenuItem {
  key: string
  label: string
  tone?: 'default' | 'primary' | 'warning' | 'danger'
  disabled?: boolean
  loading?: boolean
  dividerBefore?: boolean
  onSelect: () => void
}

interface ActionMenuProps {
  /** Label aksesibilitas untuk tombol menu aksi lainnya */
  label: string
  items: ActionMenuItem[]
  disabled?: boolean
  loading?: boolean
  /** Gunakan compact=true di dalam baris tabel padat agar sejajar dengan tombol 26px */
  compact?: boolean
  size?: IconButtonSize
  variant?: IconButtonVariant
  align?: 'left' | 'right'
  className?: string
}

// Menu aksi kompak untuk merangkum aksi sekunder pada toolbar maupun baris tabel
export function ActionMenu({
  label,
  items,
  disabled = false,
  loading = false,
  compact = false,
  size,
  variant,
  align = 'right',
  className = '',
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  const visibleItems = items.filter(Boolean)

  const placeMenu = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const openUp = below < 180 && above > below
    const menuWidth = Math.min(220, window.innerWidth - 24)
    const shouldAlignRight = align === 'right' || rect.left + menuWidth > window.innerWidth - 12
    const leftPos = shouldAlignRight
      ? Math.max(12, rect.right - menuWidth)
      : Math.min(rect.left, window.innerWidth - menuWidth - 12)

    setMenuStyle({
      position: 'fixed',
      left: leftPos,
      width: menuWidth,
      maxHeight: Math.max(120, openUp ? above : below),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    })
  }, [align])

  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open, placeMenu])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: Event) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (visibleItems.length === 0) return null

  return (
    <>
      {compact ? (
        <button
          ref={triggerRef}
          type="button"
          className={`docker-act-btn ${className}`.trim()}
          title={label}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled || loading}
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled && !loading) setOpen((v) => !v)
          }}
        >
          {loading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </button>
      ) : (
        <IconButton
          ref={triggerRef}
          label={label}
          size={size}
          variant={variant}
          disabled={disabled}
          loading={loading}
          aria-haspopup="menu"
          aria-expanded={open}
          className={className}
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled && !loading) setOpen((v) => !v)
          }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
        </IconButton>
      )}

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={menuStyle}
              className="docker-image-combobox__dropdown docker-image-combobox__dropdown--floating"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {visibleItems.map((item) => (
                <div key={item.key}>
                  {item.dividerBefore ? <div className="panel-menu-divider" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled || item.loading}
                    onClick={() => {
                      setOpen(false)
                      item.onSelect()
                    }}
                    className={`docker-image-combobox__item ${
                      item.tone === 'danger'
                        ? 'docker-image-combobox__item--danger'
                        : item.tone === 'warning'
                          ? 'docker-image-combobox__item--warning'
                          : item.tone === 'primary'
                            ? 'docker-image-combobox__item--primary'
                            : ''
                    } disabled:opacity-50 disabled:cursor-not-allowed`.trim()}
                  >
                    <span className="docker-image-combobox__item-name flex-1">{item.label}</span>
                    {item.loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin shrink-0" strokeWidth={1.75} /> : null}
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
