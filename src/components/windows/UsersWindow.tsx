import { useState, type ReactElement } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listUsers,
  createUser,
  suspendUser,
  activateUser,
  deleteUser,
  getUserQuota,
  updateUserQuota,
  type PanelUser,
  type UserQuota,
} from '@/api/agent'
import { toast } from 'sonner'
import {
  Users,
  UserPlus,
  Shield,
  ShieldOff,
  Trash2,
  Crown,
  CircleUser,
  Settings2,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react'

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'text-amber-600 bg-amber-500/10 dark:text-amber-300',
  admin: 'text-blue-600 bg-blue-500/10 dark:text-blue-300',
  user: 'text-slate-600 bg-slate-500/10 dark:text-slate-300',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300',
  suspended: 'text-red-600 bg-red-500/10 dark:text-red-300',
  pending: 'text-yellow-600 bg-yellow-500/10 dark:text-yellow-300',
}

const ROLE_ICON: Record<string, ReactElement> = {
  superadmin: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  user: <CircleUser className="h-3 w-3" />,
}

const inputClass = 'w-full rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.03)] px-3.5 py-2.5 text-[13px] text-[var(--win-text)] outline-none transition placeholder-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.04)] focus:border-indigo-400'

export default function UsersWindow() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showQuota, setShowQuota] = useState<number | null>(null)
  const [showPwd, setShowPwd] = useState(false)

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
    displayName: '',
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers(100, 0),
    refetchInterval: 30_000,
  })

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: (u) => {
      toast.success(`User "${u.username}" berhasil dibuat`)
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setForm({ username: '', email: '', password: '', role: 'user', displayName: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal membuat user'),
  })

  const suspendMut = useMutation({
    mutationFn: suspendUser,
    onSuccess: () => { toast.success('User disuspend'); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  const activateMut = useMutation({
    mutationFn: activateUser,
    onSuccess: () => { toast.success('User diaktifkan'); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { toast.success('User dihapus'); qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal menghapus user'),
  })

  const users = data?.users ?? []

  return (
    <div className="flex h-full flex-col bg-[var(--win-bg)] text-[var(--win-text)] select-none">
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold">User Management</span>
          <span className="ml-1 text-xs text-[var(--text-secondary)]">({users.length} users)</span>
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/12 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/18 dark:text-indigo-300"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Buat User
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-96 rounded-[24px] border border-[var(--win-border)] bg-[var(--win-bg)] p-6 shadow-[var(--win-shadow)]">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <UserPlus className="h-4 w-4 text-indigo-500" />
              Buat User Baru
            </h3>
            <div className="space-y-3">
              {[
                { key: 'username', label: 'Username', type: 'text', placeholder: 'john_doe' },
                { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
                { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'John Doe' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Min. 8 karakter"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--win-text)]"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className={inputClass}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { setShowCreate(false); setForm({ username: '', email: '', password: '', role: 'user', displayName: '' }) }}
                className="flex-1 rounded-[14px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)] hover:text-[var(--win-text)] dark:bg-[rgba(255,255,255,0.03)]"
              >
                Batal
              </button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending}
                className="flex-1 rounded-[14px] bg-[linear-gradient(135deg,#6366f1,#8b5cf6)] py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(99,102,241,0.22)] transition hover:brightness-105 disabled:opacity-50"
              >
                {createMut.isPending ? 'Membuat...' : 'Buat User'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat users...</div>
        ) : users.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] text-sm text-[var(--text-secondary)] dark:bg-[rgba(255,255,255,0.03)]">
            <Users className="h-8 w-8 opacity-40" />
            <span>Belum ada user.</span>
          </div>
        ) : (
          users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onSuspend={() => suspendMut.mutate(u.id)}
              onActivate={() => activateMut.mutate(u.id)}
              onDelete={() => {
                if (confirm(`Hapus user "${u.username}"? Semua data akan ikut terhapus.`)) deleteMut.mutate(u.id)
              }}
              onQuota={() => setShowQuota(showQuota === u.id ? null : u.id)}
              showQuota={showQuota === u.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

function UserRow({
  user,
  onSuspend,
  onActivate,
  onDelete,
  onQuota,
  showQuota,
}: {
  user: PanelUser
  onSuspend: () => void
  onActivate: () => void
  onDelete: () => void
  onQuota: () => void
  showQuota: boolean
}) {
  const qc = useQueryClient()
  const { data: quota } = useQuery({
    queryKey: ['quota', user.id],
    queryFn: () => getUserQuota(user.id),
    enabled: showQuota,
  })

  const updateQuotaMut = useMutation({
    mutationFn: (q: Partial<UserQuota>) => updateUserQuota(user.id, q),
    onSuccess: () => { toast.success('Quota diperbarui'); qc.invalidateQueries({ queryKey: ['quota', user.id] }) },
  })

  const [editQuota, setEditQuota] = useState<Partial<UserQuota>>({})

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--win-border)] bg-[rgba(15,23,42,0.02)] dark:bg-[rgba(255,255,255,0.03)]">
      <div className="flex items-center gap-3 p-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(99,102,241,0.16),rgba(168,85,247,0.12))] text-sm font-bold text-indigo-600 dark:text-indigo-300">
          {user.username[0]?.toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--win-text)]">{user.username}</span>
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[user.role] ?? 'text-slate-500'}`}>
              {ROLE_ICON[user.role]} {user.role}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[user.status] ?? ''}`}>
              {user.status}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{user.email}</div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onQuota}
            title="Kelola Quota"
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-blue-500/10 hover:text-blue-500"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {user.status === 'active' ? (
            <button
              onClick={onSuspend}
              title="Suspend"
              className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-amber-500/10 hover:text-amber-500"
            >
              <ShieldOff className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={onActivate}
              title="Aktifkan"
              className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-emerald-500/10 hover:text-emerald-500"
            >
              <Shield className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            title="Hapus"
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showQuota && quota && (
        <div className="border-t border-[var(--win-border)] bg-[rgba(15,23,42,0.03)] p-3.5 dark:bg-[rgba(255,255,255,0.03)]">
          <p className="mb-3 text-xs font-medium text-[var(--text-secondary)]">Resource Quota</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'maxProjects', label: 'Max Projects', val: quota.maxProjects },
              { key: 'maxTunnels', label: 'Max Tunnels', val: quota.maxTunnels },
              { key: 'diskQuotaMb', label: 'Disk (MB)', val: quota.diskQuotaMb },
              { key: 'cpuLimitPct', label: 'CPU Limit %', val: quota.cpuLimitPct },
              { key: 'memoryLimitMb', label: 'RAM (MB)', val: quota.memoryLimitMb },
            ].map(({ key, label, val }) => (
              <div key={key}>
                <label className="mb-0.5 block text-[10px] text-[var(--text-secondary)]">{label}</label>
                <input
                  type="number"
                  defaultValue={val}
                  onChange={(e) => setEditQuota((q) => ({ ...q, [key]: Number(e.target.value) }))}
                  className="w-full rounded-md border border-[var(--win-border)] bg-[var(--win-bg)] px-2 py-1 text-xs text-[var(--win-text)] outline-none transition focus:border-indigo-400"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => updateQuotaMut.mutate(editQuota)}
            disabled={updateQuotaMut.isPending}
            className="mt-3 w-full rounded-[12px] bg-indigo-500/12 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/18 dark:text-indigo-300 disabled:opacity-50"
          >
            Simpan Quota
          </button>
        </div>
      )}
    </div>
  )
}
