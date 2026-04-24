import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useContainers() {
  return useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: listContainers,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
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

export function useRestartContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => restartContainer(containerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
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

export function useDockerNetworks() {
  return useQuery({
    queryKey: ['docker-networks'],
    queryFn: listDockerNetworks,
    refetchInterval: 15_000,
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

export function useDockerImages() {
  return useQuery({
    queryKey: ['docker-images'],
    queryFn: listDockerImages,
    refetchInterval: 15_000,
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

