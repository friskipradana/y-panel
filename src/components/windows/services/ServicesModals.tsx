import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { getSystemdServiceLogs } from '@/api/hostops'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { LoadingState } from '@/components/ui/states'
import type { ServicesWindowState } from './useServicesWindow'

const CRON_PRESETS = [
  { value: '*/5 * * * *', label: '*/5 * * * * (5m)' },
  { value: '*/15 * * * *', label: '*/15 * * * * (15m)' },
  { value: '@hourly', label: '@hourly' },
  { value: '@daily', label: '@daily (00:00)' },
  { value: '0 3 * * *', label: '0 3 * * * (03:00)' },
  { value: '@weekly', label: '@weekly' },
  { value: '@reboot', label: '@reboot' },
]

export function ServicesModals({ sw }: { sw: ServicesWindowState }) {
  return (
    <>
      <SystemdLogsModal sw={sw} />
      <CronJobModal sw={sw} />
      <CronRunOutputModal sw={sw} />
    </>
  )
}

function SystemdLogsModal({ sw }: { sw: ServicesWindowState }) {
  const { t, logsUnit, setLogsUnit } = sw
  const q = useQuery({
    queryKey: ['systemd-logs', logsUnit],
    queryFn: () => getSystemdServiceLogs(logsUnit!, 200),
    enabled: Boolean(logsUnit),
  })

  return (
    <Modal
      open={Boolean(logsUnit)}
      onClose={() => setLogsUnit(null)}
      title={t('services.logs')}
      subtitle={logsUnit ?? undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setLogsUnit(null)}>
            {t('common.close')}
          </Button>
          <Button
            variant="outline"
            icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
            loading={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {t('common.refresh')}
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <LoadingState>{t('services.loadingLogs')}</LoadingState>
      ) : (
        <pre className="panel-mono max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
          {q.data || t('services.noLogs')}
        </pre>
      )}
    </Modal>
  )
}

function CronJobModal({ sw }: { sw: ServicesWindowState }) {
  const { t, editCron, setEditCron, saveCronMut } = sw
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('0 3 * * *')
  const [command, setCommand] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!editCron) return
    if (editCron === 'new') {
      setName('')
      setSchedule('0 3 * * *')
      setCommand('')
      setEnabled(true)
    } else {
      setName(editCron.name)
      setSchedule(editCron.schedule)
      setCommand(editCron.command)
      setEnabled(editCron.enabled)
    }
  }, [editCron])

  return (
    <Modal
      open={Boolean(editCron)}
      onClose={() => setEditCron(null)}
      title={editCron === 'new' ? t('services.addCronTitle') : t('services.editCronTitle')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => setEditCron(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!schedule.trim() || !command.trim()}
            loading={saveCronMut.isPending}
            onClick={() =>
              saveCronMut.mutate({
                id: editCron && editCron !== 'new' ? editCron.id : undefined,
                name: name.trim() || schedule.trim(),
                schedule: schedule.trim(),
                command: command.trim(),
                enabled,
              })
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('services.cronNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('services.cronNamePlaceholder')} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('services.cronPresetLabel')}>
            <Select
              value={CRON_PRESETS.some((p) => p.value === schedule) ? schedule : ''}
              onChange={(v) => v && setSchedule(v)}
              options={CRON_PRESETS}
              placeholder={t('services.cronPresetPlaceholder')}
            />
          </Field>
          <Field label={t('services.cronScheduleLabel')}>
            <TextInput mono value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </Field>
        </div>
        <Field label={t('services.cronCommandLabel')} hint={t('services.cronCommandHint')}>
          <TextInput mono value={command} onChange={(e) => setCommand(e.target.value)} />
        </Field>
        <Checkbox checked={enabled} onChange={setEnabled} label={t('services.cronEnabledLabel')} />
      </div>
    </Modal>
  )
}

function CronRunOutputModal({ sw }: { sw: ServicesWindowState }) {
  const { t, cronRunResult, setCronRunResult } = sw
  return (
    <Modal
      open={Boolean(cronRunResult)}
      onClose={() => setCronRunResult(null)}
      title={t('services.cronRunOutput')}
      subtitle={cronRunResult?.name}
      size="lg"
      footer={
        <Button variant="ghost" onClick={() => setCronRunResult(null)}>
          {t('common.close')}
        </Button>
      }
    >
      {cronRunResult ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Badge tone={cronRunResult.ok ? 'success' : 'danger'} dot>
              {cronRunResult.ok ? 'OK' : 'ERROR'}
            </Badge>
            {cronRunResult.error ? <span className="text-[0.75rem] text-[var(--panel-danger-text)]">{cronRunResult.error}</span> : null}
          </div>
          <pre className="panel-mono max-h-80 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
            {cronRunResult.output || t('services.noLogs')}
          </pre>
        </div>
      ) : null}
    </Modal>
  )
}
