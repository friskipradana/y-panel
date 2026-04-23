import { useState, useEffect, useMemo, useRef } from 'react'
import { Bell, CheckCheck, Cpu, FileText, Monitor, RotateCcw, ScrollText, Thermometer, Zap, Activity, Settings, Database } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMeV2, listNotifications, logoutAgent, markAllNotificationsRead, markNotificationRead, type PanelNotification } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { ProfileMenu } from './ProfileMenu'
import type { WindowKind } from '@/types'

interface TaskbarProps {
  onLogout: () => void
  authenticated: boolean
}

function formatDateTime(value: Date) {
  const day = String(value.getDate()).padStart(2, '0')
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const year = value.getFullYear()
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

const QUICK_LAUNCH: { label: string; kind: WindowKind }[] = [
  { label: 'Apps', kind: 'apps' },
  { label: 'Projects', kind: 'projects' },
  { label: 'Tunnels', kind: 'tunnels' },
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
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: listNotifications,
    enabled: authenticated,
    retry: 1,
    refetchInterval: 15_000,
  })
  const unreadCount = notifications.filter((item) => !item.isRead).length
  const latestNotifications = useMemo(() => notifications.slice(0, 8), [notifications])
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  useEffect(() => {
    const tick = () => setTime(formatDateTime(new Date()))
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
            className="taskbar-nav-btn"
            onClick={() => openWindow(item.kind)}
          >
            {item.label}
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
              className="flex items-center gap-3.5 mr-3 px-2 py-1 transition-all"
            >
              {systemStatsConfig.cpu && (
                <div className="flex items-center gap-1.5" title="CPU Usage">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-sky-400' : 'bg-sky-600'}`} />
                  <span className={`text-[11px] font-mono font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-700'}`}>
                    {stats.cpu.toFixed(0)}%
                  </span>
                </div>
              )}
              {systemStatsConfig.ram && (
                <div className="flex items-center gap-1.5 pl-2" title="RAM Usage">
                  <Zap size={11} className={isDark ? 'text-amber-400/80' : 'text-amber-600'} />
                  <span className={`text-[11px] font-mono font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-700'}`}>
                    {stats.ram.toFixed(0)}%
                  </span>
                </div>
              )}
              {systemStatsConfig.temp && (
                <div className="flex items-center gap-1.5 pl-2" title="CPU Temperature">
                  <Thermometer size={11} className={isDark ? 'text-rose-400/80' : 'text-rose-600'} />
                  <span className={`text-[11px] font-mono font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-700'}`}>
                    {stats.temp > 0 ? `${stats.temp.toFixed(0)}°` : 'N/A'}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <span id="taskbar-clock" className={`taskbar-clock ${!isDark ? 'text-slate-700' : ''}`}>{time}</span>

        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            ref={menuRef}
            className={`absolute right-4 top-[50px] w-60 p-2 rounded-2xl backdrop-blur-2xl z-[999999] ${isDark
              ? 'bg-slate-900/90 text-white'
              : 'bg-white/95 text-slate-800'
              }`}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'
              }`}>
              Taskbar Settings
            </div>
            <button
              className={`flex items-center justify-between w-full px-3 py-2 text-[12.5px] font-semibold rounded-lg transition-all group ${isDark
                ? 'hover:bg-white/5'
                : 'hover:bg-black/5'
                }`}
              onClick={() => { setShowSystemStats(!showSystemStats); setShowMenu(false); }}
            >
              <div className="flex items-center gap-2.5">
                <Activity size={14} className="text-sky-500" />
                <span>System Stats Tray</span>
              </div>
              <div className={`w-8 h-4 rounded-full transition-all duration-300 relative ${showSystemStats ? 'bg-sky-500' : 'bg-slate-400/30'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-300 ${showSystemStats ? 'left-4.5' : 'left-0.5'}`} />
              </div>
            </button>

            <div className="mt-1 pt-1">
              <div className={`px-3 pb-1 text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Metrics</div>
              <div className="space-y-0.5">
                {[
                  { key: 'cpu' as const, label: 'CPU Load', icon: <Cpu size={14} />, color: isDark ? 'text-sky-400' : 'text-sky-600' },
                  { key: 'ram' as const, label: 'RAM Usage', icon: <Zap size={14} />, color: isDark ? 'text-amber-400' : 'text-amber-600' },
                  { key: 'temp' as const, label: 'CPU Temp', icon: <Thermometer size={14} />, color: isDark ? 'text-rose-400' : 'text-rose-600' },
                ].map(item => (
                  <button
                    key={item.key}
                    disabled={!showSystemStats}
                    className={`flex items-center justify-between w-full px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${!showSystemStats
                      ? 'opacity-50 grayscale cursor-not-allowed'
                      : isDark
                        ? 'hover:bg-white/5 text-slate-400 hover:text-white'
                        : 'hover:bg-black/5 text-slate-500 hover:text-slate-900'
                      }`}
                    onClick={() => toggleConfig(item.key)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`${item.color}`}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {systemStatsConfig[item.key] && (
                      <div className={`w-1 h-1 rounded-full ${isDark ? 'bg-sky-400' : 'bg-sky-600'}`} />
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
                    <div className="taskbar-notifications__title">Notifications</div>
                    <div className="taskbar-notifications__subtitle">
                      Aktivitas terbaru akun panel Anda
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
                Tandai semua
              </button>
            </div>

            <div className="taskbar-notifications__meta">
              <span className={`panel-badge ${unreadCount ? 'panel-badge--primary' : 'panel-badge--neutral'}`}>
                <span className="panel-status-dot" />
                {unreadCount} belum dibaca
              </span>
              <span className="taskbar-notifications__count">
                {notifications.length} total notifikasi
              </span>
            </div>

            <div className="taskbar-notifications__list">
              {latestNotifications.length === 0 ? (
                <div className="panel-empty taskbar-notifications__empty">
                  <Bell size={18} />
                  <span>Belum ada notifikasi baru untuk akun ini.</span>
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
                      <span>{item.isRead ? 'Sudah dibaca' : 'Klik untuk tandai dibaca'}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}

        <button
          id="taskbar-notifications-button"
          title="Notifications"
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

        <button id="taskbar-monitor" title="System Info" className="taskbar-icon-btn" onClick={() => openWindow('system')}>
          <Monitor size={14} />
        </button>

        <button id="taskbar-settings" title="System Settings" className="taskbar-icon-btn" onClick={() => openWindow('settings')}>
          <Settings size={14} />
        </button>

        <button id="taskbar-database" title="Database" className="taskbar-icon-btn" onClick={() => openWindow('database')}>
          <Database size={14} />
        </button>

        <button id="taskbar-system-log" title="System Logs" className="taskbar-icon-btn" onClick={() => openWindow('system-logs')}>
          <ScrollText size={14} />
        </button>

        <button id="taskbar-runtime-log" title="Changelog" className="taskbar-icon-btn" onClick={() => openWindow('changelog')}>
          <FileText size={14} />
        </button>

        <button id="taskbar-reset-windows" title="Reset windows" className="taskbar-icon-btn" onClick={resetWindows}>
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
