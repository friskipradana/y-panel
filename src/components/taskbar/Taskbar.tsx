import { useState, useEffect, useMemo, useRef } from 'react'
import { Bell, CheckCheck, Cpu, FileText, Monitor, RotateCcw, ScrollText, Thermometer, Zap, Activity, Settings, Database } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMeV2, listNotifications, logoutAgent, markAllNotificationsRead, markNotificationRead, resolveNotificationsSocketUrl, type NotificationSocketPayload, type PanelNotification } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { ProfileMenu } from './ProfileMenu'
import type { WindowKind } from '@/types'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n, windowTitleKey, type Language } from '@/lib/i18n'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'

interface TaskbarProps {
  onLogout: () => void
  authenticated: boolean
}


const QUICK_LAUNCH: { label: string; kind: WindowKind; params?: Record<string, any>; accent?: boolean }[] = [
  { label: 'Dockers', kind: 'apps' },
  { label: 'Projects', kind: 'projects' },
  { label: 'Cloudflare', kind: 'tunnels' },
  // { label: 'Buat Tunnel', kind: 'tunnels', params: { tab: 'tunnels', action: 'createTunnel' }, accent: true },
  { label: 'Users', kind: 'users' },
  { label: 'Terminal', kind: 'host-terminal' },
  { label: 'Files', kind: 'file-manager' },
  { label: 'Docs', kind: 'docs' },
]

const NON_ADMIN_HIDDEN_KINDS = new Set<WindowKind>(['host-terminal', 'users'])

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
  const { language, setLanguage, t } = useI18n()
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark'
  const queryClient = useQueryClient()

  const { openWindow, resetWindows, showSystemStats, systemStatsConfig, setShowSystemStats, setSystemStatsConfig } = useWindowStore()
  const [time, setTime] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [stats, setStats] = useState<{ cpu: number, ram: number, temp: number }>({ cpu: 0, ram: 0, temp: 0 })
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationPanelRef = useRef<HTMLDivElement>(null)
  const { data: currentUser } = useQuery({
    queryKey: ['me-v2'],
    queryFn: getMeV2,
    enabled: authenticated,
    retry: 1,
  })
  const [notifications, setNotifications] = useState<PanelNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const latestNotifications = useMemo(() => notifications.slice(0, 8), [notifications])
  const languageOptions = useMemo(
    () => [
      { value: 'id', label: 'ID', description: t('language.indonesian') },
      { value: 'en', label: 'EN', description: t('language.english') },
    ],
    [t],
  )
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

  // ── WebSocket for System Stats ─────────────────────────────────────────────
  useEffect(() => {
    if (!showSystemStats) return

    let socket: WebSocket | null = null
    let retryTimer: number

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
      const url = `${protocol}//${window.location.host}${apiBase}/system/stats/ws`

      socket = new WebSocket(url)

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('[Stats WS] Received:', data)

          const cpu = data.cpuUsagePercent || 0
          const mem = data.memory || { used: 0, total: 1 }
          // Pastikan total tidak nol untuk menghindari pembagian nol
          const totalMem = mem.total || 1
          const ram = (mem.used / totalMem) * 100
          const temp = data.cpuTemp || 0

          setStats({
            cpu,
            ram: isNaN(ram) ? 0 : ram,
            temp
          })
        } catch (e) {
          console.error('[Stats WS] Parse Error:', e)
        }
      }

      socket.onclose = () => {
        retryTimer = window.setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      if (socket) socket.close()
      clearTimeout(retryTimer)
    }
  }, [showSystemStats])

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

      if (menuRef.current && !menuRef.current.contains(target)) {
        setShowMenu(false)
      }

      const clickedNotificationButton = Boolean(targetElement?.closest('#taskbar-notifications-button'))
      const clickedInsideNotifications = Boolean(notificationPanelRef.current?.contains(target))

      if (!clickedNotificationButton && !clickedInsideNotifications) {
        setShowNotifications(false)
      }
    }

    if (showMenu || showNotifications) window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [showMenu, showNotifications])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowMenu(true)
  }

  const toggleConfig = (key: keyof typeof systemStatsConfig) => {
    setSystemStatsConfig({ ...systemStatsConfig, [key]: !systemStatsConfig[key] })
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      runtimeLogger.info('auth', 'logout requested from taskbar')
      await logoutAgent()
    } finally {
      onLogout()
      setLoggingOut(false)
    }
  }

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin'
  const quickLaunchItems = isAdmin
    ? QUICK_LAUNCH
    : QUICK_LAUNCH.filter((item) => !NON_ADMIN_HIDDEN_KINDS.has(item.kind))

  return (
    <div className={`taskbar ${!isDark ? 'taskbar--light' : ''}`}>
      <nav className="taskbar-nav">
        {quickLaunchItems.map((item) => (
          <button
            key={item.kind}
            id={`taskbar-open-${item.kind}`}
            className={`taskbar-nav-btn ${item.accent ? 'taskbar-nav-btn--accent' : ''}`}
            onClick={() => openWindow(item.kind, item.params ? { ...item.params, shortcutNonce: Date.now() } : undefined)}
          >
            {t(windowTitleKey(item.kind))}
          </button>
        ))}
      </nav>

      <div className="taskbar-actions" onContextMenu={handleContextMenu}>
        <AnimatePresence>
          {showSystemStats && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: 10 }}
              className="flex items-center gap-3.5 mr-3 px-3 py-2 transition-all"
            >
              {systemStatsConfig.cpu && (
                <div className="flex items-center gap-1.5" title={t('taskbar.cpuUsage')}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-[var(--panel-primary-text)]' : 'bg-[var(--panel-primary-solid)]'}`} />
                  <span className={`text-[12px] font-mono font-bold tracking-tight ${isDark ? 'text-[var(--win-text)]' : 'text-[var(--text-secondary)]'}`}>
                    {stats.cpu.toFixed(0)}%
                  </span>
                </div>
              )}
              {systemStatsConfig.ram && (
                <div className="flex items-center gap-1.5 pl-2" title={t('taskbar.ramUsage')}>
                  <Zap size={11} className={isDark ? 'text-[var(--panel-warning-text)]/80' : 'text-[var(--panel-warning-text)]'} />
                  <span className={`text-[12px] font-mono font-bold tracking-tight ${isDark ? 'text-[var(--win-text)]' : 'text-[var(--text-secondary)]'}`}>
                    {stats.ram.toFixed(0)}%
                  </span>
                </div>
              )}
              {systemStatsConfig.temp && (
                <div className="flex items-center gap-1.5 pl-2" title={t('taskbar.cpuTemperature')}>
                  <Thermometer size={11} className={isDark ? 'text-[var(--panel-danger-text)]/80' : 'text-[var(--panel-danger-text)]'} />
                  <span className={`text-[12px] font-mono font-bold tracking-tight ${isDark ? 'text-[var(--win-text)]' : 'text-[var(--text-secondary)]'}`}>
                    {stats.temp > 0 ? `${stats.temp.toFixed(0)}°` : 'N/A'}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <PanelSelectMenu
          id="taskbar-language-select"
          value={language}
          onChange={(value) => setLanguage(value as Language)}
          options={languageOptions}
          placeholder={t('language.label')}
          className="taskbar-language-select"
          buttonClassName="taskbar-language-select__button"
          dropdownClassName="taskbar-language-select__dropdown"
          searchable={false}
        />

        <span id="taskbar-clock" className={`taskbar-clock ${!isDark ? 'text-[var(--text-secondary)]' : ''}`}>{time}</span>

        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            ref={menuRef}
            className={`absolute right-4 top-[50px] w-60 p-2 rounded-2xl backdrop-blur-2xl z-[999999] ${isDark
              ? 'bg-slate-900/90 text-[var(--win-text)]'
              : 'bg-[var(--menu-bg)] text-[var(--text-secondary)]'
              }`}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className={`px-3 py-2 text-[12px] font-bold uppercase tracking-[0.2em] mb-1 ${isDark ? 'text-[var(--text-secondary)]' : 'text-[var(--text-secondary)]'
              }`}>
              {t('taskbar.settings')}
            </div>
            <button
              className={`flex items-center justify-between w-full px-3 py-2 text-[12.5px] font-semibold rounded-lg transition-all group ${isDark
                ? 'hover:bg-white/5'
                : 'hover:bg-[var(--panel-surface-hover)]'
                }`}
              onClick={() => { setShowSystemStats(!showSystemStats); setShowMenu(false); }}
            >
              <div className="flex items-center gap-2.5">
                <Activity size={14} className="text-[var(--panel-primary-text)]" />
                <span>{t('taskbar.systemStatsTray')}</span>
              </div>
              <div className={`w-8 h-4 rounded-full transition-all duration-300 relative ${showSystemStats ? 'bg-sky-500' : 'bg-[var(--panel-neutral-bg)]'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-[var(--win-content-bg)] rounded-full shadow-sm transition-all duration-300 ${showSystemStats ? 'left-4.5' : 'left-0.5'}`} />
              </div>
            </button>

            <div className="mt-1 pt-1">
              <div className={`px-3 pb-1 text-[12px] font-bold uppercase tracking-wider ${isDark ? 'text-[var(--text-secondary)]' : 'text-[var(--text-secondary)]'}`}>{t('taskbar.metrics')}</div>
              <div className="space-y-0.5">
                {[
                  { key: 'cpu' as const, label: t('taskbar.cpuLoad'), icon: <Cpu size={14} />, color: isDark ? 'text-[var(--panel-primary-text)]' : 'text-[var(--panel-primary-text)]' },
                  { key: 'ram' as const, label: t('taskbar.ramUsage'), icon: <Zap size={14} />, color: isDark ? 'text-[var(--panel-warning-text)]' : 'text-[var(--panel-warning-text)]' },
                  { key: 'temp' as const, label: t('taskbar.cpuTemp'), icon: <Thermometer size={14} />, color: isDark ? 'text-[var(--panel-danger-text)]' : 'text-[var(--panel-danger-text)]' },
                ].map(item => (
                  <button
                    key={item.key}
                    disabled={!showSystemStats}
                    className={`flex items-center justify-between w-full px-3 py-2 text-[12px] font-medium rounded-lg transition-all ${!showSystemStats
                      ? 'opacity-50 grayscale cursor-not-allowed'
                      : isDark
                        ? 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                        : 'hover:bg-[var(--panel-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                      }`}
                    onClick={() => toggleConfig(item.key)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`${item.color}`}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {systemStatsConfig[item.key] && (
                      <div className={`w-1 h-1 rounded-full ${isDark ? 'bg-[var(--panel-primary-text)]' : 'bg-[var(--panel-primary-solid)]'}`} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

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
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={!unreadCount || markAllMutation.isPending}
                className="panel-btn panel-btn--ghost taskbar-notifications__mark-all"
              >
                <CheckCheck size={12} />
                {t('taskbar.markAll')}
              </button>
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
          id="taskbar-notifications-button"
          title={t('taskbar.notifications')}
          className="taskbar-icon-btn taskbar-icon-btn--notification"
          onClick={() => {
            setShowNotifications((current) => !current)
            setShowMenu(false)
          }}
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span className="taskbar-notifications-badge">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button id="taskbar-monitor" title={t('window.system')} className="taskbar-icon-btn" onClick={() => openWindow('system')}>
          <Monitor size={14} />
        </button>

        <button id="taskbar-settings" title={t('window.settings')} className="taskbar-icon-btn" onClick={() => openWindow('settings')}>
          <Settings size={14} />
        </button>

        <button id="taskbar-database" title={t('window.database')} className="taskbar-icon-btn" onClick={() => openWindow('database')}>
          <Database size={14} />
        </button>

        <button id="taskbar-system-log" title={t('window.system-logs')} className="taskbar-icon-btn" onClick={() => openWindow('system-logs')}>
          <ScrollText size={14} />
        </button>

        <button id="taskbar-runtime-log" title={t('window.changelog')} className="taskbar-icon-btn" onClick={() => openWindow('changelog')}>
          <FileText size={14} />
        </button>

        <button id="taskbar-reset-windows" title={t('taskbar.resetWindows')} className="taskbar-icon-btn" onClick={resetWindows}>
          <RotateCcw size={12} />
        </button>

        <ProfileMenu
          username={currentUser?.displayName || currentUser?.username}
          onLogout={handleLogout}
          loading={loggingOut}
        />
      </div>
    </div>
  )
}




