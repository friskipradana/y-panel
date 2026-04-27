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
      alertLib.fire('Project Dibuat', `Project <strong>${p.name}</strong> berhasil dibuat pada port <strong>${p.assignedPort}</strong>.`, 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowCreate(false)
      setForm({ name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal membuat project'
      toast.error('Gagal membuat project', { description: message })
      alertLib.fire('Gagal Membuat Project', message, 'error', 'projects')
    },
  })

  const startMut = useMutation({
    mutationFn: startProject,
    onSuccess: () => {
      alertLib.fire('Project Dijalankan', 'Project berhasil dijalankan.', 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => alertLib.fire('Gagal Menjalankan Project', e.response?.data?.error ?? 'Gagal menjalankan project', 'error', 'projects'),
  })

  const stopMut = useMutation({
    mutationFn: stopProject,
    onSuccess: () => {
      alertLib.fire('Project Dihentikan', 'Project berhasil dihentikan.', 'warning', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => alertLib.fire('Gagal Menghentikan Project', e.response?.data?.error ?? 'Gagal menghentikan project', 'error', 'projects'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      alertLib.fire('Project Dihapus', 'Project berhasil dihapus dari sistem.', 'success', 'projects')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: any) => alertLib.fire('Gagal Menghapus Project', e.response?.data?.error ?? 'Gagal menghapus project', 'error', 'projects'),
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
      toast.error('Working directory belum tersedia', { description: 'Project ini belum memiliki path kerja untuk dibuka di File Manager.' })
      return
    }
    openWindow('file-manager', { currentPath: highlightedProject.workingDir })
  }

  const copyHighlightedProjectPath = async () => {
    if (!highlightedProject?.workingDir) {
      toast.error('Working directory belum tersedia', { description: 'Tidak ada path kerja yang bisa disalin.' })
      return
    }
    try {
      await navigator.clipboard.writeText(highlightedProject.workingDir)
      toast.success('Path project disalin', { description: highlightedProject.workingDir })
    } catch {
      toast.error('Gagal menyalin path', { description: highlightedProject.workingDir })
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
      toast.success('Inspect command disalin', { description: highlightedProject.name })
    } catch {
      toast.error('Gagal menyalin inspect command', { description: highlightedProject.name })
    }
  }

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <FolderCode className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Projects</div>
            <div className="panel-window__meta">{summaryTotal} project terindeks • {activeCount} aktif di halaman ini • {attentionCount} perlu perhatian</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button type="button" onClick={() => { void refetch(); void refetchAttentionSummary() }} className="panel-icon-btn" aria-label="Refresh projects" disabled={showRefreshing}>
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
              { value: 'off', label: 'Semua Project', description: `${summaryTotal} project terindeks` },
              { value: 'all', label: `Attention (${attentionCount})`, description: `${attentionCount} project drift atau degraded` },
              { value: 'drift', label: `Drift (${driftCount})`, description: 'Runtime berbeda dari state panel' },
              { value: 'degraded', label: `Degraded (${degradedCount})`, description: 'Project membutuhkan tindakan operator' },
            ]}
            className="min-w-[190px]"
            buttonClassName="h-[34px] py-0 text-xs"
            dropdownClassName="left-auto right-0 min-w-[360px] max-w-[min(520px,calc(100vw-32px))]"
            itemClassName="projects-attention-filter__item"
          />
          <button onClick={() => setShowCreate(true)} className="panel-btn panel-btn--primary-soft">
            <Plus className="h-3.5 w-3.5" />
            Buat Project
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 520px)' }}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <FolderCode className="panel-window__icon h-4 w-4" />
              Project Baru
            </h3>
            <div className="space-y-3">
              <div>
                <label className="panel-section-label">Nama Project *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="my-awesome-app"
                  className="panel-input"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Nama akan dipakai untuk identitas project dan pencarian.</p>
              </div>
              <div>
                <label className="panel-section-label">Tipe Runtime</label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, projectType: t }))}
                      className={[
                        'panel-btn justify-center rounded-[12px] px-2 py-2 text-[11px] font-medium capitalize shadow-none',
                        form.projectType === t ? 'panel-btn--primary-soft' : 'panel-btn--ghost',
                      ].join(' ')}
                    >
                      {TYPE_ICON[t]} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="panel-section-label">Repository URL</label>
                <input
                  value={form.repoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
                  placeholder="https://github.com/user/app.git"
                  className="panel-input panel-input--mono"
                />
              </div>
              <div>
                <label className="panel-section-label">Working Directory</label>
                <input
                  value={form.workingDir}
                  onChange={(e) => setForm((f) => ({ ...f, workingDir: e.target.value }))}
                  placeholder="/home/panel-user/apps/my-app"
                  className="panel-input panel-input--mono"
                />
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Kosongkan jika path akan ditentukan otomatis oleh backend.</p>
              </div>
              <div>
                <label className="panel-section-label">Deskripsi</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Catatan singkat tentang fungsi project ini..."
                  className="panel-textarea"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="panel-btn panel-btn--ghost flex-1">Batal</button>
              <button type="button" onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.name.trim()} className="panel-btn panel-btn--primary flex-1">
                {createMut.isPending ? 'Membuat...' : 'Buat Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        <div className="panel-window__stack">
          {highlightedProject ? (
            <section className="panel-muted-block rounded-[22px] border border-amber-400/35 bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(245,158,11,0.06))] px-4 py-4 shadow-[0_18px_36px_rgba(245,158,11,0.12)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="panel-section-label">Focused remediation target</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--win-text)]">{highlightedProject.name}</span>
                    <span className={`panel-badge ${STATUS_PILL[highlightedProject.status] ?? 'panel-badge--neutral'}`}>{highlightedProject.status}</span>
                    {highlightedProject.runtime?.drift ? <span className="panel-badge panel-badge--warning">drift</span> : null}
                  </div>
                  <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
                    {highlightedProject.runtime?.driftReason
                      ? `Drift reason: ${highlightedProject.runtime.driftReason.split('_').join(' ')}`
                      : highlightedProject.description || 'Project ini dibuka dari incident flow dan siap untuk tindakan cepat.'}
                  </p>
                  {incidentMessage ? (
                    <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="panel-badge panel-badge--warning">opened from incident</span>
                        {incidentAt ? (
                          <span className="text-[10px] text-[var(--text-secondary)]">{new Date(incidentAt).toLocaleString('id-ID')}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--win-text)]">{incidentMessage}</p>
                      {incidentMetadata && incidentMetadata !== '{}' ? (
                        <code className="panel-mono mt-1 block max-h-16 overflow-y-auto break-all text-[10px] leading-5 text-[var(--text-secondary)]">{incidentMetadata}</code>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => refetch()} className="panel-btn panel-btn--ghost" disabled={isFetching}>
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh Reconcile
                  </button>
                  <button
                    type="button"
                    onClick={() => void openHighlightedProjectFiles()}
                    disabled={!highlightedProject.workingDir}
                    className="panel-btn panel-btn--ghost"
                  >
                    <FolderCode className="h-3.5 w-3.5" />
                    Open Files
                  </button>
                  <button
                    type="button"
                    onClick={() => openHighlightedProjectLogs()}
                    className="panel-btn panel-btn--ghost"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Open Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyHighlightedInspectCommand()}
                    className="panel-btn panel-btn--ghost"
                  >
                    <Code className="h-3.5 w-3.5" />
                    Copy Inspect Cmd
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyHighlightedProjectPath()}
                    disabled={!highlightedProject.workingDir}
                    className="panel-btn panel-btn--ghost"
                  >
                    <Code className="h-3.5 w-3.5" />
                    Copy Path
                  </button>
                  {highlightedProject.running || highlightedProject.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => stopMut.mutate(highlightedProject.id)}
                      disabled={stopMut.isPending && stopMut.variables === highlightedProject.id}
                      className="panel-btn panel-btn--ghost"
                    >
                      <Square className="h-3.5 w-3.5" />
                      {stopMut.isPending && stopMut.variables === highlightedProject.id ? 'Stopping...' : 'Stop Project'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startMut.mutate(highlightedProject.id)}
                      disabled={startMut.isPending && startMut.variables === highlightedProject.id}
                      className="panel-btn panel-btn--primary-soft"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {startMut.isPending && startMut.variables === highlightedProject.id ? 'Starting...' : 'Start Project'}
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
                  placeholder="Cari project, slug, deskripsi, path kerja, atau tipe..."
                />
                <button type="submit" className="panel-btn panel-btn--primary-soft">Cari</button>
              </form>
              <div className="panel-pagination-summary">Halaman {currentPage}/{totalPages}</div>
            </div>

            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat projects...</div>
            ) : visibleProjects.length === 0 ? (
              <div className="panel-empty">
                <FolderCode className="h-8 w-8" />
                <span>
                  {attentionOnly
                    ? attentionFilter === 'drift'
                      ? 'Tidak ada project drift di halaman ini.'
                      : attentionFilter === 'degraded'
                        ? 'Tidak ada project degraded di halaman ini.'
                        : 'Tidak ada project yang sedang drift atau degraded di halaman ini.'
                    : 'Belum ada project yang cocok. Coba kata kunci lain atau buat project baru.'}
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
                        'Hapus Project?',
                        `Project <strong>${p.name}</strong> akan dihapus dari sistem.`,
                        'Hapus Project',
                        'Batal',
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
                Sebelumnya
              </button>
              <button id="projects-next-page" className="panel-btn panel-btn--ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
                Berikutnya
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
  const runtimeLabel = p.runtime?.drift ? 'Drift detected' : p.runtime?.known ? (p.runtime.running ? 'Runtime active' : 'Runtime stopped') : 'Runtime unknown'
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
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="capitalize">{p.projectType}</span>
                {p.assignedPort > 0 && <span className="panel-mono">:{p.assignedPort}</span>}
                {p.workingDir && <span className="panel-mono max-w-[180px] truncate">{p.workingDir}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            {p.running || p.status === 'active' ? (
              <button onClick={onStop} disabled={isStopping} className="panel-btn panel-btn--ghost px-2.5 py-1.5 text-xs">
                <Square className="h-3 w-3" /> Stop
              </button>
            ) : (
              <button onClick={onStart} disabled={isStarting} className="panel-btn panel-btn--primary-soft px-2.5 py-1.5 text-xs">
                <Play className="h-3 w-3" /> Start
              </button>
            )}
            <button onClick={onDelete} className="panel-icon-btn panel-icon-btn--danger opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {(p.description || p.runtime?.drift) && (
          <div className="mt-2.5 space-y-1 pl-[52px]">
            {p.description && <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{p.description}</p>}
            {p.runtime?.drift && (
              <p className="text-[11px] font-medium text-[var(--warning)]">
                Drift: {p.runtime?.driftReason ? p.runtime.driftReason.split('_').join(' ') : 'runtime mismatch detected'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
