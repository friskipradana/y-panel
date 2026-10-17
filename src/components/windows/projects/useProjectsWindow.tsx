import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  startProject,
  stopProject,
  uploadStaticProjectBuild,
  type Project,
} from '@/api/agent'
import { type WindowState } from '@/types'
import { alertLib } from '@/lib/alert'
import { useWindowStore } from '@/store/windowStore'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useListQuery } from '@/hooks/useListQuery'
import { listQueryKey } from '@/lib/listQuery'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import {
  LIST_LIMIT,
  type StaticUploadState,
  type UploadDraft,
} from './projectsConfig'

export interface ProjectsWindowProps {
  win?: WindowState
}

const EMPTY_FORM = { name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '', spaFallback: true }

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

export function useProjectsWindow({ win }: ProjectsWindowProps) {
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const openWindow = useWindowStore((state) => state.openWindow)
  const { t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  // the search, the order and the column filters; the agent applies them to the whole list
  const list = useListQuery()
  const { setFilter, setText } = list
  const [form, setForm] = useState(EMPTY_FORM)
  const uploadClearTimerRef = useRef<number | null>(null)
  const [staticUpload, setStaticUpload] = useState<StaticUploadState | null>(null)
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null)
  // the project whose domain is being pointed through a Cloudflare tunnel
  const [domainProject, setDomainProject] = useState<Project | null>(null)
  // the project whose log is open
  const [logProject, setLogProject] = useState<Project | null>(null)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['projects', listQueryKey(list.query)],
    queryFn: () => listProjects({ table: list.query, limit: LIST_LIMIT, offset: 0 }),
    refetchInterval: pollingActive ? 10_000 : false,
    placeholderData: keepPreviousData,
  })

  const visibleProjects = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0
  const facets = data?.facets
  // how many there are, whatever the filters say: the badge
  const stats = { running: facets?.state?.running ?? 0, all: data?.all ?? 0 }
  const narrowed = !!list.query.q || Object.keys(list.filters).length > 0

  const highlightedProjectId = Number(win?.params?.highlightProjectId ?? 0) || null
  const incidentMessage = typeof win?.params?.incidentMessage === 'string' ? win.params.incidentMessage : ''
  const incidentMetadata = typeof win?.params?.incidentMetadata === 'string' ? win.params.incidentMetadata : ''
  const incidentAt = typeof win?.params?.incidentAt === 'string' ? win.params.incidentAt : ''
  const hasAutoFocusedRef = useRef<number | null>(null)

  // opened from an incident or a link: the same filter and search arrive as window params
  useEffect(() => {
    if (win?.params?.attentionOnly !== undefined) {
      const type = typeof win.params.attentionType === 'string' ? win.params.attentionType.toLowerCase() : 'all'
      if (!win.params.attentionOnly) setFilter('state', [])
      else setFilter('state', type === 'drift' || type === 'degraded' ? [type] : ['degraded', 'drift'])
    }
    if (typeof win?.params?.search === 'string') setText(win.params.search.trim())
    if (highlightedProjectId) hasAutoFocusedRef.current = null
  }, [highlightedProjectId, win?.params?.attentionOnly, win?.params?.attentionType, win?.params?.search, setFilter, setText])

  const refresh = () => qc.invalidateQueries({ queryKey: ['projects'] })

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      toast.success(t('projects.createdTitle'), { description: t('projects.createdMessage', { name: p.name, port: p.assignedPort }) })
      void refresh()
      setShowCreate(false)
      setForm(EMPTY_FORM)
    },
    onError: (e) => {
      const message = apiError(e, t('projects.createFailedMessage'))
      alertLib.fire(t('projects.createFailedTitle'), message, 'error', 'projects')
    },
  })

  const startMut = useMutation({
    mutationFn: startProject,
    onSuccess: (result) => {
      // a project that is still installing or building has not failed; its log says how far it is
      if (result.status === 'building') toast.info(t('projects.startingTitle'), { description: t('projects.startingMessage') })
      else toast.success(t('projects.startedTitle'), { description: t('projects.startedMessage') })
      void refresh()
    },
    onError: (e) => alertLib.fire(t('projects.startFailedTitle'), apiError(e, t('projects.startFailedMessage')), 'error', 'projects'),
  })

  const stopMut = useMutation({
    mutationFn: stopProject,
    onSuccess: () => {
      toast.success(t('projects.stoppedTitle'), { description: t('projects.stoppedMessage') })
      void refresh()
    },
    onError: (e) => alertLib.fire(t('projects.stopFailedTitle'), apiError(e, t('projects.stopFailedMessage')), 'error', 'projects'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      toast.success(t('projects.deletedTitle'), { description: t('projects.deletedMessage') })
      void refresh()
    },
    onError: (e) => alertLib.fire(t('projects.deleteFailedTitle'), apiError(e, t('projects.deleteFailedMessage')), 'error', 'projects'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: typeof form }) => updateProject(id, payload),
    onSuccess: (p) => {
      toast.success(t('projects.updatedTitle'), { description: t('projects.updatedMessage', { name: p.name }) })
      void refresh()
      setEditingProject(null)
      setForm(EMPTY_FORM)
    },
    onError: (e) => alertLib.fire(t('projects.updateFailedTitle'), apiError(e, t('projects.updateFailedMessage')), 'error', 'projects'),
  })

  const uploadStaticMut = useMutation({
    mutationFn: async ({ project, file, rootDir, clean }: { project: Project; file: File; rootDir: string; clean: boolean }) => {
      if (uploadClearTimerRef.current) window.clearTimeout(uploadClearTimerRef.current)
      setStaticUpload({ projectName: project.name, fileName: file.name, percent: 0, phase: 'uploading' })
      return uploadStaticProjectBuild(project.id, file, clean, rootDir, (percent) => {
        setStaticUpload((current) => (current ? { ...current, percent, phase: percent >= 100 ? 'extracting' : 'uploading' } : current))
      })
    },
    onSuccess: (_, variables) => {
      setStaticUpload((current) => (current ? { ...current, percent: 100, phase: 'done' } : current))
      toast.success(t('projects.uploadedTitle'), { description: t('projects.uploadedMessage', { name: variables.project.name }) })
      setUploadDraft(null)
      void refresh()
    },
    onError: (e) => {
      setStaticUpload((current) => (current ? { ...current, phase: 'error' } : current))
      alertLib.fire(t('projects.uploadFailedTitle'), apiError(e, t('projects.uploadFailedMessage')), 'error', 'projects')
    },
    onSettled: () => {
      uploadClearTimerRef.current = window.setTimeout(() => setStaticUpload(null), 900)
    },
  })

  const highlightedProject = useMemo(
    () => visibleProjects.find((project) => project.id === highlightedProjectId) ?? null,
    [highlightedProjectId, visibleProjects],
  )

  useEffect(() => {
    if (!highlightedProjectId || hasAutoFocusedRef.current === highlightedProjectId) return
    const element = document.getElementById(`project-row-${highlightedProjectId}`)
    if (!element) return
    hasAutoFocusedRef.current = highlightedProjectId
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => element.focus(), 180)
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
    openWindow('system-logs', { service: 'reneo', search: highlightedProject.name })
  }

  const copyHighlightedInspectCommand = async () => {
    if (!highlightedProject) return
    const runtimeName = highlightedProject.name.trim().replace(/\s+/g, '-').toLowerCase()
    const commandParts = [
      highlightedProject.workingDir ? `cd ${JSON.stringify(highlightedProject.workingDir)}` : '',
      `printf '\\n== docker ps ==\\n' && docker ps --format 'table {{.Names}}\\t{{.Status}}' | grep -i ${JSON.stringify(runtimeName)} || true`,
      `printf '\\n== recent logs ==\\n' && journalctl -u reneo -n 80 --no-pager | grep -i ${JSON.stringify(highlightedProject.name)} || true`,
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(commandParts.join(' && '))
      toast.success(t('projects.inspectCopiedTitle'), { description: highlightedProject.name })
    } catch {
      toast.error(t('projects.inspectCopyFailedTitle'), { description: highlightedProject.name })
    }
  }

  const openTunnelForProject = (project: Project) => setDomainProject(project)

  const openStaticUpload = (project: Project) => {
    setUploadDraft({ project, file: null, rootDir: '', clean: false })
  }

  const openCreate = () => {
    setEditingProject(null)
    setForm(EMPTY_FORM)
    setShowCreate(true)
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
      toast.error(t('projects.zipMissing'))
      return
    }
    const file = uploadDraft.file
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error(t('projects.zipFormatTitle'), { description: t('projects.zipFormatMessage') })
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
    list,
    narrowed,
    form,
    setForm,
    staticUpload,
    uploadDraft,
    setUploadDraft,
    isLoading,
    isError,
    refetch,
    isFetching,
    total,
    facets,
    stats,
    visibleProjects,
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
    domainProject,
    setDomainProject,
    logProject,
    setLogProject,
    pollingActive,
    openStaticUpload,
    openCreate,
    openEditProject,
    submitStaticUpload,
  }
}

export type ProjectsWindowState = ReturnType<typeof useProjectsWindow>
