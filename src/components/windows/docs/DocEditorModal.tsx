import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { DocPayload } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { Markdown } from '@/lib/markdown'
import { emptyDocForm, publicLink, type DocsWindowState } from './useDocsWindow'

type EditorTab = 'write' | 'preview'

// Create / edit one article. The form is rebuilt from the edited doc each time it opens.
export function DocEditorModal({ dw }: { dw: DocsWindowState }) {
  const { t, editorOpen, setEditorOpen, editing, saveMut } = dw
  const [form, setForm] = useState<DocPayload>(emptyDocForm())
  const [tab, setTab] = useState<EditorTab>('write')

  useEffect(() => {
    if (!editorOpen) return
    setTab('write')
    setForm(
      editing
        ? {
            title: editing.title,
            slug: editing.slug,
            excerpt: editing.excerpt,
            content: editing.content,
            status: editing.status,
            isPublic: editing.isPublic,
          }
        : emptyDocForm(),
    )
  }, [editorOpen, editing])

  const patch = (next: Partial<DocPayload>) => setForm((prev) => ({ ...prev, ...next }))
  const ready = !!form.title.trim() && !!form.content.trim()
  const willBePublic = !!form.isPublic && form.status === 'published'

  return (
    <Modal
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      title={editing ? t('docs.editArticle') : t('docs.newArticle')}
      subtitle={t('docs.editorSubtitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setEditorOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!ready} loading={saveMut.isPending} onClick={() => saveMut.mutate({ id: editing?.id ?? null, payload: form })}>
            <Save className="h-3.5 w-3.5" />
            {t('docs.saveArticle')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('docs.fieldTitle')}>
            <TextInput value={form.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field label={t('docs.fieldSlug')} hint={t('docs.slugHint')}>
            <TextInput mono value={form.slug ?? ''} onChange={(e) => patch({ slug: e.target.value })} />
          </Field>
        </div>

        <Field label={t('docs.fieldExcerpt')}>
          <Textarea value={form.excerpt ?? ''} rows={2} onChange={(e) => patch({ excerpt: e.target.value })} />
        </Field>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="panel-section-label">{t('docs.fieldContent')}</span>
            <Tabs
              label={t('docs.fieldContent')}
              value={tab}
              onChange={setTab}
              items={[
                { key: 'write', label: t('docs.write') },
                { key: 'preview', label: t('docs.preview') },
              ]}
            />
          </div>
          {tab === 'write' ? (
            <>
              <Textarea mono rows={14} value={form.content} onChange={(e) => patch({ content: e.target.value })} />
              <p className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('docs.markdownHint')}</p>
            </>
          ) : (
            <div className="min-h-[18rem] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
              {form.content.trim() ? <Markdown source={form.content} /> : <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('docs.previewEmpty')}</p>}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('docs.fieldStatus')}>
            <Select
              value={form.status ?? 'draft'}
              onChange={(value) => patch({ status: value as DocPayload['status'] })}
              options={[
                { value: 'draft', label: t('docs.status.draft') },
                { value: 'published', label: t('docs.status.published') },
                { value: 'archived', label: t('docs.status.archived') },
              ]}
            />
          </Field>
          <div className="flex items-start gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
            <ToggleSwitch checked={!!form.isPublic} onChange={() => patch({ isPublic: !form.isPublic })} label={t('docs.fieldPublic')} />
            <div className="min-w-0">
              <div className="text-[0.8125rem] font-semibold">{t('docs.fieldPublic')}</div>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('docs.fieldPublicHint')}</p>
              {form.isPublic && form.status !== 'published' ? (
                <p className="mt-1 text-[0.75rem] text-[var(--panel-warning-text)]">{t('docs.publicNeedsPublished')}</p>
              ) : null}
              {willBePublic && form.slug ? <p className="panel-mono mt-1 break-all text-[0.75rem]">{publicLink(form.slug)}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
