import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContainers, startContainer, stopContainer } from '@/api/portainer'
import type { Container } from '@/types'

export function useContainers() {
  return useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: getContainers,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: 2,
    staleTime: 5_000,
  })
}

export function useStartContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => startContainer(containerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}

export function useStopContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => stopContainer(containerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}
