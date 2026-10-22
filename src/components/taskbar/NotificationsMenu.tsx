import { useState, useEffect, useMemo, useRef } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  Settings,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveNotificationsSocketUrl,
  type NotificationSocketPayload,
  type PanelNotification,
} from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { formatDateTimeID, parseDateTime } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { soundManager } from '@/lib/sound'
import { useWindowStore } from '@/store/windowStore'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconBadge, type UiTone } from '@/components/ui/IconBadge'

function getNotificationTone(type: PanelNotification['type']): UiTone {
  switch (type) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'info'
  }
}

function getNotificationIcon(type: PanelNotification['type']) {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={13} />
    case 'warning':
      return <AlertTriangle size={13} />
    case 'error':
      return <AlertCircle size={13} />
    default:
      return <Info size={13} />
  }
}

function formatNotificationTime(value: string, lang = 'id'): string {
  const date = parseDateTime(value)
  if (!date) return value
  const now = new Date()
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  const isEn = lang === 'en'

  if (diffSec < 60) return isEn ? 'just now' : 'baru saja'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ${isEn ? 'ago' : 'lalu'}`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return isEn ? `${diffHours}h ago` : `${diffHours}j lalu`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return isEn ? 'yesterday' : 'kemarin'
  if (diffDays < 7) return isEn ? `${diffDays}d ago` : `${diffDays}h lalu`

  const day = date.getDate()
  const month = date.toLocaleString(isEn ? 'en-US' : 'id-ID', { month: 'short' })
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  return `${day} ${month}, ${hours}:${mins}`
}

export function NotificationsMenu({ authenticated }: { authenticated: boolean }) {
  const { t, language } = useI18n()
  const { openWindow } = useWindowStore()
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const containerRef = useRef<HTMLDivElement>(null)

  const [notifications, setNotifications] = useState<PanelNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

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

  // WebSocket sync for real-time notifications
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
        const incoming = payload.notification
        soundManager.playNotification()
        setNotifications((current) => {
          const deduped = current.filter((item) => item.id !== incoming.id)
          return [incoming, ...deduped].slice(0, 50)
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

  // Fetch initial notifications when popover is opened
  useEffect(() => {
    if (!authenticated || !isOpen) return

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
  }, [authenticated, isOpen])

  // Click outside and escape key handling
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const displayedNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((item) => !item.isRead)
    }
    return notifications
  }, [notifications, filter])

  const handleOpenSettings = () => {
    setIsOpen(false)
    openWindow('hosting', { view: 'payments', viewRequest: Date.now() })
  }

  return (
    <div className="taskbar-notifications-wrapper" ref={containerRef}>
      <button
        id="taskbar-notifications-button"
        type="button"
        title={t('taskbar.notifications')}
        className={`taskbar-icon-btn taskbar-icon-btn--notification ${isOpen ? 'taskbar-icon-btn--active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="taskbar-notifications-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="taskbar-notifications-panel"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="taskbar-notifications"
          >
            {/* Header */}
            <div className="taskbar-notifications__header">
              <div className="taskbar-notifications__title-wrap">
                <IconBadge size="sm" tone="primary">
                  <Bell size={13} />
                </IconBadge>
                <span className="taskbar-notifications__title">
                  {t('taskbar.notifications')}
                </span>
                {unreadCount > 0 ? (
                  <Badge tone="primary" size="sm">
                    {unreadCount}
                  </Badge>
                ) : null}
              </div>

              {unreadCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  loading={markAllMutation.isPending}
                  className="!h-6 !px-2 text-[11px] font-medium text-[var(--panel-primary-text)] hover:text-[var(--panel-primary-text)]"
                >
                  <CheckCheck size={12} className="mr-1" />
                  <span>{t('taskbar.markAll')}</span>
                </Button>
              ) : null}
            </div>

            {/* Filter Bar */}
            <div className="taskbar-notifications__filter-bar">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`taskbar-notifications__filter-btn ${
                    filter === 'all' ? 'taskbar-notifications__filter-btn--active' : ''
                  }`}
                >
                  {t('taskbar.all') || 'Semua'} ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('unread')}
                  className={`taskbar-notifications__filter-btn ${
                    filter === 'unread' ? 'taskbar-notifications__filter-btn--active' : ''
                  }`}
                >
                  {t('taskbar.unread') || 'Belum dibaca'} ({unreadCount})
                </button>
              </div>

              <span className="text-[10.5px] text-[var(--text-secondary)]">
                {filter === 'unread'
                  ? t('taskbar.unreadCount', { count: unreadCount })
                  : t('taskbar.totalNotifications', { count: notifications.length })}
              </span>
            </div>

            {/* Notification List */}
            <div className="taskbar-notifications__list">
              {displayedNotifications.length === 0 ? (
                <div className="taskbar-notifications__empty">
                  <Bell size={22} className="opacity-40" />
                  <span>
                    {filter === 'unread'
                      ? t('taskbar.noUnread') || 'Semua notifikasi telah dibaca.'
                      : t('taskbar.noNotifications')}
                  </span>
                </div>
              ) : (
                displayedNotifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!item.isRead) markReadMutation.mutate(item.id)
                    }}
                    className={`taskbar-notification-item ${
                      item.isRead ? 'taskbar-notification-item--read' : 'taskbar-notification-item--unread'
                    }`}
                  >
                    <IconBadge tone={getNotificationTone(item.type)} size="sm">
                      {getNotificationIcon(item.type)}
                    </IconBadge>

                    <div className="taskbar-notification-item__content">
                      <div className="taskbar-notification-item__header">
                        <span className="taskbar-notification-item__title">
                          {item.title}
                        </span>
                        <span
                          className="taskbar-notification-item__time"
                          title={formatDateTimeID(item.createdAt)}
                        >
                          {formatNotificationTime(item.createdAt, language)}
                        </span>
                      </div>

                      <div className="taskbar-notification-item__body">
                        {item.body}
                      </div>

                      {item.actionUrl ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[var(--panel-primary-text)] hover:underline">
                          <span>{t('taskbar.details')}</span>
                          <ExternalLink size={10} />
                        </div>
                      ) : null}
                    </div>

                    {!item.isRead ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          markReadMutation.mutate(item.id)
                        }}
                        title={t('taskbar.clickToRead')}
                        className="taskbar-notification-item__action-btn"
                        aria-label={t('taskbar.clickToRead')}
                      >
                        <Check size={12} />
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="taskbar-notifications__footer">
              <span>
                {t('taskbar.totalNotifications', { count: notifications.length })}
              </span>

              <button
                type="button"
                onClick={handleOpenSettings}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--panel-primary-text)] transition-colors cursor-pointer"
              >
                <Settings size={11} />
                <span>{t('taskbar.notificationSettings') || 'Pengaturan Notifikasi'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
