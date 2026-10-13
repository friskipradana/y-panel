import { Layers3, Pencil, Search, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { IconButton } from '@/components/ui/IconButton'

export function CloudflareSplit({
  leftTitle,
  leftSubtitle,
  rightTitle,
  rightSubtitle,
  leftSearch,
  onLeftSearch,
  rightSearch,
  onRightSearch,
  leftPlaceholder,
  rightPlaceholder,
  leftLoading,
  rightLoading,
  emptyLeft,
  emptyRight,
  leftItems,
  rightItems,
  rightTopSlot,
}: {
  leftTitle: string
  leftSubtitle: string
  rightTitle: string
  rightSubtitle: string
  leftSearch: string
  onLeftSearch: (value: string) => void
  rightSearch: string
  onRightSearch: (value: string) => void
  leftPlaceholder: string
  rightPlaceholder: string
  leftLoading: boolean
  rightLoading: boolean
  emptyLeft: string
  emptyRight: string
  leftItems: React.ReactNode[]
  rightItems: React.ReactNode[]
  rightTopSlot?: React.ReactNode
}) {
  const { t } = useI18n()

  return (
    <div className="cloudflare-workspace">
      <section className="cloudflare-pane cloudflare-pane--nav">
        <PaneHeader title={leftTitle} subtitle={leftSubtitle} search={leftSearch} onSearch={onLeftSearch} placeholder={leftPlaceholder} />
        <div className="cloudflare-pane__list">
          {leftLoading ? <LoadingState text={t('tunnels.loadingData')} /> : leftItems.length ? leftItems : <Empty text={emptyLeft} />}
        </div>
      </section>
      <section className="cloudflare-pane cloudflare-pane--detail">
        <PaneHeader title={rightTitle} subtitle={rightSubtitle} search={rightSearch} onSearch={onRightSearch} placeholder={rightPlaceholder} topSlot={rightTopSlot} />
        <div className="cloudflare-pane__content">
          {rightLoading ? <LoadingState text={t('tunnels.loadingDetail')} /> : rightItems.length ? rightItems : <Empty text={emptyRight} />}
        </div>
      </section>
    </div>
  )
}

export function PaneHeader({ title, subtitle, search, onSearch, placeholder, topSlot }: { title: string; subtitle: string; search: string; onSearch: (value: string) => void; placeholder: string; topSlot?: React.ReactNode }) {
  return (
    <div className="cloudflare-pane__header">
      {topSlot ? <div className="cloudflare-pane__top-slot">{topSlot}</div> : null}
      <div className="min-w-0">
        <div className="cloudflare-pane__title">{title}</div>
        <div className="cloudflare-pane__subtitle">{subtitle}</div>
      </div>
      <label className="panel-search cloudflare-pane__search">
        <Search className="h-4 w-4" />
        <input value={search} onChange={(e) => onSearch(e.target.value)} className="panel-search__input" placeholder={placeholder} />
      </label>
    </div>
  )
}

export function LoadingState({ text }: { text: string }) {
  const { t } = useI18n()

  return (
    <div className="cloudflare-loading-state" role="status" aria-live="polite">
      <div className="cloudflare-loading-state__orb">
        <span />
      </div>
      <div className="cloudflare-loading-state__content">
        <strong>{text}</strong>
        <p>{t('tunnels.loadingHint')}</p>
      </div>
      <div className="cloudflare-loading-state__bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="panel-empty cloudflare-empty"><Layers3 className="h-8 w-8" /><span>{text}</span></div>
}

export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  return (
    <>
      <IconButton onClick={onEdit} label={t('common.edit')}><Pencil className="h-3.5 w-3.5" /></IconButton>
      <IconButton onClick={onDelete} tone="danger" label={t('common.delete')}><Trash2 className="h-3.5 w-3.5" /></IconButton>
    </>
  )
}
