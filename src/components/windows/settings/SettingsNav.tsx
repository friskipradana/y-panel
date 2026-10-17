import type { SettingsGroupDef } from './tabsConfig'
import type { SettingsTabKey } from './constants'
import { useI18n } from '@/lib/i18n'

// Phone tab strip scrolls sideways: keep the active tab in view
function keepVisibleOnPhone(el: HTMLButtonElement | null) {
  if (el?.closest('.layout-mobile')) el.scrollIntoView({ inline: 'center', block: 'nearest' })
}

interface SettingsNavProps {
  title: string
  groups: SettingsGroupDef[]
  active: SettingsTabKey | undefined
  onSelect: (key: SettingsTabKey) => void
}

// The menu of the Settings window: tabs under the name of what they are about
export function SettingsNav({ title, groups, active, onSelect }: SettingsNavProps) {
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
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
