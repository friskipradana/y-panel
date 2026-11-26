import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAppLicenses,
  fetchAppLicensePlans,
  fetchAppLicenseOrders,
  fetchAvailableApps,
} from '@/api/appLicenses'
import { type LicenseStatusFilter } from './licenseFormatters'

export function useAppLicensesData(search: string, statusFilter: LicenseStatusFilter) {
  const {
    data: licenses = [],
    isLoading: licensesLoading,
    isError: licensesError,
    isRefetching: licensesRefetching,
    refetch: refetchLicenses,
  } = useQuery({
    queryKey: ['app-licenses'],
    queryFn: () => fetchAppLicenses(),
    staleTime: 30_000,
  })

  const { data: availableApps = [], refetch: refetchApps } = useQuery({
    queryKey: ['app-licenses-available-apps'],
    queryFn: fetchAvailableApps,
    staleTime: 60_000,
  })

  const {
    data: plans = [],
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
  } = useQuery({
    queryKey: ['app-license-plans', 'reneo-crm'],
    queryFn: () => fetchAppLicensePlans('reneo-crm'),
    staleTime: 60_000,
  })

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['app-license-orders'],
    queryFn: () => fetchAppLicenseOrders(),
    staleTime: 15_000,
  })

  const filteredLicenses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return licenses.filter((lic) => {
      const isSuspended = lic.status === 'SUSPENDED'
      const isExpired = !isSuspended && (lic.isExpired || lic.status === 'EXPIRED')
      if (statusFilter === 'ACTIVE' && (isSuspended || isExpired)) return false
      if (statusFilter === 'SUSPENDED' && !isSuspended) return false
      if (statusFilter === 'EXPIRED' && !isExpired) return false
      if (!q) return true
      return (
        lic.appName.toLowerCase().includes(q) ||
        lic.catalogId.toLowerCase().includes(q) ||
        lic.licenseKey.toLowerCase().includes(q) ||
        lic.planName.toLowerCase().includes(q)
      )
    })
  }, [licenses, search, statusFilter])

  const activeCount = useMemo(
    () => licenses.filter((l) => !l.isExpired && l.status !== 'EXPIRED' && l.status !== 'SUSPENDED').length,
    [licenses]
  )
  const suspendedCount = useMemo(
    () => licenses.filter((l) => l.status === 'SUSPENDED').length,
    [licenses]
  )
  const expiredCount = useMemo(
    () => licenses.filter((l) => l.status !== 'SUSPENDED' && (l.isExpired || l.status === 'EXPIRED')).length,
    [licenses]
  )
  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'pending').length,
    [orders]
  )

  const refetchAll = () => {
    refetchLicenses()
    refetchApps()
    refetchPlans()
    refetchOrders()
  }

  return {
    licenses,
    licensesLoading,
    licensesError,
    licensesRefetching,
    refetchLicenses,
    availableApps,
    refetchApps,
    plans,
    plansLoading,
    plansError,
    refetchPlans,
    orders,
    ordersLoading,
    ordersError,
    refetchOrders,
    filteredLicenses,
    activeCount,
    suspendedCount,
    expiredCount,
    pendingOrdersCount,
    refetchAll,
  }
}
