import { useState, type ReactElement } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listUsers,
  createUser,
  updateUser,
  suspendUser,
  activateUser,
  deleteUser,
  getUserQuota,
  updateUserQuota,
  type PanelUser,
  type UserQuota,
} from '@/api/agent'
import { alertLib } from '@/lib/alert'
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
  Pencil,
  Check,
  X,
} from 'lucide-react'

const ROLE_VARIANTS: Record<string, string> = {
  superadmin: 'panel-badge--warning',
  admin: 'panel-badge--info',
  user: 'panel-badge--neutral',
}

const STATUS_VARIANTS: Record<string, string> = {
  active: 'panel-badge--success',
  suspended: 'panel-badge--danger',
  pending: 'panel-badge--warning',
}

const ROLE_ICON: Record<string, ReactElement> = {
  superadmin: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  user: <CircleUser className="h-3 w-3" />,
}

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'superadmin', label: 'Superadmin' },
]

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
      alertLib.fire('User Dibuat', `User <strong>${u.username}</strong> berhasil dibuat.`, 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setForm({ username: '', email: '', password: '', role: 'user', displayName: '' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal membuat user'
      toast.error('Gagal membuat user', { description: message })
      alertLib.fire('Gagal Membuat User', message, 'error', 'users')
    },
  })

  const suspendMut = useMutation({
    mutationFn: suspendUser,
    onSuccess: () => {
      alertLib.fire('User Disuspend', 'Akses user berhasil dihentikan sementara.', 'warning', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => alertLib.fire('Gagal Suspend User', e.response?.data?.error ?? 'Tidak dapat mensuspend user.', 'error', 'users'),
  })

  const activateMut = useMutation({
    mutationFn: activateUser,
    onSuccess: () => {
      alertLib.fire('User Diaktifkan', 'Akses user berhasil diaktifkan kembali.', 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => alertLib.fire('Gagal Mengaktifkan User', e.response?.data?.error ?? 'Tidak dapat mengaktifkan user.', 'error', 'users'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      alertLib.fire('User Dihapus', 'User berhasil dihapus dari sistem.', 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal menghapus user'
      toast.error('Gagal menghapus user', { description: message })
      alertLib.fire('Gagal Menghapus User', message, 'error', 'users')
    },
  })

  const users = data?.users ?? []

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Users className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">User Management</div>
            <div className="panel-window__meta">{users.length} user terdaftar</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button
            onClick={() => refetch()}
            className="panel-icon-btn"
            aria-label="Refresh users"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="panel-btn panel-btn--primary-soft"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Buat User
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <UserPlus className="panel-window__icon h-4 w-4" />
              Buat User Baru
            </h3>
            <div className="space-y-3">
              {[
                { key: 'username', label: 'Username', type: 'text', placeholder: 'john_doe' },
                { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
                { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'John Doe' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="panel-section-label">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="panel-input"
                  />
                </div>
              ))}
              <div>
                <label className="panel-section-label">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Min. 8 karakter"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="panel-input pr-10"
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
                <label className="panel-section-label">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="panel-select"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { setShowCreate(false); setForm({ username: '', email: '', password: '', role: 'user', displayName: '' }) }}
                className="panel-btn panel-btn--ghost flex-1"
              >
                Batal
              </button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending}
                className="panel-btn panel-btn--primary flex-1"
              >
                {createMut.isPending ? 'Membuat...' : 'Buat User'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">Memuat users...</div>
        ) : users.length === 0 ? (
          <div className="panel-empty">
            <Users className="h-8 w-8" />
            <span>Belum ada user.</span>
          </div>
        ) : (
          <div className="panel-window__stack">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onSuspend={async () => {
                  const confirmed = await alertLib.confirm(
                    'Suspend User?',
                    `User <strong>${u.username}</strong> akan kehilangan akses login sampai diaktifkan kembali.`,
                    'Suspend User',
                    'Batal',
                    'warning',
                    'users',
                  )
                  if (confirmed) suspendMut.mutate(u.id)
                }}
                onActivate={async () => {
                  const confirmed = await alertLib.confirm(
                    'Aktifkan User?',
                    `Akses login untuk <strong>${u.username}</strong> akan dipulihkan kembali.`,
                    'Aktifkan User',
                    'Batal',
                    'question',
                    'users',
                  )
                  if (confirmed) activateMut.mutate(u.id)
                }}
                onDelete={async () => {
                  const confirmed = await alertLib.confirm(
                    'Hapus User?',
                    `User <strong>${u.username}</strong> akan dihapus beserta data terkaitnya. Tindakan ini tidak dapat dibatalkan.`,
                    'Hapus Permanen',
                    'Batal',
                    'warning',
                    'users',
                  )
                  if (confirmed) deleteMut.mutate(u.id)
                }}
                onQuota={() => setShowQuota(showQuota === u.id ? null : u.id)}
                showQuota={showQuota === u.id}
              />
            ))}
          </div>
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
    onSuccess: () => {
      alertLib.fire('Quota Diperbarui', `Resource quota untuk <strong>${user.username}</strong> berhasil diperbarui.`, 'success', 'users')
      qc.invalidateQueries({ queryKey: ['quota', user.id] })
    },
    onError: (e: any) => alertLib.fire('Gagal Memperbarui Quota', e.response?.data?.error ?? 'Quota tidak dapat diperbarui.', 'error', 'users'),
  })

  const changeRoleMut = useMutation({
    mutationFn: (role: string) => updateUser(user.id, { role } as any),
    onSuccess: (updated) => {
      alertLib.fire('Role Diubah', `Role <strong>${user.username}</strong> berhasil diubah menjadi <strong>${updated.role}</strong>.`, 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditingRole(false)
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? 'Gagal mengubah role'
      toast.error('Gagal mengubah role', { description: message })
      alertLib.fire('Gagal Mengubah Role', message, 'error', 'users')
      setEditingRole(false)
    },
  })

  const [editQuota, setEditQuota] = useState<Partial<UserQuota>>({})
  const [editingRole, setEditingRole] = useState(false)
  const [selectedRole, setSelectedRole] = useState(user.role)

  const handleRoleSave = async () => {
    if (selectedRole === user.role) {
      setEditingRole(false)
      return
    }
    const confirmed = await alertLib.confirm(
      'Ubah Role User?',
      `Role <strong>${user.username}</strong> akan diubah dari <strong>${user.role}</strong> menjadi <strong>${selectedRole}</strong>.`,
      'Ya, Ubah Role',
      'Batal',
      'warning',
      'users',
    )
    if (confirmed) {
      changeRoleMut.mutate(selectedRole)
    } else {
      setSelectedRole(user.role)
      setEditingRole(false)
    }
  }

  return (
    <div className="panel-card overflow-visible">
      <div className="flex items-center gap-3 overflow-visible p-3.5">
        <div className="panel-avatar rounded-full text-sm">
          {user.username[0]?.toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--win-text)]">{user.username}</span>

            {/* Role badge / inline role editor */}
            {editingRole ? (
              <div className="flex items-center gap-1 overflow-visible">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="panel-select rounded-full pl-3 pr-8 text-[12px] font-medium"
                  style={{
                    background: 'var(--panel-surface)',
                    color: 'var(--win-text)',
                    borderColor: 'var(--win-border)',
                    appearance: 'auto',
                    WebkitAppearance: 'menulist',
                  }}
                  autoFocus
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleRoleSave}
                  disabled={changeRoleMut.isPending}
                  title="Simpan role"
                  className="panel-icon-btn panel-icon-btn--success h-6 w-6 rounded-md"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  onClick={() => { setEditingRole(false); setSelectedRole(user.role) }}
                  title="Batal"
                  className="panel-icon-btn h-6 w-6 rounded-md"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingRole(true); setSelectedRole(user.role) }}
                className={`panel-badge ${ROLE_VARIANTS[user.role] ?? 'panel-badge--neutral'} cursor-pointer transition-opacity hover:opacity-75`}
                title="Klik untuk ubah role"
              >
                {ROLE_ICON[user.role]} {user.role}
                <Pencil className="h-2.5 w-2.5 opacity-60" />
              </button>
            )}

            <span className={`panel-badge ${STATUS_VARIANTS[user.status] ?? 'panel-badge--neutral'}`}>
              {user.status}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{user.email}</div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onQuota}
            title="Kelola Quota"
            className="panel-icon-btn panel-icon-btn--primary"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {user.status === 'active' ? (
            <button
              onClick={onSuspend}
              title="Suspend"
              className="panel-icon-btn panel-icon-btn--warning"
            >
              <ShieldOff className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={onActivate}
              title="Aktifkan"
              className="panel-icon-btn panel-icon-btn--success"
            >
              <Shield className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            title="Hapus"
            className="panel-icon-btn panel-icon-btn--danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showQuota && quota && (
        <div className="border-t border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-3.5">
          <p className="mb-3 text-xs font-medium text-[var(--text-secondary)]">Resource Quota</p>
          <div className="panel-grid-compact panel-grid-compact--3">
            {[
              { key: 'maxProjects', label: 'Max Projects', val: quota.maxProjects },
              { key: 'maxTunnels', label: 'Max Tunnels', val: quota.maxTunnels },
              { key: 'diskQuotaMb', label: 'Disk (MB)', val: quota.diskQuotaMb },
              { key: 'cpuLimitPct', label: 'CPU Limit %', val: quota.cpuLimitPct },
              { key: 'memoryLimitMb', label: 'RAM (MB)', val: quota.memoryLimitMb },
            ].map(({ key, label, val }) => (
              <div key={key}>
                <label className="panel-section-label mb-1">{label}</label>
                <input
                  type="number"
                  defaultValue={val}
                  onChange={(e) => setEditQuota((q) => ({ ...q, [key]: Number(e.target.value) }))}
                  className="panel-input"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => updateQuotaMut.mutate(editQuota)}
            disabled={updateQuotaMut.isPending}
            className="panel-btn panel-btn--primary-soft mt-3 w-full"
          >
            Simpan Quota
          </button>
        </div>
      )}
    </div>
  )
}
