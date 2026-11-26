import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  renewAppLicense,
  createAppLicenseOrder,
  payAppLicenseOrder,
  cancelAppLicenseOrder,
  updateAppLicense,
  deleteAppLicense,
  deleteAppLicensePlan,
  type AppLicense,
  type AppLicensePlan,
  type AppLicenseOrder,
} from '@/api/appLicenses'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

interface UseAppLicenseMutationsOptions {
  selectedLicenseAppName?: string
  onRenewSuccess: () => void
  onOrderCreated: (order: AppLicenseOrder) => void
  onOrderPaid: (order: AppLicenseOrder) => void
  onOrderCancelled: (order: AppLicenseOrder) => void
}

export function useAppLicenseMutations({
  selectedLicenseAppName,
  onRenewSuccess,
  onOrderCreated,
  onOrderPaid,
  onOrderCancelled,
}: UseAppLicenseMutationsOptions) {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const deleteLicenseMutation = useMutation({
    mutationFn: deleteAppLicense,
    onSuccess: (_data, deletedId) => {
      toast.success('Lisensi berhasil dihapus.')
      queryClient.setQueryData<AppLicense[]>(['app-licenses'], (prev) =>
        (prev || []).filter((item) => item.id !== deletedId)
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menghapus lisensi.')
    },
  })

  const deletePlanMutation = useMutation({
    mutationFn: deleteAppLicensePlan,
    onSuccess: () => {
      toast.success('Paket tarif berhasil dihapus.')
      queryClient.invalidateQueries({ queryKey: ['app-license-plans'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menghapus paket tarif.')
    },
  })

  const renewMutation = useMutation({
    mutationFn: renewAppLicense,
    onSuccess: (data) => {
      toast.success(
        t('appLicenses.renewSuccess') ||
          `Lisensi untuk ${data.appName || selectedLicenseAppName || 'aplikasi'} berhasil diperpanjang!`
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      onRenewSuccess()
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal memperpanjang lisensi.')
    },
  })

  const orderMutation = useMutation({
    mutationFn: createAppLicenseOrder,
    onSuccess: (data) => {
      toast.success('Invoice pesanan baru berhasil diterbitkan!')
      if (data.paymentMethods?.length) {
        queryClient.setQueryData(['app-license-order-detail', data.order.publicId], {
          order: data.order,
          paymentMethods: data.paymentMethods,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      onOrderCreated(data.order)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menerbitkan invoice.')
    },
  })

  const payMutation = useMutation({
    mutationFn: ({ publicId, method }: { publicId: string; method: string }) =>
      payAppLicenseOrder(publicId, method),
    onSuccess: (data) => {
      toast.success(`Pembayaran invoice ${data.invoiceNumber} berhasil! Lisensi langsung aktif.`)
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      onOrderPaid(data)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal memproses pembayaran.')
    },
  })

  const cancelOrderMutation = useMutation({
    mutationFn: (publicId: string) => cancelAppLicenseOrder(publicId),
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} berhasil dibatalkan.`)
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      onOrderCancelled(data)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal membatalkan invoice.')
    },
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'SUSPENDED' | 'ACTIVE' }) =>
      updateAppLicense(id, { status }),
    onSuccess: (updated) => {
      toast.success(
        updated.status === 'SUSPENDED'
          ? `Lisensi ${updated.appName} berhasil disuspend. Aplikasi tidak dapat digunakan.`
          : `Lisensi ${updated.appName} berhasil diaktifkan kembali.`
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal mengubah status lisensi.')
    },
  })

  const handleCancelOrder = async (ord: AppLicenseOrder) => {
    const ok = await alertLib.confirm(
      'Batalkan Invoice?',
      `Invoice ${ord.invoiceNumber} untuk ${ord.appName} (${ord.planName}) akan dibatalkan.`,
      'Batalkan Invoice',
      'Kembali',
      'warning',
      'app-licenses'
    )
    if (ok) {
      cancelOrderMutation.mutate(ord.publicId)
    }
  }

  const handleToggleSuspend = async (lic: AppLicense) => {
    if (lic.status === 'SUSPENDED') {
      suspendMutation.mutate({ id: lic.id, status: 'ACTIVE' })
      return
    }
    const ok = await alertLib.confirm(
      'Suspend Lisensi?',
      `Lisensi ${lic.appName} (${lic.licenseKey}) akan disuspend sehingga aplikasi tidak dapat digunakan sampai diaktifkan kembali.`,
      'Suspend',
      'Batal',
      'warning',
      'app-licenses'
    )
    if (ok) {
      suspendMutation.mutate({ id: lic.id, status: 'SUSPENDED' })
    }
  }

  const handleDeleteLicense = async (lic: AppLicense) => {
    const ok = await alertLib.confirm(
      'Hapus Lisensi?',
      `Lisensi ${lic.appName} (${lic.licenseKey}) akan dihapus permanen.`,
      'Hapus',
      'Batal',
      'warning',
      'app-licenses'
    )
    if (ok) {
      deleteLicenseMutation.mutate(lic.id)
    }
  }

  const handleDeletePlan = async (plan: AppLicensePlan) => {
    const ok = await alertLib.confirm(
      'Hapus Paket?',
      `Paket "${plan.name}" akan dihapus dari daftar paket lisensi.`,
      'Hapus',
      'Batal',
      'warning',
      'app-licenses'
    )
    if (ok) {
      deletePlanMutation.mutate(plan.id)
    }
  }

  const handleOrderPlan = (plan: AppLicensePlan) => {
    orderMutation.mutate({
      catalogId: plan.catalogId,
      planSlug: plan.slug,
      paymentMethod: 'transfer',
    })
  }

  return {
    renewMutation,
    orderMutation,
    payMutation,
    cancelOrderMutation,
    handleCancelOrder,
    handleToggleSuspend,
    handleDeleteLicense,
    handleDeletePlan,
    handleOrderPlan,
  }
}
