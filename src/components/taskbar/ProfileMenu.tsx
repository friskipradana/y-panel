import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Lock,
  LogOut,
  Settings,
  User,
  Users,
} from 'lucide-react'
import { getMeV2 } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'
import { useI18n } from '@/lib/i18n'

import { useThemeStore } from '@/store/themeStore'

interface ProfileMenuProps {
  username?: string
  onLogout: () => void
  loading?: boolean
}

export function ProfileMenu({ username, onLogout, loading }: ProfileMenuProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const openWindow = useWindowStore((s) => s.openWindow)
  const setIsLocked = useThemeStore((s) => s.setIsLocked)
  const { data: me } = useQuery({ queryKey: ['me-v2'], queryFn: getMeV2, retry: 1 })

  const handleDocMouseDown = (e: MouseEvent) => {
    const target = e.target as Node
    if (btnRef.current?.contains(target)) return
    if (menuRef.current?.contains(target)) return
    setOpen(false)
    window.removeEventListener('mousedown', handleDocMouseDown, true)
  }

  const openMenu = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    window.addEventListener('mousedown', handleDocMouseDown, true)
  }

  const displayName = me?.displayName || me?.username || username || t('profile.defaultName') || 'Riky'
  const displayRole = me?.role || 'superadmin'
  const isSuperadmin = displayRole === 'superadmin'
  const clientHost = typeof window !== 'undefined' ? (window.location.hostname || '127.0.0.1') : '127.0.0.1'

  const handleLockScreen = () => {
    setOpen(false)
    setIsLocked(true)
  }

  const dropdown = (
    <AnimatePresence>
      {open && (
        <div className="profile-menu-drawer">
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="profile-menu w-[300px]"
          >
          {/* ── Header: [R] Display Name | superadmin • Active (127.0.0.1) ── */}
          <div className="profile-menu-section flex items-start gap-3">
            <div className="profile-avatar h-9 w-9 rounded-xl flex items-center justify-center text-[15px] font-bold shrink-0 mt-0.5">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="profile-name truncate text-[14px] font-bold text-[var(--win-text)]">{displayName}</div>
              <div className="profile-role flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                <span className="font-semibold capitalize text-[var(--panel-primary-text)]">{displayRole}</span>
                <span>•</span>
                <span className="text-emerald-500 font-semibold">Active</span>
              </div>
              <div className="opacity-75 font-mono text-[11px] text-[var(--text-secondary)] truncate mt-0.5" title={clientHost}>
                ({clientHost})
              </div>
            </div>
          </div>

          {/* ── Section 1: Account Profile & Manage Users ── */}
          <div className="profile-menu-section space-y-1">
            <button
              type="button"
              className="profile-menu-btn"
              onClick={() => {
                setOpen(false)
                openWindow('profile')
              }}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--panel-primary-text)] opacity-90">
                <User size={15} />
              </span>
              <span className="flex-1 font-medium">{t('profile.accountProfile')}</span>
            </button>

            <button
              type="button"
              className="profile-menu-btn"
              onClick={() => {
                setOpen(false)
                openWindow('users')
              }}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--panel-primary-text)] opacity-90">
                <Users size={15} />
              </span>
              <span className="flex-1 font-medium">{t('profile.manageUsers')}</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-[var(--panel-surface-hover)] border border-[var(--win-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                {isSuperadmin ? 'Superadmin' : 'Admin'}
              </span>
            </button>
          </div>

          {/* ── Section 2: Settings & Preferences, Activity Logs ── */}
          <div className="profile-menu-section space-y-1">
            <button
              type="button"
              className="profile-menu-btn"
              onClick={() => {
                setOpen(false)
                openWindow('settings')
              }}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">
                <Settings size={15} />
              </span>
              <span className="flex-1 font-medium">{t('profile.settingsPreferences')}</span>
            </button>

            <button
              type="button"
              className="profile-menu-btn"
              onClick={() => {
                setOpen(false)
                openWindow('system-logs')
              }}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">
                <FileText size={15} />
              </span>
              <span className="flex-1 font-medium">{t('profile.activityLogs')}</span>
            </button>
          </div>

          {/* ── Section 3: Lock Screen & Logout ── */}
          <div className="profile-menu-section space-y-1">
            <button
              type="button"
              className="profile-menu-btn"
              onClick={handleLockScreen}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">
                <Lock size={15} />
              </span>
              <span className="flex-1 font-medium">{t('profile.lockScreen')}</span>
            </button>

            <button
              type="button"
              className="profile-menu-btn profile-menu-btn-danger"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                <LogOut size={15} />
              </span>
              <span className="flex-1 font-medium">{t('profile.logout')}</span>
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>)

  return (
    <>
      <button
        ref={btnRef}
        id="taskbar-profile"
        className="profile-btn"
        onClick={openMenu}
        disabled={loading}
      >
        <User size={13} />
        <span>{displayName}</span>
      </button>

      {createPortal(dropdown, document.body)}
    </>
  )
}
