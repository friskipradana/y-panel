import { useEffect, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import type { StudioPageKind, StudioPageStatus, StudioSection, StudioThemeTone } from '@/api/studio'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { Markdown } from '@/lib/markdown'
import { StudioSectionsEditor } from './StudioSectionsEditor'
import type { PageStudioWindowState } from './usePageStudioWindow'

export function StudioEditorModal({ st }: { st: PageStudioWindowState }) {
  const { t, editingPage, setEditingPage, draftSeed, setDraftSeed, savePageMut } = st
  const open = Boolean(editingPage || draftSeed)

  const [kind, setKind] = useState<StudioPageKind>('landing')
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [status, setStatus] = useState<StudioPageStatus>('published')
  const [showInDocs, setShowInDocs] = useState(true)
  const [brandName, setBrandName] = useState('')
  const [themeTone, setThemeTone] = useState<StudioThemeTone>('blue')
  const [seoDescription, setSeoDescription] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [sections, setSections] = useState<StudioSection[]>([])
  const [markdownBody, setMarkdownBody] = useState('')
  const [sourcePrompt, setSourcePrompt] = useState('')
  const [previewMd, setPreviewMd] = useState(false)

  useEffect(() => {
    if (editingPage) {
      setKind(editingPage.kind)
      setSlug(editingPage.slug)
      setTitle(editingPage.title)
      setSubtitle(editingPage.subtitle)
      setStatus(editingPage.status)
      setShowInDocs(editingPage.showInDocs)
      setBrandName(editingPage.brandName)
      setThemeTone(editingPage.themeTone)
      setSeoDescription(editingPage.seoDescription)
      setCtaLabel(editingPage.ctaLabel)
      setCtaUrl(editingPage.ctaUrl)
      setSections(editingPage.sections ?? [])
      setMarkdownBody(editingPage.markdownBody)
      setSourcePrompt(editingPage.sourcePrompt)
      setPreviewMd(false)
      return
    }
    if (draftSeed) {
      const gen = draftSeed.generated
      setKind(draftSeed.kind)
      setSlug(gen?.slug ?? '')
      setTitle(gen?.title ?? '')
      setSubtitle(gen?.subtitle ?? '')
      setStatus('published')
      setShowInDocs(draftSeed.kind === 'docs')
      setBrandName(gen?.brandName ?? '')
      setThemeTone(gen?.themeTone ?? 'blue')
      setSeoDescription(gen?.seoDescription ?? '')
      setCtaLabel(gen?.ctaLabel ?? '')
      setCtaUrl(gen?.ctaUrl ?? '')
      setSections(gen?.sections ?? [])
      setMarkdownBody(gen?.markdownBody ?? '')
      setSourcePrompt(draftSeed.sourcePrompt ?? '')
      setPreviewMd(false)
    }
  }, [editingPage, draftSeed])

  const close = () => {
    setEditingPage(null)
    setDraftSeed(null)
  }

  const handleSave = (publishNow?: boolean) => {
    const nextStatus: StudioPageStatus = publishNow === undefined ? status : publishNow ? 'published' : 'draft'
    savePageMut.mutate({
      id: editingPage?.id,
      payload: {
        kind,
        slug: slug.trim(),
        title: title.trim(),
        subtitle: subtitle.trim(),
        status: nextStatus,
        showInDocs: kind === 'docs' ? showInDocs : false,
        brandName: brandName.trim(),
        themeTone,
        seoDescription: seoDescription.trim(),
        ctaLabel: ctaLabel.trim(),
        ctaUrl: ctaUrl.trim(),
        sections,
        markdownBody,
        sourcePrompt,
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editingPage ? `${t('studio.editPage')} · /p/${editingPage.slug}` : t('studio.newPage')}
      size="xl"
      footer={
        <>
          <div className="mr-auto text-[0.75rem] text-[var(--text-secondary)]">
            URL: <span className="panel-mono text-[var(--win-text)]">/p/{slug.trim() || '...'}</span>
          </div>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" disabled={!title.trim()} loading={savePageMut.isPending} onClick={() => handleSave(false)}>
            {t('studio.saveDraftBtn')}
          </Button>
          <Button variant="primary" disabled={!title.trim()} loading={savePageMut.isPending} onClick={() => handleSave(true)}>
            {t('studio.savePublishBtn')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Field label={t('studio.kindLabel')}>
            <Select
              value={kind}
              onChange={(v) => setKind(v as StudioPageKind)}
              options={[
                { value: 'landing', label: t('studio.kind.landing') },
                { value: 'docs', label: t('studio.kind.docs') },
              ]}
            />
          </Field>
          <Field label={t('studio.slugLabel')}>
            <TextInput mono value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('studio.slugPh')} />
          </Field>
          <Field label={t('studio.toneLabel')}>
            <Select
              value={themeTone}
              onChange={(v) => setThemeTone(v as StudioThemeTone)}
              options={[
                { value: 'blue', label: t('studio.tone.blue') },
                { value: 'emerald', label: t('studio.tone.emerald') },
                { value: 'slate', label: t('studio.tone.slate') },
                { value: 'amber', label: t('studio.tone.amber') },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Field label={t('studio.titleLabel')}>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('studio.titlePh')} />
          </Field>
          <Field label={t('studio.brandLabel')}>
            <TextInput value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={t('studio.brandPh')} />
          </Field>
        </div>

        <Field label={t('studio.subtitleLabel')}>
          <Textarea rows={2} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </Field>

        {kind === 'landing' ? (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field label={t('studio.ctaLabel')}>
                <TextInput value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder={t('studio.ctaLabelPh')} />
              </Field>
              <Field label={t('studio.ctaUrlLabel')}>
                <TextInput mono value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t('studio.ctaUrlPh')} />
              </Field>
            </div>
            <StudioSectionsEditor sections={sections} onChange={setSections} t={t} />
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
              <span className="text-[0.75rem] text-[var(--win-text)]">{t('studio.syncDocsLabel')}</span>
              <ToggleSwitch checked={showInDocs} onChange={() => setShowInDocs((v) => !v)} label={t('studio.syncDocsLabel')} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="panel-section-label mb-0">{t('studio.markdownLabel')}</label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={previewMd ? <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  onClick={() => setPreviewMd((v) => !v)}
                >
                  {previewMd ? t('common.edit') : t('studio.previewBtn')}
                </Button>
              </div>
              {previewMd ? (
                <div className="max-h-[320px] overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
                  <Markdown source={markdownBody} />
                </div>
              ) : (
                <Textarea rows={12} mono value={markdownBody} onChange={(e) => setMarkdownBody(e.target.value)} placeholder={t('studio.markdownPh')} />
              )}
            </div>
          </div>
        )}

        <Field label={t('studio.seoDescLabel')}>
          <TextInput value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder={t('studio.seoDescPh')} />
        </Field>
      </div>
    </Modal>
  )
}
