import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  startProject,
  stopProject,
  uploadStaticProjectBuild,
  getProjectAttentionSummary,
  type Project,
} from '@/api/agent'
import { type WindowState } from '@/types'
import { alertLib } from '@/lib/alert'
import { useWindowStore } from '@/store/windowStore'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import {
  PAGE_SIZE,
  type AttentionFilter,
  type StaticUploadState,
  type UploadDraft,
} from './projectsConfig'

export interface ProjectsWindowProps {
  win?: WindowState
}

export function useProjectsWindow({ win }: ProjectsWindowProps) {
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const openWindow = useWindowStore((state) => state.openWindow)
  const { t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState({
    name: '',
    description: '',
    projectType: 'nodejs',
    repoUrl: '',
    workingDir: '',
    spaFallback: true,
  })
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all')
  const uploadClearTimerRef = useRef<number | null>(null)
  const [staticUpload, setStaticUpload] = useState<StaticUploadState | null>(null)
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['projects', { search, offset }],
    queryFn: () => listProjects({ q: search, limit: PAGE_SIZE, offset }),
    refetchInterval: pollingActive ? 10_000 : false,
  })
  const { data: attentionSummary, refetch: refetchAttentionSummary, isFetching: isFetchingAttentionSummary } = useQuery({
    queryKey: ['projects-attention-summary', { search }],
    queryFn: () => getProjectAttentionSummary({ q: search }),
    refetchInterval: pollingActive ? 10_000 : false,
  })

  const projects = data?.items ?? []
  const total = data?.total ?? 0
  const summaryTotal = attentionSummary?.total ?? total
  const activeCount = useMemo(() => projects.filter((project) => project.running || project.status === 'active').length, [projects])
  const degradedCount = attentionSummary?.degradedCount ?? projects.filter((project) => project.status === 'degraded').length
  const driftCount = attentionSummary?.driftCount ?? projects.filter((project) => project.runtime?.drift).length
  const attentionCount = attentionSummary?.attentionCount ?? projects.filter((project) => project.status === 'degraded' || project.runtime?.drift).length
  const showRefreshing = isFetching || isFetchingAttentionSummary
  const visibleProjects = useMemo(() => {
    if (!attentionOnly) return projects
    if (attentionFilter === 'drift') {
      return projects.filter((project) => project.runtime?.drift)
    }
    if (attentionFilter === 'degraded') {
      return projects.filter((project) => project.status === 'degraded')
    }
    return projects.filter((project) => project.status === 'degraded' || project.runtime?.drift)
  }, [attentionFilter, attentionOnly, projects])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const highlightedProjectId = Number(win?.params?.highlightProjectId ?? 0) || null
  const incidentMessage = typeof win?.params?.incidentMessage === 'string' ? win.params.incidentMessage : ''
  const incidentMetadata = typeof win?.params?.incidentMetadata === 'string' ? win.params.incidentMetadata : ''
  const incidentAt = typeof win?.params?.incidentAt === 'string' ? win.params.incidentAt : ''
  const hasAutoFocusedRef = useRef<number | null>(null)

  useEffect(() => {
    setOffset(0)
  }, [attentionFilter, attentionOnly])

  useEffect(() => {
    if (win?.params?.attentionOnly !== undefined) {
      setAttentionOnly(Boolean(win.params.attentionOnly))
    }
    if (typeof win?.params?.attentionType === 'string') {
      const nextFilter = win.params.attentionType.toLowerCase()
      if (nextFilter === 'drift' || nextFilter === 'degraded' || nextFilter === 'all') {
        setAttentionFilter(nextFilter)
      }
    }
    if (typeof win?.params?.search === 'string') {
      const nextSearch = win.params.search.trim()
      setQuery(nextSearch)
      setSearch(nextSearch)
      setOffset(0)
    }
    if (highlightedProjectId) {
      hasAutoFocusedRef.current = null
    }
  }, [highlightedProjectId, win?.params?.attentionOnly, win?.params?.attentionType, win?.params?.search])

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      alertLib.fire(t('projects.createdTitle'), t('projects.createdMessage', { name: p.name, port: p.assignedPort }), 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowCreate(false)
      setForm({ name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '', spaFallback: true })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? t('projects.createFailedMessage')
      toast.error(t('projects.createFailedMessage'), { description: message })
      alertLib.fire(t('projects.createFailedTitle'), message, 'error', 'projects')
    },
  })

  const startMut = useMutation({
    mutationFn: startProject,
    onSuccess: () => {
      alertLib.fire(t('projects.startedTitle'), t('projects.startedMessage'), 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => alertLib.fire(t('projects.startFailedTitle'), e.response?.data?.error ?? t('projects.startFailedMessage'), 'error', 'projects'),
  })

  const stopMut = useMutation({
    mutationFn: stopProject,
    onSuccess: () => {
      alertLib.fire(t('projects.stoppedTitle'), t('projects.stoppedMessage'), 'warning', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => alertLib.fire(t('projects.stopFailedTitle'), e.response?.data?.error ?? t('projects.stopFailedMessage'), 'error', 'projects'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      alertLib.fire(t('projects.deletedTitle'), t('projects.deletedMessage'), 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => alertLib.fire(t('projects.deleteFailedTitle'), e.response?.data?.error ?? t('projects.deleteFailedMessage'), 'error', 'projects'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: typeof form }) => updateProject(id, payload),
    onSuccess: (p) => {
      alertLib.fire('Project Diperbarui', `Project <strong>${p.name}</strong> berhasil diperbarui.`, 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
      setEditingProject(null)
      setForm({ name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '', spaFallback: true })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal memperbarui project'
      toast.error('Gagal memperbarui project', { description: message })
      alertLib.fire('Gagal Update Project', message, 'error', 'projects')
    },
  })

  const uploadStaticMut = useMutation({
    mutationFn: async ({ project, file, rootDir, clean }: { project: Project; file: File; rootDir: string; clean: boolean }) => {
      if (uploadClearTimerRef.current) window.clearTimeout(uploadClearTimerRef.current)
      setStaticUpload({ projectName: project.name, fileName: file.name, percent: 0, phase: 'uploading' })
      return uploadStaticProjectBuild(project.id, file, clean, rootDir, (percent) => {
        setStaticUpload((current) => current
          ? { ...current, percent, phase: percent >= 100 ? 'extracting' : 'uploading' }
          : current)
      })
    },
    onSuccess: (_, variables) => {
      setStaticUpload((current) => current ? { ...current, percent: 100, phase: 'done' } : current)
      toast.success('Build static berhasil diupload', { description: variables.project.name })
      alertLib.fire('Build Static Diupload', `File build untuk <strong>${variables.project.name}</strong> berhasil diextract ke working directory.`, 'success', 'projects')
      setUploadDraft(null)
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => {
      setStaticUpload((current) => current ? { ...current, phase: 'error' } : current)
      const message = e.response?.data?.error ?? 'Gagal upload build static'
      toast.error('Gagal upload build static', { description: message })
      alertLib.fire('Gagal Upload Build', message, 'error', 'projects')
    },
    onSettled: () => {
      uploadClearTimerRef.current = window.setTimeout(() => {
        setStaticUpload(null)
      }, 900)
    },
  })
  const highlightedProject = useMemo(
    () => visibleProjects.find((project) => project.id === highlightedProjectId) ?? null,
    [highlightedProjectId, visibleProjects],
  )

  useEffect(() => {
    if (!highlightedProjectId || hasAutoFocusedRef.current === highlightedProjectId) return
    const element = document.getElementById(`project-card-${highlightedProjectId}`)
    if (!element) return
    hasAutoFocusedRef.current = highlightedProjectId
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      ;(element as HTMLDivElement).focus()
    }, 180)
  }, [highlightedProjectId, visibleProjects])

  const openHighlightedProjectFiles = async () => {
    if (!highlightedProject?.workingDir) {
      toast.error(t('projects.workingDirUnavailableTitle'), { description: t('projects.openFilesUnavailable') })
      return
    }
    openWindow('file-manager', { currentPath: highlightedProject.workingDir })
  }

  const copyHighlightedProjectPath = async () => {
    if (!highlightedProject?.workingDir) {
      toast.error(t('projects.workingDirUnavailableTitle'), { description: t('projects.copyPathUnavailable') })
      return
    }
    try {
      await navigator.clipboard.writeText(highlightedProject.workingDir)
      toast.success(t('projects.pathCopiedTitle'), { description: highlightedProject.workingDir })
    } catch {
      toast.error(t('projects.pathCopyFailedTitle'), { description: highlightedProject.workingDir })
    }
  }

  const openHighlightedProjectLogs = () => {
    if (!highlightedProject) return
    openWindow('system-logs', {
      service: 'reneo',
      search: highlightedProject.name,
    })
  }

  const copyHighlightedInspectCommand = async () => {
    if (!highlightedProject) return
    const runtimeName = highlightedProject.name.trim().replace(/\s+/g, '-').toLowerCase()
    const commandParts = [
      highlightedProject.workingDir ? `cd ${JSON.stringify(highlightedProject.workingDir)}` : '',
      `printf '\\n== docker ps ==\\n' && docker ps --format 'table {{.Names}}\\t{{.Status}}' | grep -i ${JSON.stringify(runtimeName)} || true`,
      `printf '\\n== recent logs ==\\n' && journalctl -u reneo -n 80 --no-pager | grep -i ${JSON.stringify(highlightedProject.name)} || journalctl -u ui-panel -n 80 --no-pager | grep -i ${JSON.stringify(highlightedProject.name)} || true`,
    ].filter(Boolean)
    const command = commandParts.join(' && ')
    try {
      await navigator.clipboard.writeText(command)
      toast.success(t('projects.inspectCopiedTitle'), { description: highlightedProject.name })
    } catch {
      toast.error(t('projects.inspectCopyFailedTitle'), { description: highlightedProject.name })
    }
  }

  const openTunnelForProject = (project: Project) => {
    openWindow('tunnels', {
      tab: 'tunnels',
      action: 'createTunnel',
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      projectPort: project.assignedPort,
      shortcutNonce: Date.now(),
    })
  }

  const openStaticUpload = (project: Project) => {
    setUploadDraft({ project, file: null, rootDir: '', clean: false })
  }

  const openEditProject = (project: Project) => {
    setEditingProject(project)
    setForm({
      name: project.name,
      description: project.description,
      projectType: project.projectType,
      repoUrl: project.repoUrl,
      workingDir: project.workingDir,
      spaFallback: project.spaFallback ?? true,
    })
  }

  const submitStaticUpload = () => {
    if (!uploadDraft?.file) {
      toast.error('File ZIP belum dipilih')
      return
    }
    const file = uploadDraft.file
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Format file tidak didukung', { description: 'Upload build static harus berupa file .zip.' })
      return
    }
    uploadStaticMut.mutate({
      project: uploadDraft.project,
      file,
      rootDir: uploadDraft.rootDir.trim(),
      clean: uploadDraft.clean,
    })
  }

  return {
    t,
    showCreate,
    setShowCreate,
    editingProject,
    setEditingProject,
    query,
    setQuery,
    setSearch,
    offset,
    setOffset,
    form,
    setForm,
    attentionOnly,
    setAttentionOnly,
    attentionFilter,
    setAttentionFilter,
    staticUpload,
    uploadDraft,
    setUploadDraft,
    isLoading,
    refetch,
    isFetching,
    refetchAttentionSummary,
    total,
    summaryTotal,
    activeCount,
    degradedCount,
    driftCount,
    attentionCount,
    showRefreshing,
    visibleProjects,
    totalPages,
    currentPage,
    highlightedProjectId,
    incidentMessage,
    incidentMetadata,
    incidentAt,
    createMut,
    startMut,
    stopMut,
    deleteMut,
    updateMut,
    uploadStaticMut,
    highlightedProject,
    openHighlightedProjectFiles,
    copyHighlightedProjectPath,
    openHighlightedProjectLogs,
    copyHighlightedInspectCommand,
    openTunnelForProject,
    openStaticUpload,
    openEditProject,
    submitStaticUpload,
  }
}

export type ProjectsWindowState = ReturnType<typeof useProjectsWindow>
