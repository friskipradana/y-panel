import { useState, useEffect } from 'react'
import { ArrowUpCircle, Moon, Search, Sun } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMeV2, logoutAgent } from '@/api/agent'
import { getUpdateInfo } from '@/api/system'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { useCommandStore } from '@/store/commandStore'
import { ProfileMenu } from './ProfileMenu'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ApplicationsMenu } from './ApplicationsMenu'
import { NotificationsMenu } from './NotificationsMenu'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'

interface TaskbarProps {
  onLogout: () => void
  authenticated: boolean
}

export function Taskbar({ onLogout, authenticated }: TaskbarProps) {
  const { t } = useI18n()
  const { mode, toggleMode } = useThemeStore()
  const isDark = mode === 'dark'
  const queryClient = useQueryClient()
  const { toggleCommandPalette } = useCommandStore()

  const { openWindow } = useWindowStore()
  const [time, setTime] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  const { data: currentUser } = useQuery({
    queryKey: ['me-v2'],
    queryFn: getMeV2,
    enabled: authenticated,
    retry: 1,
  })
  // panel updates belong to the superadmin
  const isSuperadmin = currentUser?.role === 'superadmin'

  const { data: updateInfo } = useQuery({
    queryKey: ['system-update'],
    queryFn: () => getUpdateInfo(false),
    enabled: Boolean(authenticated && isSuperadmin),
    staleTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    const tick = () => setTime(formatDateTimeID(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!authenticated) return
    void queryClient.invalidateQueries({ queryKey: ['me-v2'] })
  }, [authenticated, queryClient])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      runtimeLogger.info('auth', 'logout requested from taskbar')
      await logoutAgent()
    } catch (e) {
      runtimeLogger.warn('auth', 'logout api call failed, continuing local cleanup', { error: e })
    } finally {
      onLogout()
      setLoggingOut(false)
    }
  }

  return (
    <div className={`taskbar ${!isDark ? 'taskbar--light' : ''}`}>
      <div className="taskbar-left flex items-center">
        <ApplicationsMenu role={currentUser?.role} />
      </div>

      <div className="taskbar-actions">
        <span id="taskbar-clock" className={`taskbar-clock ${!isDark ? 'text-[var(--text-secondary)]' : ''}`}>{time}</span>

        <button
          id="taskbar-search-button"
          title={t('taskbar.commandPaletteTitle')} aria-label={t('taskbar.commandPaletteTitle')}
          className="taskbar-icon-btn text-[var(--panel-primary-text)] hover:text-cyan-400"
          onClick={() => toggleCommandPalette()}
        >
          <Search size={14} />
        </button>

        <NotificationsMenu authenticated={authenticated} />

        {isSuperadmin && updateInfo?.available && (
          <button
            id="taskbar-update-available"
            title={t('taskbar.updateAvailable', { version: updateInfo.latest })} aria-label={t('taskbar.updateAvailable', { version: updateInfo.latest })}
            className="taskbar-icon-btn text-amber-500 hover:text-amber-400 relative"
            onClick={() => openWindow('settings')}
          >
            <ArrowUpCircle size={14} className="animate-pulse" />
          </button>
        )}

        <button
          id="taskbar-theme-toggle"
          title={isDark ? t('profile.switchLight') || 'Switch to Light Mode' : t('profile.switchDark') || 'Switch to Dark Mode'}
          className="taskbar-icon-btn"
          onClick={toggleMode}
        >
          {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-400" />}
        </button>

        <LanguageSwitcher />

        <ProfileMenu
          username={currentUser?.displayName || currentUser?.username}
          onLogout={handleLogout}
          loading={loggingOut}
        />
      </div>
    </div>
  )
}
