import { useState } from 'react'
import { Database } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { DatabasesWindowState } from './useDatabasesWindow'

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/

export function CreateDatabaseModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, engines, showCreate, setShowCreate, createMut } = dbw
  const [name, setName] = useState('')
  const [engineId, setEngineId] = useState('postgres')
  const [version, setVersion] = useState('')

  const engine = engines.find((item) => item.id === engineId)
  const selectedVersion = version || engine?.defaultVersion || ''
  const nameInvalid = name.length > 0 && !NAME_PATTERN.test(name)
  const ready = NAME_PATTERN.test(name) && !!engine

  const close = () => {
    setShowCreate(false)
    setName('')
    setVersion('')
  }

  return (
    <Modal
      open={showCreate}
      onClose={close}
      title={t('databases.createTitle')}
      subtitle={t('databases.createSubtitle')}
      icon={<Database />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={createMut.isPending}
            onClick={() => createMut.mutate({ name, engine: engineId, version: selectedVersion === engine?.defaultVersion ? undefined : selectedVersion })}
          >
            {t('databases.createAction')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('databases.engine')}>
          <Select
            value={engineId}
            onChange={(value) => {
              setEngineId(value)
              setVersion('')
            }}
            options={engines.map((item) => ({ value: item.id, label: item.label, description: `:${item.port}` }))}
          />
        </Field>
        <Field label={t('databases.name')} hint={t('databases.nameHint')} error={nameInvalid ? t('databases.nameInvalid') : undefined}>
          <TextInput mono value={name} invalid={nameInvalid} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder={t('databases.namePlaceholder')} />
        </Field>
        <Field label={t('databases.version')} hint={t('databases.versionHint', { version: engine?.defaultVersion ?? '' })}>
          <Select
            value={selectedVersion}
            onChange={setVersion}
            options={(engine?.versions ?? []).map((v) => ({
              value: v,
              label: v,
              description: v === engine?.defaultVersion ? t('databases.versionDefault') : undefined,
            }))}
          />
        </Field>
        <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('databases.localOnlyNote')}</p>
      </div>
    </Modal>
  )
}
