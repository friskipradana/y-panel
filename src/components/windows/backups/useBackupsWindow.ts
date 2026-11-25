import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  createBackupJob,
  createBackupTarget,
  deleteBackupJob,
  deleteBackupRun,
  deleteBackupTarget,
  getBackupOverview,
  restoreBackupRun,
  runBackupJobNow,
  testBackupTarget,
  updateBackupJob,
  type BackupJob,
  type BackupRun,
  type BackupTarget,
  type CreateBackupJobInput,
  type CreateBackupTargetInput,
} from '@/api/backups'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

export type BackupSection = 'jobs' | 'runs' | 'targets'

export function useBackupsWindow(win: WindowState, authenticated: boolean) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [section, setSection] = useState<BackupSection>('jobs')
  const [search, setSearch] = useState('')
  const [addTargetOpen, setAddTargetOpen] = useState(false)
  const [addJobOpen, setAddJobOpen] = useState(false)
  const [runningJobId, setRunningJobId] = useState<number | null>(null)
  const [restoringRunId, setRestoringRunId] = useState<number | null>(null)
  const [testingTargetId, setTestingTargetId] = useState<number | null>(null)

  const overviewQ = useQuery({
    queryKey: ['backups-overview'],
    queryFn: getBackupOverview,
    enabled: authenticated,
    refetchInterval: pollingActive ? 20_000 : false,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['backups-overview'] })

  const createTargetMut = useMutation({
    mutationFn: (payload: CreateBackupTargetInput) => createBackupTarget(payload),
    onSuccess: (created) => {
      toast.success(t('backups.targetCreated', { name: created.name }))
      setAddTargetOpen(false)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const testTargetMut = useMutation({
    mutationFn: async (target: BackupTarget) => {
      setTestingTargetId(target.id)
      try {
        return await testBackupTarget(target.id)
      } finally {
        setTestingTargetId(null)
      }
    },
    onSuccess: (res) => toast.success(res.message || t('backups.testOk')),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteTargetMut = useMutation({
    mutationFn: (id: number) => deleteBackupTarget(id),
    onSuccess: () => {
      toast.success(t('backups.targetDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createJobMut = useMutation({
    mutationFn: (payload: CreateBackupJobInput) => createBackupJob(payload),
    onSuccess: (created) => {
      toast.success(t('backups.jobCreated', { name: created.name }))
      setAddJobOpen(false)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleJobMut = useMutation({
    mutationFn: (job: BackupJob) => updateBackupJob(job.id, { enabled: !job.enabled }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteJobMut = useMutation({
    mutationFn: (id: number) => deleteBackupJob(id),
    onSuccess: () => {
      toast.success(t('backups.jobDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runJobMut = useMutation({
    mutationFn: async (job: BackupJob) => {
      setRunningJobId(job.id)
      try {
        return await runBackupJobNow(job.id)
      } finally {
        setRunningJobId(null)
      }
    },
    onSuccess: () => {
      toast.success(t('backups.runSuccess'))
      refresh()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      refresh()
    },
  })

  const restoreRunMut = useMutation({
    mutationFn: async (run: BackupRun) => {
      setRestoringRunId(run.id)
      try {
        return await restoreBackupRun(run.id)
      } finally {
        setRestoringRunId(null)
      }
    },
    onSuccess: (res) => {
      toast.success(res.message || t('backups.restoreSuccess'))
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteRunMut = useMutation({
    mutationFn: (id: number) => deleteBackupRun(id),
    onSuccess: () => {
      toast.success(t('backups.runDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmDeleteTarget = async (target: BackupTarget) => {
    const ok = await alertLib.confirm(
      t('backups.deleteTargetTitle'),
      t('backups.deleteTargetConfirm', { name: target.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteTargetMut.mutate(target.id)
  }

  const confirmDeleteJob = async (job: BackupJob) => {
    const ok = await alertLib.confirm(
      t('backups.deleteJobTitle'),
      t('backups.deleteJobConfirm', { name: job.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteJobMut.mutate(job.id)
  }

  const confirmRestoreRun = async (run: BackupRun) => {
    const ok = await alertLib.confirm(
      t('backups.restoreConfirmTitle'),
      t('backups.restoreConfirmMessage', { name: run.resourceName }),
      t('backups.restoreNow'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) restoreRunMut.mutate(run)
  }

  const confirmDeleteRun = async (run: BackupRun) => {
    const ok = await alertLib.confirm(
      t('backups.deleteRunTitle'),
      t('backups.deleteRunConfirm', { name: run.resourceName }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteRunMut.mutate(run.id)
  }

  return {
    t,
    section,
    setSection,
    search,
    setSearch,
    overviewQ,
    refresh,
    addTargetOpen,
    setAddTargetOpen,
    addJobOpen,
    setAddJobOpen,
    runningJobId,
    restoringRunId,
    testingTargetId,
    createTargetMut,
    testTargetMut,
    createJobMut,
    toggleJobMut,
    runJobMut,
    confirmDeleteTarget,
    confirmDeleteJob,
    confirmRestoreRun,
    confirmDeleteRun,
  }
}

export type BackupsWindowState = ReturnType<typeof useBackupsWindow>
