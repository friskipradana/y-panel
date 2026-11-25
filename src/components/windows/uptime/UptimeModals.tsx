import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listUptimeHistory } from '@/api/uptime'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
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
    <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('uptime.addTitle')} size="md">
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
          <TextInput className="panel-input--mono" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          {kind === 'http' ? (
            <Field label={t('uptime.expectedStatusLabel')}>
              <TextInput type="number" className="panel-input--mono" value={expectedStatus} onChange={(e) => setExpectedStatus(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label={t('uptime.timeoutLabel')}>
            <TextInput type="number" min={2} max={60} className="panel-input--mono" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={notifyEnabled} onChange={setNotifyEnabled} label={t('uptime.notifyLabel')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" disabled={!target.trim()} loading={createMut.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        </div>
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
      title={historyMonitor ? `${t('uptime.historyTitle')}: ${historyMonitor.name}` : t('uptime.historyTitle')}
      size="lg"
    >
      {q.isLoading ? (
        <LoadingState>{t('uptime.loading')}</LoadingState>
      ) : (q.data?.length ?? 0) === 0 ? (
        <EmptyState>{t('uptime.emptyHistory')}</EmptyState>
      ) : (
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {(q.data ?? []).map((chk) => (
            <div
              key={chk.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] px-3 py-1.5 text-[12px]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge tone={chk.status === 'up' ? 'success' : 'danger'}>{chk.status.toUpperCase()}</Badge>
                {chk.httpCode > 0 ? <span className="panel-mono text-[11.5px]">HTTP {chk.httpCode}</span> : null}
                <span className="panel-mono text-[11.5px] text-[var(--text-secondary)]">{chk.latencyMs} ms</span>
                {chk.errorText ? <span className="truncate text-[11.5px] text-[var(--panel-danger-text)]">{chk.errorText}</span> : null}
              </div>
              <span className="panel-mono text-[11px] text-[var(--text-secondary)] shrink-0">
                {new Date(chk.checkedAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
