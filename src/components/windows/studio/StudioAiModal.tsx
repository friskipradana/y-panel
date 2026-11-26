import { useEffect, useState } from 'react'
import { AlertCircle, Bot, LoaderCircle, Settings } from 'lucide-react'
import type { StudioPageKind, StudioThemeTone } from '@/api/studio'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { PageStudioWindowState } from './usePageStudioWindow'

export function StudioAiModal({ st }: { st: PageStudioWindowState }) {
  const { t, section, aiModalOpen, setAiModalOpen, aiReady, aiProvider, aiModel, aiGenMut, openAiSettings } = st
  const [kind, setKind] = useState<StudioPageKind>('landing')
  const [brandName, setBrandName] = useState('')
  const [audience, setAudience] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [themeTone, setThemeTone] = useState<StudioThemeTone>('blue')
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    if (!aiModalOpen) return
    aiGenMut.reset()
    setKind(section === 'docs' ? 'docs' : 'landing')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiModalOpen])

  const presets =
    kind === 'docs'
      ? [
          { key: 'userguide', label: t('studio.preset.userGuide'), text: t('studio.preset.userGuideText') },
          { key: 'deployguide', label: t('studio.preset.deployGuide'), text: t('studio.preset.deployGuideText') },
        ]
      : [
          { key: 'business', label: t('studio.preset.business'), text: t('studio.preset.businessText') },
          { key: 'saas', label: t('studio.preset.saas'), text: t('studio.preset.saasText') },
        ]

  const errMsg = aiGenMut.isError
    ? aiGenMut.error instanceof Error
      ? aiGenMut.error.message
      : t('studio.aiFailedFallback')
    : ''

  const close = () => {
    aiGenMut.reset()
    setAiModalOpen(false)
  }

  return (
    <Modal
      open={aiModalOpen}
      onClose={close}
      title={t('studio.aiModalTitle')}
      subtitle={aiReady ? `${aiProvider} · ${aiModel}` : t('devdesk.aiNotConfigured')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          {aiReady ? (
            <Button
              variant="primary"
              icon={<Bot className="h-3.5 w-3.5" strokeWidth={1.75} />}
              disabled={!prompt.trim()}
              loading={aiGenMut.isPending}
              onClick={() => aiGenMut.mutate({ kind, brandName, audience, ctaUrl, themeTone, prompt })}
            >
              {aiGenMut.isPending ? t('studio.aiGeneratingBtn') : t('studio.aiGenerateRun')}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => {
                close()
                openAiSettings()
              }}
            >
              {t('devdesk.openAiSettings')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {!aiReady ? (
          <div className="rounded-lg border border-[var(--panel-warning-border)] bg-[var(--panel-warning-bg)] p-3 text-[0.75rem] text-[var(--panel-warning-text)]">
            {t('devdesk.aiSetupHint')}
          </div>
        ) : null}

        {aiGenMut.isPending ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] p-3 text-[0.75rem] text-[var(--panel-primary-text)]">
            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} />
            <span>{t('studio.aiGeneratingHint', { model: aiModel || aiProvider })}</span>
          </div>
        ) : null}

        {errMsg ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-lg border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] p-3 text-[0.75rem] text-[var(--panel-danger-text)]"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-semibold">{t('studio.aiErrorTitle')}</div>
                <div className="break-words opacity-90">{errMsg}</div>
              </div>
            </div>
            <div className="pl-6">
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.75} />}
                onClick={() => {
                  close()
                  openAiSettings()
                }}
              >
                {t('devdesk.openAiSettings')}
              </Button>
            </div>
          </div>
        ) : null}

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
          <Field label={t('studio.brandLabel')}>
            <TextInput value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={t('studio.brandPh')} />
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

        {kind === 'landing' ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label={t('studio.audienceLabel')}>
              <TextInput value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={t('studio.audiencePh')} />
            </Field>
            <Field label={t('studio.ctaUrlLabel')}>
              <TextInput mono value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t('studio.ctaUrlPh')} />
            </Field>
          </div>
        ) : null}

        <Field label={t('studio.promptLabel')} hint={t('studio.promptHint')}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="panel-btn panel-btn--ghost !h-7 !px-2.5 text-[11px]"
                  onClick={() => {
                    aiGenMut.reset()
                    setPrompt(p.text)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Textarea
              rows={6}
              value={prompt}
              onChange={(e) => {
                if (aiGenMut.isError) aiGenMut.reset()
                setPrompt(e.target.value)
              }}
              placeholder={kind === 'docs' ? t('studio.promptDocsPh') : t('studio.promptLandingPh')}
            />
          </div>
        </Field>
      </div>
    </Modal>
  )
}
