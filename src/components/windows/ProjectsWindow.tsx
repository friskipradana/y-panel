import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listProjects,
  createProject,
  deleteProject,
  startProject,
  stopProject,
  getProjectAttentionSummary,
  type Project,
} from '@/api/agent'
import type { WindowState } from '@/types'
import { alertLib } from '@/lib/alert'
import { useWindowStore } from '@/store/windowStore'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import {
  FolderCode,
  Plus,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Globe,
  Server,
  Code,
  Box,
  Search,
  ChevronLeft,
  ChevronRight,
  Terminal,
  // Sparkles,
} from 'lucide-react'

const TYPE_ICON: Record<string, ReactElement> = {
  static: <Globe className="h-3.5 w-3.5" />,
  nodejs: <Code className="h-3.5 w-3.5" />,
  python: <Code className="h-3.5 w-3.5" />,
  php: <Code className="h-3.5 w-3.5" />,
  docker: <Box className="h-3.5 w-3.5" />,
  proxy: <Server className="h-3.5 w-3.5" />,
  custom: <FolderCode className="h-3.5 w-3.5" />,
}

const STATUS_PILL: Record<string, string> = {
  active: 'panel-badge--success',
  stopped: 'panel-badge--neutral',
  building: 'panel-badge--warning',
  error: 'panel-badge--danger',
  draft: 'panel-badge--info',
  degraded: 'panel-badge--warning',
}

const PROJECT_TYPES = ['static', 'nodejs', 'python', 'php', 'docker', 'proxy', 'custom']
const PAGE_SIZE = 8

interface ProjectsWindowProps {
  win?: WindowState
}

type AttentionFilter = 'all' | 'drift' | 'degraded'

export default function ProjectsWindow({ win }: ProjectsWindowProps) {
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const openWindow = useWindowStore((state) => state.openWindow)
  const { t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState({
    name: '',
    description: '',
    projectType: 'nodejs',
    repoUrl: '',
    workingDir: '',
  })
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all')

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
      setForm({ name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '' })
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
      service: 'ypanel',
      search: highlightedProject.name,
    })
  }

  const copyHighlightedInspectCommand = async () => {
    if (!highlightedProject) return
    const runtimeName = highlightedProject.name.trim().replace(/\s+/g, '-').toLowerCase()
    const commandParts = [
      highlightedProject.workingDir ? `cd ${JSON.stringify(highlightedProject.workingDir)}` : '',
      `printf '\\n== docker ps ==\\n' && docker ps --format 'table {{.Names}}\\t{{.Status}}' | grep -i ${JSON.stringify(runtimeName)} || true`,
      `printf '\\n== recent logs ==\\n' && journalctl -u ypanel -n 80 --no-pager | grep -i ${JSON.stringify(highlightedProject.name)} || journalctl -u ui-panel -n 80 --no-pager | grep -i ${JSON.stringify(highlightedProject.name)} || true`,
    ].filter(Boolean)
    const command = commandParts.join(' && ')
    try {
      await navigator.clipboard.writeText(command)
      toast.success(t('projects.inspectCopiedTitle'), { description: highlightedProject.name })
    } catch {
      toast.error(t('projects.inspectCopyFailedTitle'), { description: highlightedProject.name })
    }
  }

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <FolderCode className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('projects.title')}</div>
            <div className="panel-window__meta">{t('projects.meta', { total: summaryTotal, active: activeCount, attention: attentionCount })}</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button type="button" onClick={() => { void refetch(); void refetchAttentionSummary() }} className="panel-icon-btn" aria-label={t('projects.refresh')} disabled={showRefreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${showRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => { void refetch(); void refetchAttentionSummary() }}
            className="panel-btn panel-btn--ghost"
            disabled={showRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${showRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <PanelSelectMenu
            id="projects-attention-filter"
            value={attentionOnly ? attentionFilter : 'off'}
            onChange={(value) => {
              if (value === 'off') {
                setAttentionOnly(false)
                setAttentionFilter('all')
                return
              }
              setAttentionOnly(true)
              setAttentionFilter(value as AttentionFilter)
            }}
            options={[
              { value: 'off', label: t('projects.filterAll'), description: t('projects.filterAllDescription', { total: summaryTotal }) },
              { value: 'all', label: t('projects.filterAttention', { count: attentionCount }), description: t('projects.filterAttentionDescription', { count: attentionCount }) },
              { value: 'drift', label: t('projects.filterDrift', { count: driftCount }), description: t('projects.filterDriftDescription') },
              { value: 'degraded', label: t('projects.filterDegraded', { count: degradedCount }), description: t('projects.filterDegradedDescription') },
            ]}
            className="min-w-[190px]"
            buttonClassName="h-[34px] py-0 text-[12px]"
            dropdownClassName="left-auto right-0 min-w-[360px] max-w-[min(520px,calc(100vw-32px))]"
            itemClassName="projects-attention-filter__item"
          />
          <button onClick={() => setShowCreate(true)} className="panel-btn panel-btn--primary-soft">
            <Plus className="h-3.5 w-3.5" />
            {t('projects.createButton')}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 520px)' }}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <FolderCode className="panel-window__icon h-4 w-4" />
              {t('projects.newProject')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="panel-section-label">{t('projects.nameLabel')}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('projects.appNamePlaceholder')}
                  className="panel-input"
                  autoFocus
                />
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{t('projects.nameHelp')}</p>
              </div>
              <div>
                <label className="panel-section-label">{t('projects.runtimeType')}</label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, projectType: t }))}
                      className={[
                        'panel-btn justify-center rounded-[12px] px-2 py-2 text-[12px] font-medium capitalize shadow-none',
                        form.projectType === t ? 'panel-btn--primary-soft' : 'panel-btn--ghost',
                      ].join(' ')}
                    >
                      {TYPE_ICON[t]} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="panel-section-label">{t('projects.repoUrl')}</label>
                <input
                  value={form.repoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
                  placeholder={t('projects.gitUrlPlaceholder')}
                  className="panel-input panel-input--mono"
                />
              </div>
              <div>
                <label className="panel-section-label">{t('projects.workingDir')}</label>
                <input
                  value={form.workingDir}
                  onChange={(e) => setForm((f) => ({ ...f, workingDir: e.target.value }))}
                  placeholder={t('projects.localPathPlaceholder')}
                  className="panel-input panel-input--mono"
                />
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{t('projects.workingDirHelp')}</p>
              </div>
              <div>
                <label className="panel-section-label">{t('projects.description')}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder={t('projects.descriptionPlaceholder')}
                  className="panel-textarea"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="panel-btn panel-btn--ghost flex-1">{t('common.cancel')}</button>
              <button type="button" onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.name.trim()} className="panel-btn panel-btn--primary flex-1">
                {createMut.isPending ? t('projects.creating') : t('projects.createButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        <div className="panel-window__stack">
          {highlightedProject ? (
            <section className="panel-muted-block rounded-[22px] border border-[var(--win-border)] bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(245,158,11,0.06))] px-4 py-4 shadow-[0_18px_36px_rgba(245,158,11,0.12)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="panel-section-label">{t('projects.focusedTarget')}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--win-text)]">{highlightedProject.name}</span>
                    <span className={`panel-badge ${STATUS_PILL[highlightedProject.status] ?? 'panel-badge--neutral'}`}>{highlightedProject.status}</span>
                    {highlightedProject.runtime?.drift ? <span className="panel-badge panel-badge--warning">drift</span> : null}
                  </div>
                  <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                    {highlightedProject.runtime?.driftReason
                      ? t('projects.driftReason', { reason: highlightedProject.runtime.driftReason.split('_').join(' ') })
                      : highlightedProject.description || t('projects.incidentFallback')}
                  </p>
                  {incidentMessage ? (
                    <div className="mt-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-warning-bg)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="panel-badge panel-badge--warning">{t('projects.openedFromIncident')}</span>
                        {incidentAt ? (
                          <span className="text-[12px] text-[var(--text-secondary)]">{new Date(incidentAt).toLocaleString('id-ID')}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12px] font-semibold text-[var(--win-text)]">{incidentMessage}</p>
                      {incidentMetadata && incidentMetadata !== '{}' ? (
                        <code className="panel-mono mt-1 block max-h-16 overflow-y-auto break-all text-[12px] leading-5 text-[var(--text-secondary)]">{incidentMetadata}</code>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => refetch()} className="panel-btn panel-btn--ghost" disabled={isFetching}>
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                    {t('projects.refreshReconcile')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void openHighlightedProjectFiles()}
                    disabled={!highlightedProject.workingDir}
                    className="panel-btn panel-btn--ghost"
                  >
                    <FolderCode className="h-3.5 w-3.5" />
                    {t('projects.openFiles')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openHighlightedProjectLogs()}
                    className="panel-btn panel-btn--ghost"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    {t('projects.openLogs')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyHighlightedInspectCommand()}
                    className="panel-btn panel-btn--ghost"
                  >
                    <Code className="h-3.5 w-3.5" />
                    {t('projects.copyInspectCmd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyHighlightedProjectPath()}
                    disabled={!highlightedProject.workingDir}
                    className="panel-btn panel-btn--ghost"
                  >
                    <Code className="h-3.5 w-3.5" />
                    {t('projects.copyPath')}
                  </button>
                  {highlightedProject.running || highlightedProject.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => stopMut.mutate(highlightedProject.id)}
                      disabled={stopMut.isPending && stopMut.variables === highlightedProject.id}
                      className="panel-btn panel-btn--ghost"
                    >
                      <Square className="h-3.5 w-3.5" />
                      {stopMut.isPending && stopMut.variables === highlightedProject.id ? t('projects.stopping') : t('projects.stopProject')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startMut.mutate(highlightedProject.id)}
                      disabled={startMut.isPending && startMut.variables === highlightedProject.id}
                      className="panel-btn panel-btn--primary-soft"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {startMut.isPending && startMut.variables === highlightedProject.id ? t('projects.starting') : t('projects.startProject')}
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : null}
          <div className="panel-table-container">
            <div className="panel-toolbar panel-toolbar--search">
              <form
                className="panel-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  setOffset(0)
                  setSearch(query.trim())
                }}
              >
                <Search className="h-4 w-4" />
                <input
                  id="projects-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="panel-search__input"
                  placeholder={t('projects.searchPlaceholder')}
                />
                <button type="submit" className="panel-btn panel-btn--primary-soft">{t('common.search')}</button>
              </form>
              <div className="panel-pagination-summary">{t('common.pageSummary', { page: currentPage, totalPages })}</div>
            </div>

            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">{t('projects.loading')}</div>
            ) : visibleProjects.length === 0 ? (
              <div className="panel-empty">
                <FolderCode className="h-8 w-8" />
                <span>
                    {attentionOnly
                      ? attentionFilter === 'drift'
                        ? t('projects.emptyDrift')
                        : attentionFilter === 'degraded'
                          ? t('projects.emptyDegraded')
                          : t('projects.emptyAttention')
                      : t('projects.empty')}
                </span>
              </div>
            ) : (
              <>
                {visibleProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    highlighted={highlightedProjectId === p.id}
                    onStart={() => startMut.mutate(p.id)}
                    onStop={() => stopMut.mutate(p.id)}
                    onDelete={async () => {
                      const confirmed = await alertLib.confirm(
                        t('projects.deleteConfirmTitle'),
                        t('projects.deleteConfirmMessage', { name: p.name }),
                        t('projects.deleteConfirmAction'),
                        t('common.cancel'),
                        'warning',
                        'projects',
                      )
                      if (confirmed) deleteMut.mutate(p.id)
                    }}
                    isStarting={startMut.isPending && startMut.variables === p.id}
                    isStopping={stopMut.isPending && stopMut.variables === p.id}
                  />
                ))}
              </>
            )}

            <div className="panel-pagination">
              <button id="projects-prev-page" className="panel-btn panel-btn--ghost" disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t('common.previous')}
              </button>
              <button id="projects-next-page" className="panel-btn panel-btn--ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
                {t('common.next')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectCard({
  project: p,
  highlighted = false,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
}: {
  project: Project
  highlighted?: boolean
  onStart: () => void
  onStop: () => void
  onDelete: () => void
  isStarting: boolean
  isStopping: boolean
}) {
  const { t } = useI18n()
  const runtimeLabel = p.runtime?.drift ? t('projects.runtimeDrift') : p.runtime?.known ? (p.runtime.running ? t('projects.runtimeActive') : t('projects.runtimeStopped')) : t('projects.runtimeUnknown')
  const runtimeBadgeClass = p.runtime?.drift ? 'panel-badge--warning' : p.runtime?.running ? 'panel-badge--success' : 'panel-badge--neutral'
  return (
    <div
      id={`project-card-${p.id}`}
      tabIndex={highlighted ? -1 : undefined}
      className={[
        'rounded-[22px] border p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition outline-none',
        highlighted
          ? 'border-amber-400/60 bg-[rgba(251,191,36,0.12)] ring-1 ring-amber-400/35 shadow-[0_22px_44px_rgba(245,158,11,0.18)] dark:bg-[rgba(251,191,36,0.08)]'
          : 'border-[var(--win-border)] bg-[var(--win-bg)]/92 backdrop-blur-xl',
      ].join(' ')}>
      <div className="panel-table-row group p-4">
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="panel-avatar">
              {TYPE_ICON[p.projectType] ?? <FolderCode className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-[var(--win-text)]">{p.name}</span>
                <span className={`panel-badge ${STATUS_PILL[p.status] ?? 'panel-badge--neutral'}`}>{p.status}</span>
                <span className={`panel-badge ${runtimeBadgeClass}`}>{runtimeLabel}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span className="capitalize">{p.projectType}</span>
                {p.assignedPort > 0 && <span className="panel-mono">:{p.assignedPort}</span>}
                {p.workingDir && <span className="panel-mono max-w-[180px] truncate">{p.workingDir}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            {p.running || p.status === 'active' ? (
              <button onClick={onStop} disabled={isStopping} className="panel-btn panel-btn--ghost px-3 py-2 text-[12px]">
                <Square className="h-3 w-3" /> {t('projects.stopShort')}
              </button>
            ) : (
              <button onClick={onStart} disabled={isStarting} className="panel-btn panel-btn--primary-soft px-3 py-2 text-[12px]">
                <Play className="h-3 w-3" /> {t('projects.startShort')}
              </button>
            )}
            <button onClick={onDelete} className="panel-icon-btn panel-icon-btn--danger opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {(p.description || p.runtime?.drift) && (
          <div className="mt-2.5 space-y-1 pl-[52px]">
            {p.description && <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{p.description}</p>}
            {p.runtime?.drift && (
              <p className="text-[12px] font-medium text-[var(--warning)]">
                {t('projects.driftPrefix')}: {p.runtime?.driftReason ? p.runtime.driftReason.split('_').join(' ') : t('projects.runtimeMismatch')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}




