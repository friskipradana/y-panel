import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createUserDatabase,
  deleteUserDatabase,
  listDatabaseEngines,
  listUserDatabases,
  startUserDatabase,
  stopUserDatabase,
  type UserDatabase,
} from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useListQuery } from '@/hooks/useListQuery'
import { listQueryKey } from '@/lib/listQuery'
import type { WindowState } from '@/types'

const KEY = ['user-databases']

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

// State, queries and handlers of the databases window; the components only render.
export function useDatabasesWindow(win?: WindowState) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win)
  const [showCreate, setShowCreate] = useState(false)
  const [connectionTarget, setConnectionTarget] = useState<UserDatabase | null>(null)
  const [manageTarget, setManageTarget] = useState<UserDatabase | null>(null)

  // the search, the order and the column filters; the agent applies them
  const list = useListQuery()
  const query = useQuery({
    queryKey: [...KEY, listQueryKey(list.query)],
    queryFn: () => listUserDatabases(list.query),
    placeholderData: keepPreviousData,
    // creating rows move to ready on their own; poll faster while any is pending
    refetchInterval: (q) => {
      if (!pollingActive) return false
      return q.state.data?.items.some((item) => item.status === 'creating') ? 3_000 : 15_000
    },
  })
  const enginesQuery = useQuery({ queryKey: ['database-engines'], queryFn: listDatabaseEngines, staleTime: Infinity })

  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const fail = (title: string) => (e: unknown) => alertLib.fire(title, apiError(e, t('databases.actionFailed')), 'error', 'database')

  const createMut = useMutation({
    mutationFn: createUserDatabase,
    onSuccess: (created) => {
      alertLib.fire(t('databases.createdTitle'), t('databases.createdMessage', { name: created.name }), 'success', 'database')
      setShowCreate(false)
      void refresh()
    },
    onError: fail(t('databases.createFailedTitle')),
  })
  const startMut = useMutation({ mutationFn: startUserDatabase, onSuccess: refresh, onError: fail(t('databases.startFailedTitle')) })
  const stopMut = useMutation({ mutationFn: stopUserDatabase, onSuccess: refresh, onError: fail(t('databases.stopFailedTitle')) })
  const deleteMut = useMutation({ mutationFn: deleteUserDatabase, onSuccess: refresh, onError: fail(t('databases.deleteFailedTitle')) })

  const confirmDelete = async (item: UserDatabase) => {
    const ok = await alertLib.confirm(
      t('databases.deleteQuestion'),
      t('databases.deleteMessage', { name: item.name }),
      t('databases.deleteConfirm'),
      t('common.cancel'),
      'warning',
      'database',
    )
    if (ok) deleteMut.mutate(item.id)
  }

  return {
    t,
    query,
    list,
    items: query.data?.items ?? [],
    all: query.data?.all ?? 0,
    facets: query.data?.facets,
    narrowed: !!list.query.q || Object.keys(list.filters).length > 0,
    engines: enginesQuery.data ?? [],
    showCreate,
    setShowCreate,
    connectionTarget,
    setConnectionTarget,
    manageTarget,
    setManageTarget,
    createMut,
    startMut,
    stopMut,
    deleteBusy: (id: number) => deleteMut.isPending && deleteMut.variables === id,
    confirmDelete,
  }
}

export type DatabasesWindowState = ReturnType<typeof useDatabasesWindow>
