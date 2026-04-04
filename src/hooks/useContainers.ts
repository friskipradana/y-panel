import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContainers, startContainer, stopContainer } from '@/api/portainer'
import type { Container } from '@/types'

// Fetch semua container — polling tiap 10 detik otomatis
export function useContainers(endpointId = 1) {
  return useQuery<Container[]>({
    queryKey: ['containers', endpointId],
    queryFn: () => getContainers(endpointId),
    refetchInterval: 10_000,        // polling tiap 10s
    refetchIntervalInBackground: true,
    retry: 2,
    staleTime: 5_000,
  })
}

// Start container
export function useStartContainer(endpointId = 1) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => startContainer(endpointId, containerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}

// Stop container
export function useStopContainer(endpointId = 1) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => stopContainer(endpointId, containerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}
