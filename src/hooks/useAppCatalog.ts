import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAppCatalog,
  installCatalogApp,
  installedAppWindowParams,
  runInstalledAppAction,
  uninstallCatalogApp,
  updateInstalledApp,
  upgradeInstalledApp,
  type InstallCatalogAppPayload,
  type InstalledApp,
  type UpdateInstalledAppPayload,
} from '@/api/appCatalog'
import { useAuthStore } from '@/store/authStore'
import { useWindowStore } from '@/store/windowStore'

export const APP_CATALOG_QUERY_KEY = ['app-catalog'] as const

export function useAppCatalog(enabledOverride?: boolean) {
  const user = useAuthStore((s) => s.user)
  const isDemo = user?.role?.toLowerCase() === 'demo'
  const enabled = (enabledOverride ?? true) && Boolean(user) && !isDemo

  return useQuery({
    queryKey: APP_CATALOG_QUERY_KEY,
    queryFn: getAppCatalog,
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
  })
}

export function useInstalledApps() {
  const query = useAppCatalog()
  return {
    ...query,
    installedApps: query.data?.installed ?? [],
    catalogApps: query.data?.catalog ?? [],
  }
}

export function openInstalledAppWindow(app: InstalledApp) {
  useWindowStore.getState().openWindow('installed-app', installedAppWindowParams(app))
}

export function closeInstalledAppWindows(appId: number) {
  const store = useWindowStore.getState()
  const matching = store.windows.filter(
    (w) => w.kind === 'installed-app' && Number(w.params?.appId) === appId,
  )
  matching.forEach((w) => store.closeWindow(w.id))
}

export function useAppCatalogMutations() {
  const qc = useQueryClient()

  const invalidate = () => qc.invalidateQueries({ queryKey: APP_CATALOG_QUERY_KEY })

  const installMutation = useMutation({
    mutationFn: (payload: InstallCatalogAppPayload) => installCatalogApp(payload),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateInstalledAppPayload }) =>
      updateInstalledApp(id, payload),
    onSuccess: (updated) => {
      // keep open window title / icon params synced with updated app metadata
      const store = useWindowStore.getState()
      const matching = store.windows.filter(
        (w) => w.kind === 'installed-app' && Number(w.params?.appId) === updated.id,
      )
      if (matching.length > 0) {
        matching.forEach((w) => {
          store.openWindow('installed-app', installedAppWindowParams(updated))
          void w
        })
      }
      invalidate()
    },
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' | 'restart' }) =>
      runInstalledAppAction(id, action),
    onSuccess: invalidate,
  })

  const upgradeMutation = useMutation({
    mutationFn: ({ id, version }: { id: number; version?: string }) =>
      upgradeInstalledApp(id, version),
    onSuccess: invalidate,
  })

  const uninstallMutation = useMutation({
    mutationFn: ({
      id,
      removeContainer,
      removeVolumes,
    }: {
      id: number
      removeContainer?: boolean
      removeVolumes?: boolean
    }) => uninstallCatalogApp(id, { removeContainer, removeVolumes }),
    onSuccess: (_, vars) => {
      closeInstalledAppWindows(vars.id)
      invalidate()
    },
  })

  return {
    installMutation,
    updateMutation,
    actionMutation,
    upgradeMutation,
    uninstallMutation,
  }
}

