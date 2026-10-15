import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, Table2, Trash2 } from 'lucide-react'
import { createDatabaseTable, type NewColumn } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

function blankColumn(first = false): NewColumn {
  return first
    ? { name: 'id', type: 'integer', nullable: false, primaryKey: true, autoIncrement: true }
    : { name: '', type: 'text', nullable: true, primaryKey: false, autoIncrement: false }
}

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

interface Props {
  databaseId: number
  open: boolean
  columnTypes: string[]
  onClose: () => void
  onCreated: () => void
}

// Table designer: columns become a CREATE TABLE statement built on the agent, never raw SQL typed here.
export function CreateTableModal({ databaseId, open, columnTypes, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [columns, setColumns] = useState<NewColumn[]>([blankColumn(true)])

  const reset = () => {
    setName('')
    setColumns([blankColumn(true)])
  }
  const close = () => {
    reset()
    onClose()
  }

  const mutation = useMutation({
    mutationFn: () => createDatabaseTable(databaseId, { name, columns }),
    onSuccess: () => {
      reset()
      onCreated()
    },
    onError: (e: unknown) => alertLib.fire(t('databases.admin.createTableFailed'), apiError(e, t('databases.actionFailed')), 'error', 'database'),
  })

  const patch = (index: number, next: Partial<NewColumn>) => setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...next } : c)))
  const nameInvalid = name.length > 0 && !IDENT.test(name)
  const ready = IDENT.test(name) && columns.length > 0 && columns.every((c) => IDENT.test(c.name))

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('databases.admin.createTable')}
      icon={<Table2 />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!ready} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('databases.admin.createTable')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('databases.admin.tableName')} error={nameInvalid ? t('databases.admin.identifierInvalid') : undefined}>
          <TextInput mono value={name} invalid={nameInvalid} onChange={(e) => setName(e.target.value)} placeholder="orders" />
        </Field>

        <div className="space-y-2">
          <span className="panel-section-label">{t('databases.admin.columns')}</span>
          {columns.map((col, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
              <TextInput mono value={col.name} onChange={(e) => patch(index, { name: e.target.value })} placeholder={t('databases.admin.columnName')} aria-label={t('databases.admin.columnName')} />
              <Select
                value={col.type}
                onChange={(value) => patch(index, { type: value })}
                options={columnTypes.map((type) => ({ value: type, label: type }))}
              />
              <div className="flex items-center justify-end gap-3">
                <label className="flex items-center gap-1.5 text-[0.75rem]">
                  <ToggleSwitch checked={col.primaryKey} onChange={() => patch(index, { primaryKey: !col.primaryKey, nullable: col.primaryKey ? col.nullable : false })} label={t('databases.admin.primaryKey')} />
                  {t('databases.admin.primaryKeyShort')}
                </label>
                <label className="flex items-center gap-1.5 text-[0.75rem]">
                  <ToggleSwitch checked={col.nullable} disabled={col.primaryKey} onChange={() => patch(index, { nullable: !col.nullable })} label={t('databases.admin.nullable')} />
                  {t('databases.admin.nullableShort')}
                </label>
                <IconButton label={t('common.delete')} tone="danger" disabled={columns.length === 1} onClick={() => setColumns((prev) => prev.filter((_, i) => i !== index))}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
              {col.type === 'varchar' ? (
                <TextInput
                  type="number"
                  min={1}
                  max={4096}
                  value={col.length ?? 255}
                  onChange={(e) => patch(index, { length: Number(e.target.value) })}
                  aria-label={t('databases.admin.length')}
                  placeholder={t('databases.admin.length')}
                />
              ) : null}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setColumns((prev) => [...prev, blankColumn()])} disabled={columns.length >= 64}>
            <Plus className="h-3.5 w-3.5" />
            {t('databases.admin.addColumn')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
