import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowUpCircle, Bell, CheckCheck, Monitor, Moon, RotateCcw, ScrollText, Search, Sun, Database } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMeV2, listNotifications, logoutAgent, markAllNotificationsRead, markNotificationRead, resolveNotificationsSocketUrl, type NotificationSocketPayload, type PanelNotification } from '@/api/agent'
import { getUpdateInfo } from '@/api/system'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { useCommandStore } from '@/store/commandStore'
import { ProfileMenu } from './ProfileMenu'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ApplicationsMenu } from './ApplicationsMenu'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { soundManager } from '@/lib/sound'
import { Button } from '@/components/ui/Button'

interface TaskbarProps {
  onLogout: () => void
  authenticated: boolean
}




function getNotificationTone(type: PanelNotification['type']) {
  switch (type) {
    case 'success':
      return 'panel-badge--success'
    case 'warning':
      return 'panel-badge--warning'
    case 'error':
      return 'panel-badge--danger'
    default:
      return 'panel-badge--info'
  }
}

export function Taskbar({ onLogout, authenticated }: TaskbarProps) {
  const { t } = useI18n()
  const { mode, toggleMode } = useThemeStore()
  const isDark = mode === 'dark'
  const queryClient = useQueryClient()
  const { toggleCommandPalette } = useCommandStore()

  const { openWindow, resetWindows } = useWindowStore()
  const [time, setTime] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationPanelRef = useRef<HTMLDivElement>(null)
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

  const [notifications, setNotifications] = useState<PanelNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const latestNotifications = useMemo(() => notifications.slice(0, 8), [notifications])

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (_, id) => {
      setNotifications((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)))
      setUnreadCount((current) => Math.max(0, current - 1))
    },
  })
  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
    },
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

  useEffect(() => {
    if (!authenticated) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    let socket: WebSocket | null = null
    let retryTimer: number | undefined
    let disposed = false

    const applySocketPayload = (payload: NotificationSocketPayload) => {
      setUnreadCount(payload.unreadCount ?? 0)

      if (payload.type === 'created' && payload.notification) {
        const incomingNotification = payload.notification
        soundManager.playNotification()
        setNotifications((current) => {
          const deduped = current.filter((item) => item.id !== incomingNotification.id)
          return [incomingNotification, ...deduped].slice(0, 30)
        })
        return
      }

      if (payload.type === 'read') {
        setNotifications((current) => {
          if (!current.length) return current
          const nextUnread = payload.unreadCount ?? 0
          const unreadIds = current.filter((item) => !item.isRead).map((item) => item.id)
          const idsToMark = new Set(unreadIds.slice(0, Math.max(0, unreadIds.length - nextUnread)))
          return current.map((item) => (idsToMark.has(item.id) ? { ...item, isRead: true } : item))
        })
        return
      }

      if (payload.type === 'read_all') {
        setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
      }
    }

    const connect = () => {
      socket = new WebSocket(resolveNotificationsSocketUrl())

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as NotificationSocketPayload
          applySocketPayload(payload)
        } catch (error) {
          console.error('[Notifications WS] Parse Error:', error)
        }
      }

      socket.onclose = () => {
        if (disposed) return
        retryTimer = window.setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      socket?.close()
    }
  }, [authenticated])

  useEffect(() => {
    if (!authenticated || !showNotifications) return

    let cancelled = false
    listNotifications()
      .then((items) => {
        if (cancelled) return
        setNotifications(items)
        setUnreadCount(items.filter((item) => !item.isRead).length)
      })
      .catch((error) => {
        if (cancelled) return
        runtimeLogger.error('notifications', 'failed to load notification list', {
          message: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [authenticated, showNotifications])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const targetElement = target instanceof HTMLElement ? target : null

      const clickedNotificationButton = Boolean(targetElement?.closest('#taskbar-notifications-button'))
      const clickedInsideNotifications = Boolean(notificationPanelRef.current?.contains(target))

      if (!clickedNotificationButton && !clickedInsideNotifications) {
        setShowNotifications(false)
      }
    }

    if (showNotifications) window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [showNotifications])

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

        {showNotifications && (
          <motion.div
            id="taskbar-notifications-panel"
            ref={notificationPanelRef}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="taskbar-notifications"
          >
            <div className="taskbar-notifications__header">
              <div>
                <div className="taskbar-notifications__title-row">
                  <div className="taskbar-notifications__title-icon">
                    <Bell size={14} />
                  </div>
                  <div>
                    <div className="taskbar-notifications__title">{t('taskbar.notifications')}</div>
                    <div className="taskbar-notifications__subtitle">
                      {t('taskbar.notificationsSubtitle')}
                    </div>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={!unreadCount || markAllMutation.isPending} variant="ghost" className="taskbar-notifications__mark-all"
              >
                <CheckCheck size={12} />
                {t('taskbar.markAll')}
              </Button>
            </div>

            <div className="taskbar-notifications__meta">
              <span className={`panel-badge ${unreadCount ? 'panel-badge--primary' : 'panel-badge--neutral'}`}>
                <span className="panel-status-dot" />
                {t('taskbar.unreadCount', { count: unreadCount })}
              </span>
              <span className="taskbar-notifications__count">
                {t('taskbar.totalNotifications', { count: notifications.length })}
              </span>
            </div>

            <div className="taskbar-notifications__list">
              {latestNotifications.length === 0 ? (
                <div className="panel-empty taskbar-notifications__empty">
                  <Bell size={18} />
                  <span>{t('taskbar.noNotifications')}</span>
                </div>
              ) : (
                latestNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!item.isRead) markReadMutation.mutate(item.id)
                    }}
                    className={`taskbar-notification-card ${item.isRead ? 'taskbar-notification-card--read' : 'taskbar-notification-card--unread'}`}
                  >
                    <div className="taskbar-notification-card__header">
                      <div className="taskbar-notification-card__title-wrap">
                        <span className={`panel-badge ${getNotificationTone(item.type)}`}>
                          <span className="panel-status-dot" />
                          {item.type}
                        </span>
                        <span className="taskbar-notification-card__title">{item.title}</span>
                      </div>
                      {!item.isRead ? <span className="taskbar-notification-card__unread-dot" /> : null}
                    </div>
                    <div className="taskbar-notification-card__body">{item.body}</div>
                    <div className="taskbar-notification-card__footer">
                      <span>{new Date(item.createdAt).toLocaleString('id-ID')}</span>
                      <span>{item.isRead ? t('taskbar.read') : t('taskbar.clickToRead')}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}

        <button
          id="taskbar-search-button"
          title={t('taskbar.commandPaletteTitle')}
          className="taskbar-icon-btn text-[var(--panel-primary-text)] hover:text-cyan-400"
          onClick={() => {
            toggleCommandPalette()
            setShowNotifications(false)
          }}
        >
          <Search size={14} />
        </button>

        <button
          id="taskbar-notifications-button"
          title={t('taskbar.notifications')}
          className="taskbar-icon-btn taskbar-icon-btn--notification"
          onClick={() => {
            setShowNotifications((current) => !current)
          }}
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span className="taskbar-notifications-badge">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {isSuperadmin && updateInfo?.available && (
          <button
            id="taskbar-update-available"
            title={t('taskbar.updateAvailable', { version: updateInfo.latest })}
            className="taskbar-icon-btn text-amber-500 hover:text-amber-400 relative"
            onClick={() => openWindow('settings')}
          >
            <ArrowUpCircle size={14} className="animate-pulse" />
          </button>
        )}

        <button id="taskbar-monitor" title={t('window.system')} className="taskbar-icon-btn" onClick={() => openWindow('system')}>
          <Monitor size={14} />
        </button>

        <button id="taskbar-database" title={t('window.database')} className="taskbar-icon-btn" onClick={() => openWindow('database')}>
          <Database size={14} />
        </button>

        <button id="taskbar-system-log" title={t('window.system-logs')} className="taskbar-icon-btn" onClick={() => openWindow('system-logs')}>
          <ScrollText size={14} />
        </button>

        <button id="taskbar-reset-windows" title={t('taskbar.resetWindows')} className="taskbar-icon-btn" onClick={resetWindows}>
          <RotateCcw size={12} />
        </button>

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




