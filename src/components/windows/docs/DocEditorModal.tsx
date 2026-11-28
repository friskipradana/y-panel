import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import type { DocKind, DocPayload } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { Markdown } from '@/lib/markdown'
import { BlockEditor } from './BlockEditor'
import { DocAiRevise } from './DocAiRevise'
import { MarkdownToolbar } from './MarkdownToolbar'
import { emptyDocForm, publicLink, type DocsWindowState } from './useDocsWindow'

type EditorTab = 'visual' | 'write' | 'preview'

// Create / edit one documentation guide or article. The form is rebuilt each time it opens.
export function DocEditorModal({ dw }: { dw: DocsWindowState }) {
  const { t, editorOpen, setEditorOpen, editing, draftSeed, saveMut } = dw
  const [form, setForm] = useState<DocPayload>(emptyDocForm())
  const [tab, setTab] = useState<EditorTab>('visual')
  const contentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editorOpen) return
    setTab('visual')
    if (editing) {
      setForm({
        kind: editing.kind === 'doc' ? 'doc' : 'article',
        title: editing.title,
        slug: editing.slug,
        excerpt: editing.excerpt,
        content: editing.content,
        status: editing.status,
        isPublic: editing.isPublic,
      })
    } else if (draftSeed) {
      setForm(draftSeed)
    } else {
      setForm(emptyDocForm())
    }
  }, [editorOpen, editing, draftSeed])

  const patch = (next: Partial<DocPayload>) => setForm((prev) => ({ ...prev, ...next }))
  const ready = !!form.title.trim() && !!form.content.trim()
  const willBePublic = !!form.isPublic && form.status === 'published'

  return (
    <Modal
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      title={editing ? t('docs.editArticle') : t('docs.newArticle')}
      subtitle={t('docs.editorSubtitle')}
      size="xl"
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('docs.fieldKind')}>
            <Select
              value={form.kind ?? 'article'}
              onChange={(value) => patch({ kind: value as DocKind })}
              options={[
                { value: 'doc', label: t('docs.kind.doc') },
                { value: 'article', label: t('docs.kind.article') },
              ]}
            />
          </Field>
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
                { key: 'visual', label: t('docs.visual') },
                { key: 'write', label: t('docs.write') },
                { key: 'preview', label: t('docs.preview') },
              ]}
            />
          </div>
          {editorOpen ? (
            <div className="mb-2">
              <DocAiRevise
                key={editing?.id ?? 'new'}
                kind={form.kind === 'doc' ? 'doc' : 'article'}
                title={form.title}
                content={form.content}
                onApply={(next) => patch(next)}
              />
            </div>
          ) : null}
          {tab === 'visual' ? (
            <BlockEditor key={editing?.id ?? 'new'} value={form.content} onChange={(content) => patch({ content })} t={t} />
          ) : tab === 'write' ? (
            <>
              <div className="mb-1.5">
                <MarkdownToolbar textareaRef={contentRef} value={form.content} onChange={(content) => patch({ content })} />
              </div>
              <Textarea ref={contentRef} mono rows={14} value={form.content} onChange={(e) => patch({ content: e.target.value })} />
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
