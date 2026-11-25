import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listUptimeHistory } from '@/api/uptime'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { EntityRow } from '@/components/ui/EntityRow'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { EmptyState, LoadingState } from '@/components/ui/states'
import type { UptimeWindowState } from './useUptimeWindow'

export function UptimeModals({ uw }: { uw: UptimeWindowState }) {
  return (
    <>
      <AddMonitorModal uw={uw} />
      <HistoryMonitorModal uw={uw} />
    </>
  )
}

function AddMonitorModal({ uw }: { uw: UptimeWindowState }) {
  const { t, addOpen, setAddOpen, createMut } = uw
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'http' | 'tcp'>('http')
  const [target, setTarget] = useState('')
  const [expectedStatus, setExpectedStatus] = useState('200')
  const [intervalSeconds, setIntervalSeconds] = useState('60')
  const [timeoutSeconds, setTimeoutSeconds] = useState('10')
  const [notifyEnabled, setNotifyEnabled] = useState(true)

  const submit = () => {
    createMut.mutate(
      {
        name: name.trim(),
        kind,
        target: target.trim(),
        expectedStatus: kind === 'http' ? Number(expectedStatus) || 200 : 0,
        intervalSeconds: Number(intervalSeconds) || 60,
        timeoutSeconds: Number(timeoutSeconds) || 10,
        enabled: true,
        notifyEnabled,
      },
      {
        onSuccess: () => {
          setName('')
          setTarget('')
        },
      },
    )
  }

  return (
    <Modal
      open={addOpen}
      onClose={() => setAddOpen(false)}
      title={t('uptime.addTitle')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => setAddOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!target.trim()} loading={createMut.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('uptime.nameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('uptime.namePlaceholder')} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('uptime.kindLabel')}>
            <Select
              value={kind}
              onChange={(v) => setKind(v as 'http' | 'tcp')}
              options={[
                { value: 'http', label: 'HTTP / HTTPS' },
                { value: 'tcp', label: 'TCP Port' },
              ]}
            />
          </Field>
          <Field label={t('uptime.intervalLabel')}>
            <Select
              value={intervalSeconds}
              onChange={setIntervalSeconds}
              options={[
                { value: '60', label: t('uptime.everySec', { sec: 60 }) },
                { value: '180', label: t('uptime.everyMin', { min: 3 }) },
                { value: '300', label: t('uptime.everyMin', { min: 5 }) },
                { value: '900', label: t('uptime.everyMin', { min: 15 }) },
              ]}
            />
          </Field>
        </div>
        <Field label={t('uptime.targetLabel')} hint={kind === 'http' ? t('uptime.targetHttpHint') : t('uptime.targetTcpHint')}>
          <TextInput mono value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          {kind === 'http' ? (
            <Field label={t('uptime.expectedStatusLabel')}>
              <TextInput mono type="number" value={expectedStatus} onChange={(e) => setExpectedStatus(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label={t('uptime.timeoutLabel')}>
            <TextInput mono type="number" min={2} max={60} value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={notifyEnabled} onChange={setNotifyEnabled} label={t('uptime.notifyLabel')} />
      </div>
    </Modal>
  )
}

function HistoryMonitorModal({ uw }: { uw: UptimeWindowState }) {
  const { t, historyMonitor, setHistoryMonitor } = uw
  const q = useQuery({
    queryKey: ['uptime-history', historyMonitor?.id],
    queryFn: () => listUptimeHistory(historyMonitor!.id),
    enabled: Boolean(historyMonitor),
  })

  return (
    <Modal
      open={Boolean(historyMonitor)}
      onClose={() => setHistoryMonitor(null)}
      title={t('uptime.historyTitle')}
      subtitle={historyMonitor?.name}
      size="lg"
      footer={
        <Button variant="ghost" onClick={() => setHistoryMonitor(null)}>
          {t('common.close')}
        </Button>
      }
    >
      {q.isLoading ? (
        <LoadingState>{t('uptime.loading')}</LoadingState>
      ) : (q.data?.length ?? 0) === 0 ? (
        <EmptyState>{t('uptime.emptyHistory')}</EmptyState>
      ) : (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {(q.data ?? []).map((chk) => (
            <EntityRow
              key={chk.id}
              centered
              title={<span className="panel-mono">{chk.latencyMs} ms</span>}
              badges={
                <>
                  <Badge tone={chk.status === 'up' ? 'success' : 'danger'} dot>{chk.status.toUpperCase()}</Badge>
                  {chk.httpCode > 0 ? <Badge tone="neutral">HTTP {chk.httpCode}</Badge> : null}
                </>
              }
              subtitle={chk.errorText || undefined}
              actions={
                <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">
                  {new Date(chk.checkedAt).toLocaleString()}
                </span>
              }
            />
          ))}
        </div>
      )}
    </Modal>
  )
}
