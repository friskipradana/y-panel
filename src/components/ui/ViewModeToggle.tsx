import { LayoutGrid, List as ListIcon } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export type ViewMode = 'list' | 'grid'

export interface ViewModeToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  isMobile?: boolean
  className?: string
}

export function ViewModeToggle({ mode, onChange, isMobile, className = '' }: ViewModeToggleProps) {
  const { t } = useI18n()

  return (
    <div
      className={`app-catalog-view-toggle ${isMobile ? 'app-catalog-view-toggle--mobile' : ''} ${className}`}
      role="group"
      aria-label={t('common.viewMode')}
    >
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`app-catalog-view-toggle__btn ${mode === 'list' ? 'app-catalog-view-toggle__btn--active' : ''}`}
        title={t('common.viewList')}
        aria-label={t('common.viewList')}
        aria-pressed={mode === 'list'}
      >
        <ListIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`app-catalog-view-toggle__btn ${mode === 'grid' ? 'app-catalog-view-toggle__btn--active' : ''}`}
        title={t('common.viewCard')}
        aria-label={t('common.viewCard')}
        aria-pressed={mode === 'grid'}
      >
        <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}

