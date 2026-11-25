import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  controlSystemdService,
  deleteHostCronJob,
  getHostOpsOverview,
  runHostCronJobNow,
  saveHostCronJob,
  type HostCronJob,
  type SystemdService,
} from '@/api/hostops'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

export type ServicesSection = 'systemd' | 'cron'

export function useServicesWindow(win: WindowState, authenticated: boolean) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [section, setSection] = useState<ServicesSection>('systemd')
  const [search, setSearch] = useState('')
  const [busyUnit, setBusyUnit] = useState<string | null>(null)
  const [logsUnit, setLogsUnit] = useState<string | null>(null)
  const [editCron, setEditCron] = useState<HostCronJob | 'new' | null>(null)
  const [cronRunResult, setCronRunResult] = useState<{ name: string; ok: boolean; output: string; error?: string } | null>(null)
  const [runningCronId, setRunningCronId] = useState<string | null>(null)

  const overviewQ = useQuery({
    queryKey: ['hostops-overview'],
    queryFn: getHostOpsOverview,
    enabled: authenticated,
    refetchInterval: pollingActive ? 20_000 : false,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['hostops-overview'] })

  const serviceActionMut = useMutation({
    mutationFn: async ({ unit, action }: { unit: string; action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable' }) => {
      setBusyUnit(unit)
      try {
        return await controlSystemdService(unit, action)
      } finally {
        setBusyUnit(null)
      }
    },
    onSuccess: () => {
      toast.success(t('services.actionOk'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveCronMut = useMutation({
    mutationFn: saveHostCronJob,
    onSuccess: () => {
      toast.success(t('services.cronSaved'))
      setEditCron(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteCronMut = useMutation({
    mutationFn: (id: string) => deleteHostCronJob(id),
    onSuccess: () => {
      toast.success(t('services.cronDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runCronMut = useMutation({
    mutationFn: async (job: HostCronJob) => {
      setRunningCronId(job.id)
      try {
        const res = await runHostCronJobNow(job.id)
        setCronRunResult({ name: job.name, ok: res.ok, output: res.output, error: res.error })
        return res
      } finally {
        setRunningCronId(null)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmServiceStop = async (svc: SystemdService) => {
    const ok = await alertLib.confirm(
      t('services.stopConfirmTitle'),
      t('services.stopConfirmMessage', { unit: svc.unit }),
      t('services.stop'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) serviceActionMut.mutate({ unit: svc.unit, action: 'stop' })
  }

  const confirmDeleteCron = async (job: HostCronJob) => {
    const ok = await alertLib.confirm(
      t('services.deleteCronTitle'),
      t('services.deleteCronConfirm', { name: job.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteCronMut.mutate(job.id)
  }

  return {
    t,
    section,
    setSection,
    search,
    setSearch,
    overviewQ,
    refresh,
    busyUnit,
    logsUnit,
    setLogsUnit,
    editCron,
    setEditCron,
    cronRunResult,
    setCronRunResult,
    runningCronId,
    serviceActionMut,
    saveCronMut,
    runCronMut,
    confirmServiceStop,
    confirmDeleteCron,
  }
}

export type ServicesWindowState = ReturnType<typeof useServicesWindow>
