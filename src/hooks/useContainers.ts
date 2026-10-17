import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  deleteContainer,
  deployComposeProject,
  deployImageContainer,
  listContainerOwners,
  listContainers,
  restartContainer,
  startContainer,
  stopContainer,
  listDockerNetworks,
  listDockerVolumes,
  createDockerNetwork,
  deleteDockerNetwork,
  listDockerImages,
  pullDockerImage,
  deleteDockerImage,
  listDockerTemplates,
  createDockerTemplate,
  updateDockerTemplate,
  deleteDockerTemplate,
} from '@/api/agent'
import type {
  Container,
  DockerDeployComposePayload,
  DockerDeployImagePayload,
  DockerOwnerPreview,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

// After a start, stop or restart the list shows the new state at once; the invalidation then fetches the real one
function setContainerState(qc: QueryClient, containerId: string, state: Container['State']) {
  qc.setQueryData<Container[]>(['containers'], (prev) => prev?.map((c) => (c.Id === containerId || c.Id.startsWith(containerId) ? { ...c, State: state } : c)))
  return qc.invalidateQueries({ queryKey: ['containers'] })
}

export function useContainers(active = true) {
  return useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: listContainers,
    refetchInterval: active ? 10_000 : false,
    refetchIntervalInBackground: false,
    retry: 2,
    staleTime: 5_000,
  })
}

export function useContainerOwners(params?: PaginationParams) {
  return useQuery<PaginatedResponse<DockerOwnerPreview>>({
    queryKey: ['container-owners', params],
    queryFn: () => listContainerOwners(params),
    staleTime: 15_000,
  })
}

export function useStartContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => startContainer(containerId),
    onSuccess: (_data, containerId) => setContainerState(qc, containerId, 'running'),
  })
}

export function useStopContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => stopContainer(containerId),
    onSuccess: (_data, containerId) => setContainerState(qc, containerId, 'exited'),
  })
}

export function useRestartContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => restartContainer(containerId),
    onSuccess: (_data, containerId) => setContainerState(qc, containerId, 'running'),
  })
}

export function useDeleteContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, opts }: { id: string; opts?: { removeVolumes?: boolean; removeImage?: boolean } }) =>
      deleteContainer(id, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}

export function useDeployImageContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DockerDeployImagePayload) => deployImageContainer(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}

export function useDeployComposeProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DockerDeployComposePayload) => deployComposeProject(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  })
}

export function useDockerVolumes(active = true) {
  return useQuery({
    queryKey: ['docker-volumes'],
    queryFn: listDockerVolumes,
    refetchInterval: active ? 15_000 : false,
    refetchIntervalInBackground: false,
  })
}

export function useDockerNetworks(active = true) {
  return useQuery({
    queryKey: ['docker-networks'],
    queryFn: listDockerNetworks,
    refetchInterval: active ? 15_000 : false,
  })
}

export function useCreateDockerNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; subnet?: string; gateway?: string }) => createDockerNetwork(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-networks'] }),
  })
}

export function useDeleteDockerNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDockerNetwork(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-networks'] }),
  })
}

export function useDockerImages(active = true) {
  return useQuery({
    queryKey: ['docker-images'],
    queryFn: listDockerImages,
    refetchInterval: active ? 15_000 : false,
  })
}

export function usePullDockerImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: pullDockerImage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docker-images'] })
      qc.invalidateQueries({ queryKey: ['containers'] })
    },
  })
}

export function useDeleteDockerImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDockerImage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-images'] }),
  })
}

export function useDockerTemplates() {
  return useQuery({
    queryKey: ['docker-templates'],
    queryFn: listDockerTemplates,
  })
}

export function useCreateDockerTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; description: string; yamlContent: string }) => createDockerTemplate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-templates'] }),
  })
}

export function useUpdateDockerTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: number; name: string; description: string; yamlContent: string }) => updateDockerTemplate(payload.id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-templates'] }),
  })
}

export function useDeleteDockerTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteDockerTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker-templates'] }),
  })
}

