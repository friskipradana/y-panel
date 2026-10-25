import type { CSSProperties, ComponentType } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Info } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'

export interface NavTab<K extends string> {
  key: K
  /** i18n key of the name */
  label: string
  /** i18n key of the description */
  desc?: string
  icon: ComponentType<{ size?: number; className?: string }>
  /** A number shown at the end of the line (orders, vouchers) */
  count?: number
}

export interface NavGroup<K extends string> {
  key: string
  /** i18n key of the name of the group */
  label: string
  tabs: NavTab<K>[]
}

// Phone tab strip scrolls sideways: keep the active tab in view
function keepVisibleOnPhone(el: HTMLButtonElement | null) {
  if (el?.closest('.layout-mobile')) el.scrollIntoView({ inline: 'center', block: 'nearest' })
}

interface SettingsNavProps<K extends string> {
  title: string
  groups: NavGroup<K>[]
  active: K | undefined
  onSelect: (key: K) => void
}

// The menu of the Settings window, and of the Hosting window: tabs under the name of what they are about
export function SettingsNav<K extends string>({ title, groups, active, onSelect }: SettingsNavProps<K>) {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()

  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const [infoOpen, setInfoOpen] = useState(false)
  const infoBtnRef = useRef<HTMLButtonElement>(null)
  const infoPanelRef = useRef<HTMLDivElement>(null)
  const [infoPanelStyle, setInfoPanelStyle] = useState<CSSProperties>({})

  const allTabs = useMemo(() => groups.flatMap((g) => g.tabs), [groups])
  const activeTab = useMemo(() => allTabs.find((tab) => tab.key === active) ?? allTabs[0], [allTabs, active])

  const placePanel = useCallback(() => {
    const el = buttonRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const wanted = 360
    const up = below < Math.min(wanted, 180) && above > below

    const targetWidth = Math.min(rect.width, window.innerWidth - 24)
    const leftPos = Math.max(12, Math.min(rect.left, window.innerWidth - targetWidth - 12))

    setPanelStyle({
      position: 'fixed',
      left: leftPos,
      width: targetWidth,
      maxHeight: Math.max(140, Math.min(wanted, up ? above : below)),
      overflowY: 'auto',
      overflowX: 'hidden',
      zIndex: 60000,
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    })
  }, [])

  const placeInfoPanel = useCallback(() => {
    const el = infoBtnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const targetWidth = Math.min(280, window.innerWidth - 24)
    const leftPos = Math.max(12, rect.right - targetWidth)

    setInfoPanelStyle({
      position: 'fixed',
      left: leftPos,
      width: targetWidth,
      top: rect.bottom + 6,
      zIndex: 60000,
    })
  }, [])

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

  useLayoutEffect(() => {
    if (!infoOpen) return
    placeInfoPanel()
    window.addEventListener('resize', placeInfoPanel)
    window.addEventListener('scroll', placeInfoPanel, true)
    return () => {
      window.removeEventListener('resize', placeInfoPanel)
      window.removeEventListener('scroll', placeInfoPanel, true)
    }
  }, [infoOpen, placeInfoPanel])

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!infoOpen) return
    const onDown = (e: Event) => {
      if (
        infoBtnRef.current?.contains(e.target as Node) ||
        infoPanelRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setInfoOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfoOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [infoOpen])

  // Mobile mode: clean Cloudflare-style dropdown navigation + Info popover
  if (isMobile) {
    const ActiveIcon = activeTab?.icon

    return (
      <div className="settings-mobile-nav">
        <button
          ref={buttonRef}
          type="button"
          className="docker-dropdown-btn settings-mobile-nav__btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            setInfoOpen(false)
            setOpen((v) => !v)
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {ActiveIcon ? <ActiveIcon size={14} className="shrink-0 opacity-80 text-[var(--panel-primary-text)]" /> : null}
            <span className="truncate text-left font-medium">
              {activeTab ? t(activeTab.label) : title}
            </span>
          </div>
          {activeTab?.count !== undefined ? (
            <span className="docker-dropdown-item__count mr-1 shrink-0 font-mono text-[11px]">{activeTab.count}</span>
          ) : null}
          <ChevronDown className={`h-3.5 w-3.5 opacity-70 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.75} />
        </button>

        {activeTab?.desc ? (
          <button
            ref={infoBtnRef}
            type="button"
            className={`settings-mobile-nav__info-btn ${infoOpen ? 'settings-mobile-nav__info-btn--active' : ''}`}
            title={t('common.info') || 'Info'}
            aria-label={t('common.info') || 'Info'}
            aria-expanded={infoOpen}
            onClick={() => {
              setOpen(false)
              setInfoOpen((v) => !v)
            }}
          >
            <Info size={15} strokeWidth={1.75} />
          </button>
        ) : null}

        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={panelRef}
                style={panelStyle}
                className="docker-dropdown-menu settings-mobile-nav__dropdown"
                role="listbox"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {groups.map((group) => (
                  <div key={group.key} className="settings-mobile-nav__group" role="group" aria-label={t(group.label)}>
                    {groups.length > 1 ? (
                      <div className="settings-mobile-nav__group-label">
                        {t(group.label)}
                      </div>
                    ) : null}
                    {group.tabs.map((tab) => {
                      const isActive = active === tab.key
                      const Icon = tab.icon
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`docker-dropdown-item settings-mobile-nav__item ${isActive ? 'docker-dropdown-item--active' : ''}`}
                          onClick={() => {
                            onSelect(tab.key)
                            setOpen(false)
                            setInfoOpen(false)
                          }}
                        >
                          <span className="flex items-center gap-2 min-w-0 truncate">
                            <Icon size={14} className="shrink-0 opacity-75" />
                            <span className="truncate">{t(tab.label)}</span>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0 ml-2">
                            {tab.count !== undefined ? (
                              <span className="docker-dropdown-item__count font-mono text-[11px]">{tab.count}</span>
                            ) : null}
                            {isActive ? <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>,
              document.body
            )
          : null}

        {infoOpen && activeTab?.desc && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={infoPanelRef}
                style={infoPanelStyle}
                className="settings-mobile-nav__popover"
                role="tooltip"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-2">
                  <Info size={14} className="shrink-0 mt-0.5 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
                  <p className="min-w-0 text-[12px] leading-relaxed text-[var(--win-text)] m-0">
                    {t(activeTab.desc)}
                  </p>
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    )
  }

  // Desktop mode: untouched vertical sidebar navigation
  return (
    <nav className="settings-nav" aria-label={title}>
      <p className="settings-nav__title">{title}</p>
      {groups.map((group) => (
        <div key={group.key} className="settings-nav__group" role="group" aria-label={t(group.label)}>
          <p className="settings-nav__label">{t(group.label)}</p>
          {group.tabs.map((tab) => {
            const isActive = active === tab.key
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelect(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                ref={isActive ? keepVisibleOnPhone : undefined}
                className={`settings-nav__item${isActive ? ' settings-nav__item--active' : ''}`}
              >
                <Icon size={14} className="settings-nav__icon" />
                <span className="truncate">{t(tab.label)}</span>
                {tab.count !== undefined ? <span className="settings-nav__count">{tab.count}</span> : null}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
