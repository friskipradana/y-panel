import { useMemo } from 'react'
import type { Container, DockerImage, DockerMount, DockerNetwork, DockerTemplate } from '@/types'

interface DockerListsInput {
  containers: Container[]
  search: string
  images?: DockerImage[]
  networks?: DockerNetwork[]
  mounts?: DockerMount[]
  templates?: DockerTemplate[]
}

// What the lists of the Docker tabs show: the toolbar search applied, and what containers already use
export function useDockerLists({ containers, search, images = [], networks = [], mounts = [], templates = [] }: DockerListsInput) {
  const imagesInUse = useMemo(() => new Set(containers.map((c) => c.Image)), [containers])
  const networkUsage = useMemo(() => {
    const usage: Record<string, number> = {}
    for (const c of containers) for (const name of c.Networks ?? []) usage[name] = (usage[name] ?? 0) + 1
    return usage
  }, [containers])

  const filteredImages = useMemo(() => images.filter((img) => !search || `${img.Repository}:${img.Tag} ${img.Id}`.toLowerCase().includes(search)), [images, search])
  const filteredNetworks = useMemo(
    () => networks.filter((net) => !search || `${net.Name} ${net.Driver} ${net.Subnet ?? ''} ${net.Id}`.toLowerCase().includes(search)),
    [networks, search],
  )
  const filteredMounts = useMemo(
    () => mounts.filter((m) => !search || `${m.containerName} ${m.projectName ?? ''} ${m.name ?? ''} ${m.source ?? ''} ${m.destination} ${m.type}`.toLowerCase().includes(search)),
    [mounts, search],
  )
  const filteredTemplates = useMemo(() => templates.filter((tpl) => !search || `${tpl.name} ${tpl.description}`.toLowerCase().includes(search)), [templates, search])

  return { imagesInUse, networkUsage, filteredImages, filteredNetworks, filteredMounts, filteredTemplates }
}
