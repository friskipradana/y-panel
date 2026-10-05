import { useQuery } from '@tanstack/react-query'
import {
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Mail,
  Server,
  Shield,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import { getMeV2 } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'

export default function ProfileWindow() {
  const openWindow = useWindowStore((s) => s.openWindow)
  const { data: me } = useQuery({
    queryKey: ['me-v2'],
    queryFn: getMeV2,
    retry: 1,
  })

  const displayName = me?.displayName || me?.username || 'Admin'
  const displayRole = me?.role || 'superadmin'
  const clientHost = typeof window !== 'undefined' ? (window.location.hostname || '127.0.0.1') : '127.0.0.1'

  return (
    <div className="panel-window flex flex-col h-full overflow-hidden">
      <div className="panel-window__body flex-1 overflow-y-auto p-5">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
          {/* ── User Overview Hero Card ── */}
          <div className="panel-shell-card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="profile-avatar h-20 w-20 text-3xl font-bold rounded-2xl shadow-md">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className="text-xl font-bold text-[var(--win-text)]">{displayName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-bg)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--panel-primary-text)]">
                  <Shield size={12} />
                  {displayRole}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-success-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--panel-success-text)]">
                  <CheckCircle2 size={12} />
                  Active
                </span>
              </div>

              <div className="mt-2 flex flex-col sm:flex-row flex-wrap items-center gap-3 text-[12.5px] text-[var(--text-secondary)]">
                {me?.username && (
                  <span className="flex items-center gap-1 font-mono">
                    <User size={13} className="opacity-70" />
                    @{me.username}
                  </span>
                )}
                {me?.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={13} className="opacity-70" />
                    {me.email}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-center sm:justify-start gap-2 text-[12px] text-[var(--text-secondary)] font-mono">
                <Server size={13} className="text-[var(--panel-primary-text)]" />
                <span>Active Session Host:</span>
                <span className="font-bold text-[var(--win-text)]">{clientHost}</span>
              </div>
            </div>
          </div>

          {/* ── Account Details Card ── */}
          <div className="panel-shell-card p-5 space-y-3.5">
            <div className="text-[13px] font-bold text-[var(--win-text)] flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--panel-primary-text)]" />
              Account Metadata & Security
            </div>

            <div className="space-y-2.5 text-[12.5px]">
              <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
                <span className="text-[var(--text-secondary)] flex items-center gap-2">
                  <Calendar size={14} className="opacity-70" />
                  Member Since
                </span>
                <span className="font-medium text-[var(--win-text)]">
                  {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('id-ID', { dateStyle: 'long' }) : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
                <span className="text-[var(--text-secondary)] flex items-center gap-2">
                  <Clock size={14} className="opacity-70" />
                  Last Login Session
                </span>
                <span className="font-medium text-[var(--win-text)]">
                  {me?.lastLoginAt ? new Date(me.lastLoginAt).toLocaleString('id-ID') : 'Current Session'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Shortcuts / Quick Management ── */}
          <div className="panel-shell-card p-5 space-y-3">
            <div className="text-[13px] font-bold text-[var(--win-text)]">Quick Actions</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openWindow('settings')}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)] transition-all text-left cursor-pointer group"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]">
                  <KeyRound size={16} />
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold text-[var(--win-text)] group-hover:text-[var(--panel-primary-text)]">Security & Passwords</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Kelola password root & database</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openWindow('users')}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)] transition-all text-left cursor-pointer group"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Users size={16} />
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold text-[var(--win-text)] group-hover:text-emerald-500">Manage Users</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Kelola pengguna & hak akses</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
