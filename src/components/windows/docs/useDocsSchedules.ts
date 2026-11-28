import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createStudioSchedule,
  deleteStudioSchedule,
  listStudioSchedules,
  runStudioScheduleNow,
  toggleStudioSchedule,
  updateStudioSchedule,
  type StudioSchedule,
  type StudioScheduleInput,
} from '@/api/studio'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

// State & mutations for automated Reneo documentation & article schedules inside Docs Window
export function useDocsSchedules(enabled: boolean) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [editingSchedule, setEditingSchedule] = useState<StudioSchedule | 'new' | null>(null)
  const [runningScheduleId, setRunningScheduleId] = useState<number | null>(null)

  const schedulesQ = useQuery({
    queryKey: ['studio-schedules'],
    queryFn: listStudioSchedules,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['studio-schedules'] })
    void qc.invalidateQueries({ queryKey: ['docs'] })
    void qc.invalidateQueries({ queryKey: ['public-docs'] })
  }

  const saveScheduleMut = useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: StudioScheduleInput }) =>
      id ? updateStudioSchedule(id, payload) : createStudioSchedule(payload),
    onSuccess: () => {
      toast.success(t('studio.schedule.savedToast'))
      setEditingSchedule(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleScheduleMut = useMutation({
    mutationFn: ({ id, enabled: nextEnabled }: { id: number; enabled: boolean }) =>
      toggleStudioSchedule(id, nextEnabled),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteScheduleMut = useMutation({
    mutationFn: deleteStudioSchedule,
    onSuccess: () => {
      toast.success(t('studio.schedule.deletedToast'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runScheduleMut = useMutation({
    mutationFn: async (id: number) => {
      setRunningScheduleId(id)
      try {
        return await runStudioScheduleNow(id)
      } finally {
        setRunningScheduleId(null)
      }
    },
    onSuccess: ({ page }) => {
      toast.success(t('studio.schedule.runSuccessToast', { title: page.title }))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmDeleteSchedule = async (sc: StudioSchedule) => {
    const ok = await alertLib.confirm(
      t('studio.schedule.deleteTitle'),
      t('studio.schedule.deleteConfirm', { name: sc.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      'docs',
    )
    if (ok) deleteScheduleMut.mutate(sc.id)
  }

  const schedules = useMemo(() => schedulesQ.data?.schedules ?? [], [schedulesQ.data?.schedules])

  return {
    t,
    schedulesQ,
    schedules,
    refresh,
    editingSchedule,
    setEditingSchedule,
    runningScheduleId,
    saveScheduleMut,
    toggleScheduleMut,
    runScheduleMut,
    confirmDeleteSchedule,
  }
}

export type DocsSchedulesState = ReturnType<typeof useDocsSchedules>
