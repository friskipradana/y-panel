import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { StudioSection, StudioSectionType } from '@/api/studio'
import { Button } from '@/components/ui/Button'
import { TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'

interface StudioSectionsEditorProps {
  sections: StudioSection[]
  onChange: (next: StudioSection[]) => void
}

export function StudioSectionsEditor({ sections, onChange }: StudioSectionsEditorProps) {
  const { t } = useI18n()

  const typeOptions: Array<{ value: StudioSectionType; label: string }> = [
    { value: 'features', label: t('studio.sectionType.features') },
    { value: 'steps', label: t('studio.sectionType.steps') },
    { value: 'pricing', label: t('studio.sectionType.pricing') },
    { value: 'stats', label: t('studio.sectionType.stats') },
    { value: 'testimonials', label: t('studio.sectionType.testimonials') },
    { value: 'faq', label: t('studio.sectionType.faq') },
    { value: 'cta', label: t('studio.sectionType.cta') },
  ]

  const addSection = () => {
    onChange([
      ...sections,
      {
        id: `sec-${Date.now()}`,
        type: 'features',
        heading: t('studio.newSectionHeading'),
        subheading: '',
        items: [{ title: t('studio.newItemTitle'), description: '' }],
      },
    ])
  }

  const updateSec = (idx: number, patch: Partial<StudioSection>) => {
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const moveSec = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  const removeSec = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx))
  }

  const updateItem = (secIdx: number, itemIdx: number, patch: Partial<StudioSection['items'][number]>) => {
    const sec = sections[secIdx]
    const nextItems = sec.items.map((it, i) => (i === itemIdx ? { ...it, ...patch } : it))
    updateSec(secIdx, { items: nextItems })
  }

  const addItem = (secIdx: number) => {
    const sec = sections[secIdx]
    updateSec(secIdx, { items: [...sec.items, { title: '', description: '' }] })
  }

  const removeItem = (secIdx: number, itemIdx: number) => {
    const sec = sections[secIdx]
    updateSec(secIdx, { items: sec.items.filter((_, i) => i !== itemIdx) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--win-text)]">
          {t('studio.sectionsLabel')} ({sections.length})
        </span>
        <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={addSection}>
          {t('studio.addSection')}
        </Button>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--win-border)] p-3 text-center text-xs text-[var(--text-secondary)]">
          {t('studio.noSectionsHint')}
        </div>
      ) : (
        sections.map((sec, sIdx) => (
          <div key={sec.id} className="space-y-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="w-32 shrink-0">
                <Select
                  size="sm"
                  value={sec.type}
                  onChange={(v) => updateSec(sIdx, { type: v as StudioSectionType })}
                  options={typeOptions}
                />
              </div>
              <div className="min-w-0 flex-1">
                <TextInput
                  value={sec.heading}
                  onChange={(e) => updateSec(sIdx, { heading: e.target.value })}
                  placeholder={t('studio.sectionHeadingPh')}
                />
              </div>
              <IconButton label={t('studio.moveUp')} size="sm" disabled={sIdx === 0} onClick={() => moveSec(sIdx, -1)}>
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton label={t('studio.moveDown')} size="sm" disabled={sIdx === sections.length - 1} onClick={() => moveSec(sIdx, 1)}>
                <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
              <IconButton label={t('common.delete')} size="sm" tone="danger" onClick={() => removeSec(sIdx)}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            </div>

            <TextInput
              value={sec.subheading ?? ''}
              onChange={(e) => updateSec(sIdx, { subheading: e.target.value })}
              placeholder={t('studio.sectionSubheadingPh')}
            />

            <div className="space-y-2 border-t border-[var(--win-border)] pt-2">
              {sec.items.map((it, iIdx) => (
                <div key={iIdx} className="space-y-1.5 rounded-md border border-[var(--win-border)] bg-[var(--win-bar)] p-2">
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      value={it.title}
                      onChange={(e) => updateItem(sIdx, iIdx, { title: e.target.value })}
                      placeholder={t('studio.itemTitlePh')}
                    />
                    {sec.type === 'pricing' ? (
                      <TextInput
                        mono
                        value={it.price ?? ''}
                        onChange={(e) => updateItem(sIdx, iIdx, { price: e.target.value })}
                        placeholder={t('studio.itemPricePh')}
                      />
                    ) : null}
                    <IconButton label={t('common.delete')} size="sm" tone="danger" onClick={() => removeItem(sIdx, iIdx)}>
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                  <Textarea
                    rows={2}
                    value={it.description}
                    onChange={(e) => updateItem(sIdx, iIdx, { description: e.target.value })}
                    placeholder={t('studio.itemDescPh')}
                  />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => addItem(sIdx)}>
                {t('studio.addItem')}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
