import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AppUpdateStatus, CatalogApp, InstalledApp } from '@/api/appCatalog'
import type { AppProgressModalState } from '@/components/windows/app-catalog/AppLifecycleModals'
import type { BusyCatalogAction } from '@/components/windows/app-catalog/InstalledAppsView'
import {
  buildUpgradeTargetState,
  type UpgradeTargetModalState,
} from '@/components/windows/app-catalog/UpgradeAppModal'
import { forceRefreshAppUpdates, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

interface UseAppCatalogActionsParams {
  catalog: CatalogApp[]
  updatesById?: Record<number, AppUpdateStatus>
}

export function useAppCatalogActions({ catalog, updatesById }: UseAppCatalogActionsParams) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { actionMutation, upgradeMutation, rollbackMutation, uninstallMutation } = useAppCatalogMutations()

  const upgradeTargetEditedRef = useRef(false)
  const [busyAction, setBusyAction] = useState<BusyCatalogAction | null>(null)
  const [uninstallTarget, setUninstallTarget] = useState<InstalledApp | null>(null)
  const [removeVolumes, setRemoveVolumes] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<UpgradeTargetModalState | null>(null)
  const [progressModal, setProgressModal] = useState<AppProgressModalState | null>(null)

  const handleContainerAction = async (app: InstalledApp, action: 'start' | 'stop' | 'restart') => {
    setBusyAction({ id: app.id, action })
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleUpgradeApp = (app: InstalledApp) => {
    upgradeTargetEditedRef.current = false
    const initialState = buildUpgradeTargetState(app, catalog, updatesById?.[app.id])
    setUpgradeTarget(initialState)
    void forceRefreshAppUpdates(qc)
      .then((freshMap) => {
        const fresh = freshMap?.[app.id]
        if (!fresh) return
        setUpgradeTarget((prev) => {
          if (!prev || prev.app.id !== app.id) return prev
          const updated = buildUpgradeTargetState(app, catalog, fresh)
          return {
            ...updated,
            targetVersion: upgradeTargetEditedRef.current ? prev.targetVersion : updated.targetVersion,
          }
        })
      })
      .catch(() => {
        // Pertahankan data modal yang sudah tersedia bila refresh latar gagal
      })
  }

  const handleTargetVersionChange = (val: string) => {
    upgradeTargetEditedRef.current = true
    setUpgradeTarget((prev) => (prev ? { ...prev, targetVersion: val } : null))
  }

  const handleConfirmUpgrade = async () => {
    if (!upgradeTarget) return
    const { app, targetVersion } = upgradeTarget
    setUpgradeTarget(null)
    setBusyAction({ id: app.id, action: 'upgrade' })
    const targetDesc = `${app.name} (${targetVersion})`
    setProgressModal({ kind: 'upgrade', phase: 'running', app, image: targetDesc })
    try {
      const updated = await upgradeMutation.mutateAsync({ id: app.id, version: targetVersion })
      setProgressModal({ kind: 'upgrade', phase: 'success', app: updated, image: updated.image })
      toast.success(t('appCatalog.upgradeSuccess', { image: updated.image }))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('appCatalog.actionFailed')
      setProgressModal({ kind: 'upgrade', phase: 'error', app, image: app.image, errorMessage: message })
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  const handleRollbackApp = async (app: InstalledApp) => {
    const target = app.previousImage || app.previousDigest || app.image
    const ok = await alertLib.confirm(
      t('appCatalog.rollbackConfirmTitle'),
      t('appCatalog.rollbackConfirmBody', { name: app.name, target }),
      t('appCatalog.rollbackAction'),
      t('common.cancel'),
      'question',
      'app-catalog',
    )
    if (!ok) return
    setBusyAction({ id: app.id, action: 'rollback' })
    setProgressModal({ kind: 'rollback', phase: 'running', app, image: target })
    try {
      const updated = await rollbackMutation.mutateAsync(app.id)
      setProgressModal({ kind: 'rollback', phase: 'success', app: updated, image: updated.image })
      toast.success(t('appCatalog.rollbackSuccess', { image: updated.image }))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('appCatalog.actionFailed')
      setProgressModal({ kind: 'rollback', phase: 'error', app, image: target, errorMessage: message })
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  const openUninstallConfirm = async (app: InstalledApp) => {
    if (app.kind === 'custom-url') {
      const ok = await alertLib.confirm(
        t('appCatalog.uninstallModalTitle'),
        `${app.name} — ${t('appCatalog.uninstallConfirmBody')}`,
        t('appCatalog.uninstallAction'),
        t('common.cancel'),
        'warning',
        'app-catalog',
      )
      if (!ok) return
      setBusyAction({ id: app.id, action: 'uninstall' })
      try {
        await uninstallMutation.mutateAsync({ id: app.id })
        toast.success(t('appCatalog.uninstallSuccess'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
      } finally {
        setBusyAction(null)
      }
      return
    }
    setUninstallTarget(app)
    setRemoveVolumes(false)
  }

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return
    const id = uninstallTarget.id
    const targetImg = uninstallTarget.image
    const removeContainer = uninstallTarget.kind !== 'custom-url'
    setBusyAction({ id, action: 'uninstall' })
    try {
      const res = await uninstallMutation.mutateAsync({
        id,
        removeContainer,
        removeVolumes,
        removeImage: Boolean(targetImg),
      })
      if (res?.imageInUse) {
        toast.warning(
          t('appCatalog.uninstallImageInUseNotice', {
            image: res.targetImage || targetImg || '',
          }),
        )
      } else if (res?.imageDeleted) {
        toast.success(
          t('appCatalog.uninstallSuccessWithImage', {
            image: res.targetImage || targetImg || '',
          }),
        )
      } else {
        toast.success(t('appCatalog.uninstallSuccess'))
      }
      setUninstallTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setBusyAction(null)
    }
  }

  return {
    busyAction,
    uninstallTarget,
    removeVolumes,
    setRemoveVolumes,
    closeUninstallModal: () => setUninstallTarget(null),
    isUninstallPending: uninstallMutation.isPending,
    upgradeTarget,
    closeUpgradeModal: () => setUpgradeTarget(null),
    isUpgradePending: upgradeMutation.isPending,
    progressModal,
    closeProgressModal: () => setProgressModal(null),
    handleContainerAction,
    handleUpgradeApp,
    handleTargetVersionChange,
    handleConfirmUpgrade,
    handleRollbackApp,
    openUninstallConfirm,
    handleConfirmUninstall,
  }
}
