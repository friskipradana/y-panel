import { Plus, Trash2 } from 'lucide-react'
import type { StudioSection, StudioSectionItem, StudioSectionType } from '@/api/studio'
import { Button } from '@/components/ui/Button'
import { TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'

interface StudioSectionsEditorProps {
  sections: StudioSection[]
  onChange: (next: StudioSection[]) => void
  t: (key: string) => string
}

const EMPTY_ITEM: StudioSectionItem = { title: '', description: '' }

export function StudioSectionsEditor({ sections, onChange, t }: StudioSectionsEditorProps) {
  const addSection = (type: StudioSectionType = 'features') => {
    onChange([
      ...sections,
      { id: `sec-${Date.now()}`, type, heading: '', subheading: '', items: [{ ...EMPTY_ITEM }] },
    ])
  }

  const updateSection = (idx: number, patch: Partial<StudioSection>) => {
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const updateItem = (secIdx: number, itemIdx: number, patch: Partial<StudioSectionItem>) => {
    const sec = sections[secIdx]
    const nextItems = sec.items.map((it, i) => (i === itemIdx ? { ...it, ...patch } : it))
    updateSection(secIdx, { items: nextItems })
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.75rem] font-semibold text-[var(--win-text)]">{t('studio.sectionsHeading')}</span>
        <Button type="button" size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => addSection('features')}>
          {t('studio.addSection')}
        </Button>
      </div>

      {sections.length === 0 ? (
        <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('studio.noSectionsHint')}</p>
      ) : null}

      {sections.map((sec, sIdx) => (
        <div key={sec.id || sIdx} className="space-y-2.5 rounded-md border border-[var(--win-border)] bg-[var(--win-bar)] p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
            <Select
              size="sm"
              value={sec.type}
              onChange={(v) => updateSection(sIdx, { type: v as StudioSectionType })}
              options={[
                { value: 'features', label: t('studio.secType.features') },
                { value: 'steps', label: t('studio.secType.steps') },
                { value: 'pricing', label: t('studio.secType.pricing') },
                { value: 'faq', label: t('studio.secType.faq') },
                { value: 'cta', label: t('studio.secType.cta') },
              ]}
            />
            <TextInput
              value={sec.heading}
              onChange={(e) => updateSection(sIdx, { heading: e.target.value })}
              placeholder={t('studio.sectionHeadingPh')}
            />
            <IconButton
              size="sm"
              variant="ghost"
              tone="danger"
              label={t('common.delete')}
              onClick={() => onChange(sections.filter((_, i) => i !== sIdx))}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>

          <TextInput
            value={sec.subheading ?? ''}
            onChange={(e) => updateSection(sIdx, { subheading: e.target.value })}
            placeholder={t('studio.sectionSubheadingPh')}
          />

          <div className="space-y-2">
            {sec.items.map((item, iIdx) => (
              <div key={iIdx} className="grid grid-cols-1 gap-1.5 rounded border border-[var(--win-border)] bg-[var(--panel-surface)] p-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1.5">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <TextInput
                      value={item.title}
                      onChange={(e) => updateItem(sIdx, iIdx, { title: e.target.value })}
                      placeholder={sec.type === 'faq' ? t('studio.faqQuestionPh') : t('studio.itemTitlePh')}
                    />
                    {sec.type === 'pricing' ? (
                      <TextInput
                        mono
                        value={item.price ?? ''}
                        onChange={(e) => updateItem(sIdx, iIdx, { price: e.target.value })}
                        placeholder={t('studio.itemPricePh')}
                      />
                    ) : null}
                  </div>
                  <Textarea
                    rows={2}
                    value={item.description}
                    onChange={(e) => updateItem(sIdx, iIdx, { description: e.target.value })}
                    placeholder={sec.type === 'faq' ? t('studio.faqAnswerPh') : t('studio.itemDescPh')}
                  />
                  {sec.type === 'pricing' ? (
                    <Textarea
                      rows={2}
                      value={(item.bullets ?? []).join('\n')}
                      onChange={(e) =>
                        updateItem(sIdx, iIdx, {
                          bullets: e.target.value
                            .split('\n')
                            .map((l) => l.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder={t('studio.itemBulletsPh')}
                    />
                  ) : null}
                </div>
                <IconButton
                  size="sm"
                  variant="ghost"
                  tone="danger"
                  label={t('common.delete')}
                  onClick={() => updateSection(sIdx, { items: sec.items.filter((_, idx) => idx !== iIdx) })}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => updateSection(sIdx, { items: [...sec.items, { ...EMPTY_ITEM }] })}
            >
              {t('studio.addCard')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
