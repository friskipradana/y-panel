import { useState } from 'react'
import { Bot, Settings } from 'lucide-react'
import type { DevDocKind } from '@/api/devdesk'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { DevDeskWindowState } from './useDevDeskWindow'

export function DevAiGenerateModal({ dd }: { dd: DevDeskWindowState }) {
  const { t, aiModalOpen, setAiModalOpen, aiReady, aiProvider, aiModel, aiGenMut, openAiSettings } = dd
  const [kind, setKind] = useState<DevDocKind>('quotation')
  const [clientName, setClientName] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [budgetHint, setBudgetHint] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <Modal
      open={aiModalOpen}
      onClose={() => setAiModalOpen(false)}
      title={t('devdesk.aiModalTitle')}
      subtitle={aiReady ? `${aiProvider} · ${aiModel}` : t('devdesk.aiNotConfigured')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setAiModalOpen(false)}>
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
              {t('devdesk.aiGenerateRun')}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => {
                setAiModalOpen(false)
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
          <Textarea rows={7} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('devdesk.aiNotesPlaceholder')} />
        </Field>
      </div>
    </Modal>
  )
}
