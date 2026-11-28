import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  Monitor,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Tablet,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { StudioPage } from '@/api/studio'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { formatDateID } from '@/lib/datetime'
import { applyElementEdit, type ElementEdit, type PickedElement } from './previewBridge'
import { StudioChatPanel, type ChatSend } from './StudioChatPanel'
import { StudioLivePreview, type PreviewViewport } from './StudioLivePreview'
import { StudioSectionsEditor } from './StudioSectionsEditor'
import type { PageStudioWindowState } from './usePageStudioWindow'

type BuilderTab = 'chat' | 'code' | 'history' | 'settings'

const VIEWPORT_BTNS: Array<{ id: PreviewViewport; labelKey: string; Icon: typeof Monitor }> = [
  { id: 'desktop', labelKey: 'studio.viewport.desktop', Icon: Monitor },
  { id: 'tablet', labelKey: 'studio.viewport.tablet', Icon: Tablet },
  { id: 'mobile', labelKey: 'studio.viewport.mobile', Icon: Smartphone },
]

// Lovable-style split-pane workspace: AI Chat + Code/History/Settings left, Live Preview right
export function StudioBuilderWorkspace({ st, page }: { st: PageStudioWindowState; page: StudioPage }) {
  const isMobile = useIsMobileLayout()
  const {
    t,
    aiReady,
    setActivePageId,
    chatRefineMut,
    restoreVersionMut,
    savePageMut,
    publishMut,
    confirmDeletePage,
    publicUrlOf,
    copyPublicUrl,
    openAiSettings,
    openDomainRoute,
  } = st

  const [tab, setTab] = useState<BuilderTab>('chat')
  const [viewport, setViewport] = useState<PreviewViewport>('desktop')
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor')
  const [draft, setDraft] = useState<StudioPage>(page)
  const [dirty, setDirty] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<PickedElement | null>(null)

  useEffect(() => {
    setDraft(page)
    setDirty(false)
    setPicked(null)
  }, [page])

  const patchDraft = (patch: Partial<StudioPage>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const savePayload = () => ({
    id: page.id,
    payload: {
      kind: draft.kind,
      slug: draft.slug,
      title: draft.title,
      subtitle: draft.subtitle,
      status: draft.status,
      showInDocs: draft.showInDocs,
      brandName: draft.brandName,
      themeTone: draft.themeTone,
      seoDescription: draft.seoDescription,
      ctaLabel: draft.ctaLabel,
      ctaUrl: draft.ctaUrl,
      sections: draft.sections,
      markdownBody: draft.markdownBody,
      htmlCode: draft.htmlCode,
      customDomain: draft.customDomain ?? '',
      sourcePrompt: draft.sourcePrompt,
    },
  })

  const handleSaveManual = () => savePageMut.mutate(savePayload())

  // The AI works from the saved page, so unsaved edits are saved first instead of being thrown away by its answer
  const handleSendChat = async (send: ChatSend, done: () => void) => {
    if (chatRefineMut.isPending) return
    if (!aiReady) {
      openAiSettings()
      return
    }
    if (dirty) {
      try {
        await savePageMut.mutateAsync(savePayload())
      } catch {
        return
      }
    }
    chatRefineMut.mutate({ id: page.id, ...send }, { onSuccess: done })
  }

  const handleElementEdit = (edit: ElementEdit) => {
    const next = picked ? applyElementEdit(draft.htmlCode ?? '', picked, edit) : null
    if (next === null) {
      toast.error(t('studio.pick.cannot'))
      return
    }
    patchDraft({ htmlCode: next })
    setPicked(null)
  }

  const handlePick = (element: PickedElement) => {
    setPicked(element)
    setTab('chat')
    setMobileView('editor')
  }

  // A downloaded file is opened elsewhere, so stored pictures get the full address of this panel
  const downloadHtml = () => {
    if (!draft.htmlCode?.trim()) return
    const portable = draft.htmlCode.split('/api/v1/public/doc-images/').join(`${window.location.origin}/api/v1/public/doc-images/`)
    const blob = new Blob([portable], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.slug || 'page'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyHtml = () => {
    if (!draft.htmlCode?.trim()) return
    void navigator.clipboard.writeText(draft.htmlCode).then(() => toast.success(t('studio.builder.codeCopied')))
  }

  const isPub = page.status === 'published'
  const isLegacyStructured = draft.kind === 'landing' && !draft.htmlCode?.trim() && draft.sections.length > 0
  const tabItems = [
    { key: 'chat', label: t('studio.builder.tabChat') },
    { key: 'code', label: draft.kind === 'docs' ? t('studio.builder.tabManual') : t('studio.builder.tabCode') },
    { key: 'history', label: t('studio.builder.tabHistory'), count: page.versions.length },
    { key: 'settings', label: t('studio.builder.tabSettings') },
  ]

  const moreActions: ActionMenuItem[] = [
    { key: 'copy', label: t('studio.copyUrl'), onSelect: () => copyPublicUrl(page) },
    { key: 'open', label: t('studio.openLive'), onSelect: () => window.open(publicUrlOf(page), '_blank', 'noopener') },
    ...(draft.kind === 'landing' && draft.htmlCode?.trim()
      ? [{ key: 'download', label: t('studio.builder.downloadHtml'), onSelect: downloadHtml }]
      : []),
    { key: 'domain', label: t('studio.connectDomain'), onSelect: () => openDomainRoute(page) },
    { key: 'delete', label: t('common.delete'), tone: 'danger', dividerBefore: true, onSelect: () => void confirmDeletePage(page) },
  ]

  const publishBtn = (
    <button
      type="button"
      className={isPub ? 'docker-secondary-btn' : 'docker-primary-btn'}
      disabled={publishMut.isPending}
      onClick={() => publishMut.mutate({ id: page.id, published: !isPub })}
    >
      {isPub ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Send className="h-3.5 w-3.5" strokeWidth={1.75} />}
      <span>{isPub ? t('studio.unpublishAction') : t('studio.publishAction')}</span>
    </button>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`docker-topbar ${isMobile ? 'docker-topbar--mobile' : ''}`}>
        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__left'}>
          <button
            type="button"
            className="docker-icon-btn shrink-0"
            title={t('common.back')}
            aria-label={t('common.back')}
            onClick={() => setActivePageId(null)}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <FilterMenu label={t('studio.builder.tabChat')} value={tab} onChange={(v) => setTab(v as BuilderTab)} items={tabItems} />
          {!isMobile ? (
            <span className="max-w-[200px] truncate text-xs font-semibold text-[var(--win-text)]" title={draft.title}>
              {draft.title}
            </span>
          ) : (
            <button
              type="button"
              className="docker-secondary-btn ml-auto"
              onClick={() => setMobileView((v) => (v === 'editor' ? 'preview' : 'editor'))}
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{mobileView === 'editor' ? t('studio.builder.preview') : t('studio.builder.editor')}</span>
            </button>
          )}
        </div>

        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__right'}>
          {!isMobile ? (
            VIEWPORT_BTNS.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                type="button"
                className={`docker-icon-btn ${viewport === id ? 'border-[var(--panel-primary-border)] text-[var(--panel-primary-text)]' : ''}`}
                title={t(labelKey)}
                aria-label={t(labelKey)}
                onClick={() => setViewport(id)}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ))
          ) : null}
          {dirty ? (
            <button
              type="button"
              className="docker-icon-btn"
              title={t('studio.builder.discard')}
              aria-label={t('studio.builder.discard')}
              onClick={() => {
                setDraft(page)
                setDirty(false)
                setPicked(null)
              }}
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          {dirty ? (
            <button
              type="button"
              className="docker-primary-btn"
              disabled={savePageMut.isPending}
              onClick={handleSaveManual}
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('common.save')}</span>
            </button>
          ) : null}
          {publishBtn}
          <ActionMenu label={t('common.moreActions')} items={moreActions} size="md" variant="outline" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isMobile || mobileView === 'editor' ? (
          <aside className={`${isMobile ? 'w-full' : 'w-[360px] shrink-0 border-r border-[var(--win-border)]'} flex min-h-0 flex-col bg-[var(--win-bar)]`}>
            {tab === 'chat' ? (
              <StudioChatPanel
                page={page}
                pending={chatRefineMut.isPending ? (chatRefineMut.variables?.message ?? null) : null}
                busy={chatRefineMut.isPending || savePageMut.isPending}
                picked={picked}
                onElementEdit={handleElementEdit}
                onClearPicked={() => setPicked(null)}
                onSend={(send, done) => void handleSendChat(send, done)}
                t={t}
              />
            ) : tab === 'code' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
                {draft.kind === 'docs' ? (
                  <>
                    <Field label={t('studio.titleLabel')}>
                      <TextInput value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} />
                    </Field>
                    <Field label={t('studio.subtitleLabel')}>
                      <Textarea rows={2} value={draft.subtitle} onChange={(e) => patchDraft({ subtitle: e.target.value })} />
                    </Field>
                    <Field label={t('studio.markdownLabel')}>
                      <Textarea rows={16} mono value={draft.markdownBody} onChange={(e) => patchDraft({ markdownBody: e.target.value })} />
                    </Field>
                  </>
                ) : isLegacyStructured ? (
                  <>
                    <Field label={t('studio.titleLabel')}>
                      <TextInput value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} />
                    </Field>
                    <StudioSectionsEditor sections={draft.sections} onChange={(sections) => patchDraft({ sections })} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">HTML / CSS / JS</span>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" icon={<Copy className="h-3 w-3" strokeWidth={1.75} />} onClick={copyHtml}>
                          {t('common.copy')}
                        </Button>
                        <Button size="sm" variant="outline" icon={<Download className="h-3 w-3" strokeWidth={1.75} />} onClick={downloadHtml}>
                          {t('studio.builder.downloadHtml')}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={24}
                      mono
                      value={draft.htmlCode || ''}
                      onChange={(e) => patchDraft({ htmlCode: e.target.value })}
                      placeholder={t('studio.builder.codePh')}
                    />
                  </>
                )}
              </div>
            ) : tab === 'history' ? (
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {page.versions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--win-border)] p-3 text-xs text-[var(--text-secondary)]">
                    {t('studio.builder.noVersions')}
                  </div>
                ) : (
                  [...page.versions].reverse().map((v) => (
                    <div key={v.id} className="space-y-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone="neutral" size="sm">{formatDateID(v.createdAt)}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={restoreVersionMut.isPending}
                          icon={<RotateCcw className="h-3 w-3" strokeWidth={1.75} />}
                          onClick={() => restoreVersionMut.mutate({ id: page.id, versionId: v.id })}
                        >
                          {t('studio.builder.restoreBtn')}
                        </Button>
                      </div>
                      <p className="text-xs text-[var(--win-text)]">{v.summary}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                <Field label={t('studio.titleLabel')}>
                  <TextInput value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} />
                </Field>
                <Field label={t('studio.brandNameLabel')}>
                  <TextInput value={draft.brandName} onChange={(e) => patchDraft({ brandName: e.target.value })} />
                </Field>
                <Field label={t('studio.slugLabel')} hint={`/p/${draft.slug || '...'}`}>
                  <TextInput mono value={draft.slug} onChange={(e) => patchDraft({ slug: e.target.value })} />
                </Field>
                <Field label={t('studio.customDomainLabel')} hint={draft.customDomain ? `https://${draft.customDomain}` : undefined}>
                  <TextInput mono value={draft.customDomain ?? ''} placeholder={t('studio.customDomainPh')} onChange={(e) => patchDraft({ customDomain: e.target.value })} />
                </Field>
                <Field label={t('studio.seoDescLabel')}>
                  <Textarea rows={2} value={draft.seoDescription} onChange={(e) => patchDraft({ seoDescription: e.target.value })} />
                </Field>
                {draft.kind === 'docs' ? (
                  <SettingRow
                    title={t('studio.showInDocsTitle')}
                    description={t('studio.showInDocsDesc')}
                    control={<ToggleSwitch checked={draft.showInDocs} onChange={() => patchDraft({ showInDocs: !draft.showInDocs })} label={t('studio.showInDocsTitle')} />}
                  />
                ) : null}
                <Button size="sm" variant="outline" block onClick={() => openDomainRoute(page)}>
                  {t('studio.connectDomain')}
                </Button>
              </div>
            )}
          </aside>
        ) : null}

        {!isMobile || mobileView === 'preview' ? (
          <StudioLivePreview
            page={draft}
            viewport={isMobile ? 'mobile' : viewport}
            busy={chatRefineMut.isPending}
            picking={picking}
            onPickingChange={(on) => {
              setPicking(on)
              if (!on) setPicked(null)
            }}
            onPick={handlePick}
            t={t}
          />
        ) : null}
      </div>
    </div>
  )
}
