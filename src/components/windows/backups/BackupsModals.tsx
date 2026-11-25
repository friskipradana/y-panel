import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Select } from '@/components/ui/Select'
import type { BackupsWindowState } from './useBackupsWindow'

export function BackupsModals({ bw }: { bw: BackupsWindowState }) {
  return (
    <>
      <AddTargetModal bw={bw} />
      <AddJobModal bw={bw} />
    </>
  )
}

function AddTargetModal({ bw }: { bw: BackupsWindowState }) {
  const { t, addTargetOpen, setAddTargetOpen, createTargetMut, overviewQ } = bw
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'local' | 's3'>('s3')
  const [localDir, setLocalDir] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('auto')
  const [bucket, setBucket] = useState('')
  const [prefix, setPrefix] = useState('reneo-backups')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [forcePathStyle, setForcePathStyle] = useState(true)

  useEffect(() => {
    if (addTargetOpen && !localDir && overviewQ.data?.defaultLocalDir) {
      setLocalDir(overviewQ.data.defaultLocalDir)
    }
  }, [addTargetOpen, localDir, overviewQ.data?.defaultLocalDir])

  const submit = () => {
    createTargetMut.mutate(
      {
        name: name.trim(),
        kind,
        localDir: kind === 'local' ? localDir.trim() : undefined,
        s3Endpoint: kind === 's3' ? endpoint.trim() : undefined,
        s3Region: kind === 's3' ? region.trim() || 'auto' : undefined,
        s3Bucket: kind === 's3' ? bucket.trim() : undefined,
        s3Prefix: kind === 's3' ? prefix.trim() : undefined,
        s3AccessKey: kind === 's3' ? accessKey.trim() : undefined,
        s3SecretKey: kind === 's3' ? secretKey.trim() : undefined,
        s3ForcePathStyle: forcePathStyle,
      },
      {
        onSuccess: () => {
          setName('')
          setAccessKey('')
          setSecretKey('')
        },
      },
    )
  }

  const valid =
    Boolean(name.trim()) &&
    (kind === 'local' || (Boolean(bucket.trim()) && Boolean(accessKey.trim()) && Boolean(secretKey.trim())))

  return (
    <Modal open={addTargetOpen} onClose={() => setAddTargetOpen(false)} title={t('backups.addTargetTitle')} size="md">
      <div className="space-y-3">
        <Field label={t('backups.targetNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('backups.targetNamePlaceholder')} />
        </Field>
        <Field label={t('backups.targetKindLabel')}>
          <Select
            value={kind}
            onChange={(v) => setKind(v as 'local' | 's3')}
            options={[
              { value: 's3', label: t('backups.s3Option') },
              { value: 'local', label: t('backups.localStorage') },
            ]}
          />
        </Field>
        {kind === 'local' ? (
          <Field label={t('backups.localDirLabel')}>
            <TextInput className="panel-input--mono" value={localDir} onChange={(e) => setLocalDir(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label={t('backups.s3EndpointLabel')} hint={t('backups.s3EndpointHint')}>
              <TextInput className="panel-input--mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t('backups.s3BucketLabel')}>
                <TextInput className="panel-input--mono" value={bucket} onChange={(e) => setBucket(e.target.value)} />
              </Field>
              <Field label={t('backups.s3RegionLabel')}>
                <TextInput className="panel-input--mono" value={region} onChange={(e) => setRegion(e.target.value)} />
              </Field>
            </div>
            <Field label={t('backups.s3PrefixLabel')}>
              <TextInput className="panel-input--mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t('backups.s3AccessKeyLabel')}>
                <TextInput className="panel-input--mono" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
              </Field>
              <Field label={t('backups.s3SecretKeyLabel')}>
                <PasswordInput value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
              </Field>
            </div>
            <Checkbox checked={forcePathStyle} onChange={setForcePathStyle} label={t('backups.s3PathStyleLabel')} />
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setAddTargetOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" disabled={!valid} loading={createTargetMut.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AddJobModal({ bw }: { bw: BackupsWindowState }) {
  const { t, addJobOpen, setAddJobOpen, createJobMut, overviewQ } = bw
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'database' | 'project'>('database')
  const [resourceId, setResourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [intervalHours, setIntervalHours] = useState('24')
  const [retentionCount, setRetentionCount] = useState('7')
  const [enabled, setEnabled] = useState(true)

  const targets = overviewQ.data?.targets ?? []
  const databases = overviewQ.data?.databases ?? []
  const projects = overviewQ.data?.projects ?? []

  useEffect(() => {
    if (!addJobOpen) return
    if (!targetId && targets.length > 0) setTargetId(String(targets[0].id))
  }, [addJobOpen, targetId, targets])

  const resourceOptions =
    scope === 'database'
      ? databases.map((d) => ({ value: String(d.id), label: `${d.name} (${d.engine})` }))
      : projects.map((p) => ({ value: String(p.id), label: p.name, description: p.workingDir }))

  const submit = () => {
    createJobMut.mutate(
      {
        name: name.trim() || undefined,
        scope,
        resourceId: Number(resourceId),
        targetId: Number(targetId),
        intervalHours: Number(intervalHours) || 0,
        retentionCount: Math.max(1, Number(retentionCount) || 7),
        enabled,
      },
      {
        onSuccess: () => {
          setName('')
          setResourceId('')
        },
      },
    )
  }

  return (
    <Modal open={addJobOpen} onClose={() => setAddJobOpen(false)} title={t('backups.addJobTitle')} size="md">
      <div className="space-y-3">
        <Field label={t('backups.jobNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('backups.jobNamePlaceholder')} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('backups.scopeLabel')}>
            <Select
              value={scope}
              onChange={(v) => {
                setScope(v as 'database' | 'project')
                setResourceId('')
              }}
              options={[
                { value: 'database', label: t('backups.scopeDatabase') },
                { value: 'project', label: t('backups.scopeProject') },
              ]}
            />
          </Field>
          <Field label={t('backups.targetLabel')}>
            <Select
              value={targetId}
              onChange={setTargetId}
              options={targets.map((tg) => ({ value: String(tg.id), label: `${tg.name} (${tg.kind})` }))}
            />
          </Field>
        </div>
        <Field label={t('backups.resourceLabel')}>
          <Select searchable value={resourceId} onChange={setResourceId} options={resourceOptions} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('backups.intervalLabel')}>
            <Select
              value={intervalHours}
              onChange={setIntervalHours}
              options={[
                { value: '0', label: t('backups.manualOnly') },
                { value: '6', label: t('backups.everyHours', { hours: 6 }) },
                { value: '12', label: t('backups.everyHours', { hours: 12 }) },
                { value: '24', label: t('backups.everyHours', { hours: 24 }) },
                { value: '168', label: t('backups.everyHours', { hours: 168 }) },
              ]}
            />
          </Field>
          <Field label={t('backups.retentionLabel')}>
            <TextInput type="number" min={1} max={90} className="panel-input--mono" value={retentionCount} onChange={(e) => setRetentionCount(e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={enabled} onChange={setEnabled} label={t('backups.enabledLabel')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setAddJobOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!targetId || !resourceId}
            loading={createJobMut.isPending}
            onClick={submit}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
