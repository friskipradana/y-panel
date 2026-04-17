import { useState, type ReactElement } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listProjects,
  createProject,
  deleteProject,
  startProject,
  stopProject,
  type Project,
} from '@/api/agent'
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
  active: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  stopped: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
  building: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
  error: 'bg-red-500/12 text-red-600 dark:text-red-300',
  draft: 'bg-violet-500/12 text-violet-600 dark:text-violet-300',
}

const PROJECT_TYPES = ['static', 'nodejs', 'python', 'php', 'docker', 'proxy', 'custom']
const inputClass = 'w-full rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.03)] px-3.5 py-2.5 text-[13px] text-[var(--win-text)] outline-none transition placeholder-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.04)] focus:border-emerald-400'

export default function ProjectsWindow() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    projectType: 'nodejs',
    repoUrl: '',
    workingDir: '',
  })

  const { data: projects = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(),
    refetchInterval: 10_000,
  })

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      toast.success(`Project "${p.name}" dibuat (port ${p.assignedPort})`)
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowCreate(false)
      setForm({ name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal membuat project'),
  })

  const startMut = useMutation({
    mutationFn: startProject,
    onSuccess: () => { toast.success('Project dijalankan'); qc.invalidateQueries({ queryKey: ['projects'] }) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal menjalankan project'),
  })

  const stopMut = useMutation({
    mutationFn: stopProject,
    onSuccess: () => { toast.success('Project dihentikan'); qc.invalidateQueries({ queryKey: ['projects'] }) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => { toast.success('Project dihapus'); qc.invalidateQueries({ queryKey: ['projects'] }) },
  })

  return (
    <div className="flex h-full flex-col bg-[var(--win-bg)] text-[var(--win-text)] select-none">
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <FolderCode className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Projects</span>
          <span className="ml-1 text-xs text-[var(--text-secondary)]">({projects.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[var(--win-text)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/18 dark:text-emerald-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Buat Project
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-[440px] rounded-[24px] border border-[var(--win-border)] bg-[var(--win-bg)] p-6 shadow-[var(--win-shadow)]">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <FolderCode className="h-4 w-4 text-emerald-500" />
              Project Baru
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Nama Project *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Awesome App"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Tipe</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, projectType: t }))}
                      className={[
                        'flex items-center justify-center gap-1 rounded-[12px] border px-2 py-2 text-[11px] font-medium capitalize transition',
                        form.projectType === t
                          ? 'border-emerald-500/25 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
                          : 'border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] text-[var(--text-secondary)] hover:bg-[rgba(15,23,42,0.04)] dark:bg-[rgba(255,255,255,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]',
                      ].join(' ')}
                    >
                      {TYPE_ICON[t]} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Working Directory</label>
                <input
                  value={form.workingDir}
                  onChange={(e) => setForm((f) => ({ ...f, workingDir: e.target.value }))}
                  placeholder="/home/user/my-app"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Deskripsi (opsional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[var(--win-text)] dark:bg-[rgba(255,255,255,0.03)]"
              >
                Batal
              </button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending || !form.name}
                className="flex-1 rounded-[14px] bg-[linear-gradient(135deg,#10b981,#14b8a6)] py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(16,185,129,0.24)] transition hover:brightness-105 disabled:opacity-50"
              >
                {createMut.isPending ? 'Membuat...' : 'Buat Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat projects...</div>
        ) : projects.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] text-sm text-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.03)]">
            <FolderCode className="h-8 w-8 opacity-40" />
            <span>Belum ada project. Buat project pertamamu.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onStart={() => startMut.mutate(p.id)}
                onStop={() => stopMut.mutate(p.id)}
                onDelete={() => {
                  if (confirm(`Hapus project "${p.name}"?`)) deleteMut.mutate(p.id)
                }}
                isStarting={startMut.isPending && startMut.variables === p.id}
                isStopping={stopMut.isPending && stopMut.variables === p.id}
              />
            ))}
          </div>
        )}
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
    <div className="group rounded-[18px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] p-4 transition-all hover:bg-[rgba(15,23,42,0.04)] dark:bg-[rgba(255,255,255,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]">
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(20,184,166,0.14))] text-emerald-600 dark:text-emerald-300">
            {TYPE_ICON[p.projectType] ?? <FolderCode className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--win-text)]">{p.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[p.status] ?? ''}`}>
                {p.status}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="capitalize">{p.projectType}</span>
              {p.assignedPort > 0 && <span className="font-mono">:{p.assignedPort}</span>}
              {p.workingDir && <span className="max-w-[180px] truncate font-mono">{p.workingDir}</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {p.running || p.status === 'active' ? (
            <button
              onClick={onStop}
              disabled={isStopping}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/12 px-2.5 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-500/18 dark:text-amber-300 disabled:opacity-50"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={isStarting}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/12 px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-500/18 dark:text-emerald-300 disabled:opacity-50"
            >
              <Play className="h-3 w-3" /> Start
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {p.description && <p className="mt-2.5 pl-[52px] text-xs leading-relaxed text-[var(--text-secondary)]">{p.description}</p>}
    </div>
  )
}
