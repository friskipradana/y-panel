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
    <Modal open={Boolean(logsUnit)} onClose={() => setLogsUnit(null)} title={logsUnit ? `journalctl: ${logsUnit}` : 'journalctl'} size="lg">
      <div className="space-y-2.5">
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" loading={q.isFetching} onClick={() => void q.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
        {q.isLoading ? (
          <LoadingState>{t('services.loadingLogs')}</LoadingState>
        ) : (
          <pre className="panel-mono max-h-[60vh] overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-3 text-[11.5px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
            {q.data || t('services.noLogs')}
          </pre>
        )}
      </div>
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
    <Modal open={Boolean(editCron)} onClose={() => setEditCron(null)} title={editCron === 'new' ? t('services.addCronTitle') : t('services.editCronTitle')} size="md">
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
            <TextInput className="panel-input--mono" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </Field>
        </div>
        <Field label={t('services.cronCommandLabel')} hint={t('services.cronCommandHint')}>
          <TextInput className="panel-input--mono" value={command} onChange={(e) => setCommand(e.target.value)} />
        </Field>
        <Checkbox checked={enabled} onChange={setEnabled} label={t('services.cronEnabledLabel')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setEditCron(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
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
        </div>
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
      title={cronRunResult ? `${t('services.cronRunOutput')}: ${cronRunResult.name}` : t('services.cronRunOutput')}
      size="lg"
    >
      {cronRunResult ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Badge tone={cronRunResult.ok ? 'success' : 'danger'}>
              {cronRunResult.ok ? 'OK' : 'ERROR'}
            </Badge>
            {cronRunResult.error ? <span className="text-[12px] text-[var(--panel-danger-text)]">{cronRunResult.error}</span> : null}
          </div>
          <pre className="panel-mono max-h-80 overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-3 text-[11.5px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
            {cronRunResult.output || t('services.noLogs')}
          </pre>
        </div>
      ) : null}
    </Modal>
  )
}
