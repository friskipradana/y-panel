import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import type { DocKind } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import type { DocsWindowState } from './useDocsWindow'

// Generate a Reneo documentation guide or article directly inside the Docs window
export function DocAiModal({ dw }: { dw: DocsWindowState }) {
  const { t, aiModalOpen, setAiModalOpen, kindFilter, aiGenMut } = dw
  const [kind, setKind] = useState<DocKind>('doc')
  const [topic, setTopic] = useState('')
  const [instructions, setInstructions] = useState('')
  const [autoSave, setAutoSave] = useState(false)
  const [publish, setPublish] = useState(true)
  const [isPublic, setIsPublic] = useState(true)

  useEffect(() => {
    if (!aiModalOpen) return
    setKind(kindFilter === 'article' ? 'article' : 'doc')
    setTopic('')
    setInstructions('')
    setAutoSave(false)
    setPublish(true)
    setIsPublic(true)
  }, [aiModalOpen, kindFilter])

  const submit = () => {
    aiGenMut.mutate({
      kind,
      topic: topic.trim(),
      instructions: instructions.trim(),
      autoSave,
      publish,
      isPublic,
    })
  }

  return (
    <Modal
      open={aiModalOpen}
      onClose={() => setAiModalOpen(false)}
      title={t('docs.aiModalTitle')}
      subtitle={t('docs.aiModalSubtitle')}
      icon={<Bot />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => setAiModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={aiGenMut.isPending} onClick={submit}>
            {aiGenMut.isPending ? t('docs.aiGenerating') : t('docs.aiGenerateRun')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('docs.fieldKind')}>
          <Select
            value={kind}
            onChange={(v) => setKind(v as DocKind)}
            options={[
              { value: 'doc', label: t('docs.kind.doc') },
              { value: 'article', label: t('docs.kind.article') },
            ]}
          />
        </Field>

        <Field label={t('docs.aiTopicLabel')} hint={t('docs.aiTopicHint')}>
          <TextInput
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={kind === 'doc' ? t('docs.aiTopicDocPh') : t('docs.aiTopicArticlePh')}
          />
        </Field>

        <Field label={t('docs.aiInstructionsLabel')}>
          <Textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t('docs.aiInstructionsPh')}
          />
        </Field>

        <SettingRow
          title={t('docs.aiAutoSaveTitle')}
          description={t('docs.aiAutoSaveDesc')}
          control={<ToggleSwitch checked={autoSave} onChange={() => setAutoSave((v) => !v)} label={t('docs.aiAutoSaveTitle')} />}
        />

        {autoSave ? (
          <>
            <SettingRow
              title={t('docs.aiPublishTitle')}
              description={t('docs.aiPublishDesc')}
              control={<ToggleSwitch checked={publish} onChange={() => setPublish((v) => !v)} label={t('docs.aiPublishTitle')} />}
            />
            <SettingRow
              title={t('docs.fieldPublic')}
              description={t('docs.fieldPublicHint')}
              control={<ToggleSwitch checked={isPublic} onChange={() => setIsPublic((v) => !v)} label={t('docs.fieldPublic')} />}
            />
          </>
        ) : null}
      </div>
    </Modal>
  )
}
