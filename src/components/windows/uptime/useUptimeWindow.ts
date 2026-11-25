import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  checkUptimeMonitorNow,
  createUptimeMonitor,
  deleteUptimeMonitor,
  listUptimeMonitors,
  updateUptimeMonitor,
  type UptimeMonitor,
} from '@/api/uptime'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

export function useUptimeWindow(win: WindowState, authenticated: boolean) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'up' | 'down'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [historyMonitor, setHistoryMonitor] = useState<UptimeMonitor | null>(null)
  const [checkingId, setCheckingId] = useState<number | null>(null)

  const monitorsQ = useQuery({
    queryKey: ['uptime-monitors'],
    queryFn: listUptimeMonitors,
    enabled: authenticated,
    refetchInterval: pollingActive ? 20_000 : false,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['uptime-monitors'] })

  const createMut = useMutation({
    mutationFn: createUptimeMonitor,
    onSuccess: (m) => {
      toast.success(t('uptime.created', { name: m.name }))
      setAddOpen(false)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMut = useMutation({
    mutationFn: (m: UptimeMonitor) => updateUptimeMonitor(m.id, { enabled: !m.enabled }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })

  const checkNowMut = useMutation({
    mutationFn: async (m: UptimeMonitor) => {
      setCheckingId(m.id)
      try {
        return await checkUptimeMonitorNow(m.id)
      } finally {
        setCheckingId(null)
      }
    },
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUptimeMonitor(id),
    onSuccess: () => {
      toast.success(t('uptime.deleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const confirmDelete = async (m: UptimeMonitor) => {
    const ok = await alertLib.confirm(
      t('uptime.deleteTitle'),
      t('uptime.deleteConfirm', { name: m.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteMut.mutate(m.id)
  }

  return {
    t,
    search,
    setSearch,
    filter,
    setFilter,
    addOpen,
    setAddOpen,
    historyMonitor,
    setHistoryMonitor,
    checkingId,
    monitorsQ,
    refresh,
    createMut,
    toggleMut,
    checkNowMut,
    confirmDelete,
  }
}

export type UptimeWindowState = ReturnType<typeof useUptimeWindow>
