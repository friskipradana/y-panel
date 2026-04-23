import { useMemo, useState, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listProjects,
  createProject,
  deleteProject,
  startProject,
  stopProject,
  type Project,
} from '@/api/agent'
import { alertLib } from '@/lib/alert'
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
}

const PROJECT_TYPES = ['static', 'nodejs', 'python', 'php', 'docker', 'proxy', 'custom']
const PAGE_SIZE = 8

export default function ProjectsWindow() {
  const qc = useQueryClient()
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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['projects', { search, offset }],
    queryFn: () => listProjects({ q: search, limit: PAGE_SIZE, offset }),
    refetchInterval: 10_000,
  })

  const projects = data?.items ?? []
  const total = data?.total ?? 0
  const activeCount = useMemo(() => projects.filter((project) => project.running || project.status === 'active').length, [projects])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

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

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <FolderCode className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Projects</div>
            <div className="panel-window__meta">{total} project terindeks • {activeCount} aktif di halaman ini</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button onClick={() => refetch()} className="panel-icon-btn" aria-label="Refresh projects">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreate(true)} className="panel-btn panel-btn--primary-soft">
            <Plus className="h-3.5 w-3.5" />
            Buat Project
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card" style={{ width: 'min(100%, 440px)' }}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <FolderCode className="panel-window__icon h-4 w-4" />
              Project Baru
            </h3>
            <div className="space-y-3">
              <div>
                <label className="panel-section-label">Nama Project *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Awesome App" className="panel-input" />
              </div>
              <div>
                <label className="panel-section-label">Tipe</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t}
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
                <label className="panel-section-label">Working Directory</label>
                <input value={form.workingDir} onChange={(e) => setForm((f) => ({ ...f, workingDir: e.target.value }))} placeholder="/home/user/my-app" className="panel-input panel-input--mono" />
              </div>
              <div>
                <label className="panel-section-label">Deskripsi (opsional)</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="panel-textarea" />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="panel-btn panel-btn--ghost flex-1">Batal</button>
              <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.name} className="panel-btn panel-btn--primary flex-1">
                {createMut.isPending ? 'Membuat...' : 'Buat Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        <div className="panel-window__stack">

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
          ) : projects.length === 0 ? (
            <div className="panel-empty">
              <FolderCode className="h-8 w-8" />
              <span>Belum ada project yang cocok. Coba kata kunci lain atau buat project baru.</span>
            </div>
          ) : (
            <>
              <div className="panel-window__stack">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
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
              </div>

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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProjectCard({
  project: p,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
}: {
  project: Project
  onStart: () => void
  onStop: () => void
  onDelete: () => void
  isStarting: boolean
  isStopping: boolean
}) {
  return (
    <div className="panel-card panel-card--interactive group p-4">
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="panel-avatar">
            {TYPE_ICON[p.projectType] ?? <FolderCode className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--win-text)]">{p.name}</span>
              <span className={`panel-badge ${STATUS_PILL[p.status] ?? 'panel-badge--neutral'}`}>{p.status}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
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

      {p.description && <p className="mt-2.5 pl-[52px] text-xs leading-relaxed text-[var(--text-secondary)]">{p.description}</p>}
    </div>
  )
}
