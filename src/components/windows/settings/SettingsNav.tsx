import type { ComponentType } from 'react'
import { useI18n } from '@/lib/i18n'

export interface NavTab<K extends string> {
  key: K
  /** i18n key of the name */
  label: string
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
