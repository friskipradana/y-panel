import { Check, ChevronDown, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

type SelectOption = {
  value: string
  label: string
  description?: string
  badge?: string
}

type SelectProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  buttonClassName?: string
  dropdownClassName?: string
  itemClassName?: string
  disabled?: boolean
  searchable?: boolean
  clearable?: boolean
  emptyText?: string
  dropdownWidth?: number | string
  align?: 'left' | 'right' | 'auto'
  optionLayout?: 'row' | 'stack'
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  itemClassName = '',
  disabled = false,
  searchable = false,
  clearable = false,
  emptyText,
  dropdownWidth,
  align = 'auto',
  optionLayout = 'row',
}: SelectProps) {
  const { t } = useI18n()
  const effectivePlaceholder = placeholder ?? t('common.selectOption')
  const effectiveSearchPlaceholder = searchPlaceholder ?? t('common.searchOptions')
  const effectiveEmptyText = emptyText ?? t('common.notFound')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  // The list is drawn on the page, not inside the dialog or window that holds the select, so nothing
  // clips it; it sits under the button, or above it when there is more room there
  const placePanel = useCallback(() => {
    const el = buttonRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const wanted = 320
    const up = below < Math.min(wanted, 180) && above > below

    const maxAvailWidth = window.innerWidth - 24
    let targetWidth: number
    if (typeof dropdownWidth === 'number') {
      targetWidth = Math.min(dropdownWidth, maxAvailWidth)
    } else if (typeof dropdownWidth === 'string' && dropdownWidth !== 'auto') {
      const parsed = parseInt(dropdownWidth, 10)
      targetWidth = isNaN(parsed) ? rect.width : Math.min(parsed, maxAvailWidth)
    } else {
      targetWidth = Math.min(rect.width, maxAvailWidth)
    }

    const shouldAlignRight =
      align === 'right' ||
      (align !== 'left' && (rect.left + targetWidth > window.innerWidth - 12 || rect.right > window.innerWidth * 0.65))

    let leftPos: number
    if (shouldAlignRight) {
      leftPos = Math.max(12, rect.right - targetWidth)
    } else {
      leftPos = Math.min(rect.left, window.innerWidth - targetWidth - 12)
    }

    setPanelStyle({
      position: 'fixed',
      left: leftPos,
      width: targetWidth,
      maxHeight: Math.max(140, Math.min(wanted, up ? above : below)),
      overflowX: 'hidden',
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    })
  }, [dropdownWidth, align])

  useLayoutEffect(() => {
    if (!open) return
    placePanel()
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
    return () => {
      window.removeEventListener('resize', placePanel)
      window.removeEventListener('scroll', placePanel, true)
    }
  }, [open, placePanel])

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options

    const needle = search.trim().toLowerCase()
    return options.filter((option) => {
      const haystack = [option.label, option.description, option.badge, option.value]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [options, search, searchable])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setHighlightedIndex(-1)
      return
    }

    const handler = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current && !rootRef.current.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    const nextIndex = Math.max(
      filteredOptions.findIndex((option) => option.value === value),
      filteredOptions.length > 0 ? 0 : -1,
    )
    setHighlightedIndex(nextIndex)
    if (searchable) {
      window.setTimeout(() => searchRef.current?.focus(), 30)
    }

    return () => document.removeEventListener('mousedown', handler)
  }, [open, searchable, value, filteredOptions])

  useEffect(() => {
    if (!open) return
    if (filteredOptions.length === 0) {
      setHighlightedIndex(-1)
      return
    }
    setHighlightedIndex((current) => {
      if (current < 0) return 0
      if (current >= filteredOptions.length) return filteredOptions.length - 1
      return current
    })
  }, [filteredOptions, open])

  const hasValue = value !== ''

  const commitSelection = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
    setSearch('')
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
    if (disabled) return

    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      setOpen(true)
      return
    }

    if (!open) return

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (filteredOptions.length === 0) return
      setHighlightedIndex((current) => (current + 1) % filteredOptions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (filteredOptions.length === 0) return
      setHighlightedIndex((current) => (current <= 0 ? filteredOptions.length - 1 : current - 1))
      return
    }

    if (event.key === 'Enter' && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
      event.preventDefault()
      commitSelection(filteredOptions[highlightedIndex].value)
    }
  }

  return (
    <div ref={rootRef} className={`docker-image-combobox ${className}`.trim()}>
      <div className="docker-image-combobox__input-wrap">
        <button
          id={id}
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((current) => !current)}
          onKeyDown={handleKeyDown}
          className={`panel-input docker-image-combobox__input docker-image-combobox__button${clearable ? ' docker-image-combobox__input--clearable' : ''} ${buttonClassName}`.trim()}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={selectedOption ? 'docker-image-combobox__button-label' : 'docker-image-combobox__button-placeholder'}>
            {selectedOption?.label ?? effectivePlaceholder}
          </span>
        </button>

        {clearable && hasValue && !disabled ? (
          <button
            type="button"
            className="docker-image-combobox__clear"
            onClick={() => {
              onChange('')
              setOpen(false)
              setSearch('')
              setHighlightedIndex(-1)
            }}
            title={t('common.resetSelection')}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          className="docker-image-combobox__toggle"
          onClick={() => !disabled && setOpen((current) => !current)}
          aria-label={t('common.toggleDropdown')}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open
        ? createPortal(
        <div ref={panelRef} style={panelStyle} className={`docker-image-combobox__dropdown docker-image-combobox__dropdown--floating ${dropdownClassName}`.trim()} role="listbox">
          {searchable ? (
            <div className="docker-image-combobox__search-wrap">
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={effectiveSearchPlaceholder}
                className="panel-input docker-image-combobox__search-input"
              />
            </div>
          ) : null}

          {filteredOptions.length === 0 ? (
            <div className="docker-image-combobox__empty">{effectiveEmptyText}</div>
          ) : (
            filteredOptions.map((option, index) => {
              const active = option.value === value
              const highlighted = index === highlightedIndex
              const isStacked = optionLayout === 'stack'

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`docker-image-combobox__item ${isStacked ? 'docker-image-combobox__item--stacked' : ''} ${active ? 'docker-image-combobox__item--selected' : ''} ${highlighted ? 'docker-image-combobox__item--highlighted' : ''} ${itemClassName}`.trim()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => commitSelection(option.value)}
                  role="option"
                  aria-selected={active}
                >
                  {isStacked ? (
                    <div className="docker-image-combobox__item-content">
                      <div className="docker-image-combobox__item-top">
                        <span className="docker-image-combobox__item-name">{option.label}</span>
                        {option.badge ? <span className="docker-image-combobox__item-badge panel-badge panel-badge--neutral">{option.badge}</span> : null}
                      </div>
                      {option.description ? (
                        <span className="docker-image-combobox__item-desc">{option.description}</span>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <span className="docker-image-combobox__item-name">{option.label}</span>
                      {option.badge ? <span className="docker-image-combobox__item-badge panel-badge panel-badge--neutral">{option.badge}</span> : null}
                      {option.description ? <span className="docker-image-combobox__item-size">{option.description}</span> : null}
                    </>
                  )}
                  {active ? <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-[var(--panel-primary-solid)]" /> : null}
                </button>
              )
            })
          )}
        </div>,
        document.body,
      )
        : null}
    </div>
  )
}




