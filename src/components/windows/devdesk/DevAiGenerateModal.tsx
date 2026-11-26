import { useEffect, useState } from 'react'
import { AlertCircle, Bot, LoaderCircle, Settings } from 'lucide-react'
import type { DevDocKind } from '@/api/devdesk'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { DevDeskWindowState } from './useDevDeskWindow'

export function DevAiGenerateModal({ dd }: { dd: DevDeskWindowState }) {
  const { t, section, aiModalOpen, setAiModalOpen, aiReady, aiProvider, aiModel, aiGenMut, openAiSettings } = dd
  const [kind, setKind] = useState<DevDocKind>('quotation')
  const [clientName, setClientName] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [budgetHint, setBudgetHint] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!aiModalOpen) return
    aiGenMut.reset()
    setKind(section === 'invoices' ? 'invoice' : 'quotation')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiModalOpen])

  const presets = [
    { key: 'website', label: t('devdesk.preset.website'), text: t('devdesk.preset.websiteText') },
    { key: 'webapp', label: t('devdesk.preset.webapp'), text: t('devdesk.preset.webappText') },
    { key: 'maintenance', label: t('devdesk.preset.maintenance'), text: t('devdesk.preset.maintenanceText') },
  ]

  const errMsg = aiGenMut.isError
    ? (aiGenMut.error instanceof Error ? aiGenMut.error.message : t('devdesk.aiFailedFallback'))
    : ''

  const close = () => {
    aiGenMut.reset()
    setAiModalOpen(false)
  }

  return (
    <Modal
      open={aiModalOpen}
      onClose={close}
      title={t('devdesk.aiModalTitle')}
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
              disabled={!notes.trim()}
              loading={aiGenMut.isPending}
              onClick={() => aiGenMut.mutate({ kind, clientName, clientCompany, budgetHint, notes })}
            >
              {aiGenMut.isPending ? t('devdesk.aiGeneratingBtn') : t('devdesk.aiGenerateRun')}
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
            <span>{t('devdesk.aiGeneratingHint', { model: aiModel || aiProvider })}</span>
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
                <div className="font-semibold">{t('devdesk.aiErrorTitle')}</div>
                <div className="break-words opacity-90">{errMsg}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
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
          <Field label={t('devdesk.kindLabel')}>
            <Select
              value={kind}
              onChange={(v) => setKind(v as DevDocKind)}
              options={[
                { value: 'quotation', label: t('devdesk.kind.quotation') },
                { value: 'invoice', label: t('devdesk.kind.invoice') },
              ]}
            />
          </Field>
          <Field label={t('devdesk.clientLabel')}>
            <TextInput value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('devdesk.clientPlaceholder')} />
          </Field>
          <Field label={t('devdesk.companyLabel')}>
            <TextInput value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
          </Field>
        </div>

        <Field label={t('devdesk.aiBudgetLabel')}>
          <TextInput value={budgetHint} onChange={(e) => setBudgetHint(e.target.value)} placeholder={t('devdesk.aiBudgetPlaceholder')} />
        </Field>

        <Field label={t('devdesk.aiNotesLabel')} hint={t('devdesk.aiNotesHint')}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="panel-btn panel-btn--ghost !h-7 !px-2.5 text-[11px]"
                  onClick={() => {
                    aiGenMut.reset()
                    setNotes(p.text)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Textarea
              rows={7}
              value={notes}
              onChange={(e) => {
                if (aiGenMut.isError) aiGenMut.reset()
                setNotes(e.target.value)
              }}
              placeholder={t('devdesk.aiNotesPlaceholder')}
            />
          </div>
        </Field>
      </div>
    </Modal>
  )
}
