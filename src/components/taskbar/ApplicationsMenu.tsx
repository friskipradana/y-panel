import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Apps24Filled } from '@fluentui/react-icons'
import { motion, AnimatePresence } from 'framer-motion'
import { useWindowStore } from '@/store/windowStore'
import { useI18n, windowTitleKey } from '@/lib/i18n'
import { AppIcon } from '@/components/common/AppIcon'
import type { WindowKind } from '@/types'

type CategoryKey = 'all' | 'system' | 'dev' | 'network' | 'info'

interface AppMenuItem {
  kind: WindowKind
  descId: string
  descEn: string
  category: CategoryKey
  adminOnly?: boolean
}

const MENU_ITEMS: AppMenuItem[] = [
  {
    kind: 'apps',
    descId: 'Manajemen container, image, dan resource Docker',
    descEn: 'Docker containers, images, and lifecycle management',
    category: 'system',
  },
  {
    kind: 'host-terminal',
    descId: 'Terminal Linux host interaktif dengan akses root',
    descEn: 'Interactive Linux host PTY terminal with root shell',
    category: 'system',
    adminOnly: true,
  },
  {
    kind: 'system',
    descId: 'Monitor penggunaan CPU, RAM, disk, dan sensor suhu',
    descEn: 'Hardware monitor, CPU/RAM usage, and temperatures',
    category: 'system',
  },
  {
    kind: 'system-logs',
    descId: 'Log streaming journald, syslog, dan error server',
    descEn: 'Live journald log streaming and system event logs',
    category: 'system',
    adminOnly: true,
  },
  {
    kind: 'database',
    descId: 'Kelola database PostgreSQL, MySQL, dan backup',
    descEn: 'Manage PostgreSQL/MySQL databases and backups',
    category: 'dev',
    adminOnly: true,
  },
  {
    kind: 'file-manager',
    descId: 'Eksplorasi direktori, upload berkas, dan izin file',
    descEn: 'Browse filesystem, upload/download files, and permissions',
    category: 'dev',
  },
  {
    kind: 'file-editor',
    descId: 'Editor kode Monaco dengan syntax highlight',
    descEn: 'Monaco code editor with syntax highlighting',
    category: 'dev',
  },
  {
    kind: 'projects',
    descId: 'Deployer stack aplikasi Node, Go, Python, dan statis',
    descEn: 'Deploy Node.js, Go, Python apps and web stacks',
    category: 'dev',
  },
  {
    kind: 'tunnels',
    descId: 'Kelola tunnel Cloudflare daemon dan public routing',
    descEn: 'Cloudflare ingress tunnels and public hostname routing',
    category: 'network',
  },
  {
    kind: 'users',
    descId: 'Kelola akun panel dan kontrol hak akses RBAC',
    descEn: 'Manage panel users and role-based permissions',
    category: 'network',
    adminOnly: true,
  },
  {
    kind: 'settings',
    descId: 'Preferensi sistem, port daemon, dan keamanan',
    descEn: 'System preferences, agent ports, and security',
    category: 'info',
    adminOnly: true,
  },
  {
    kind: 'docs',
    descId: 'Panduan lengkap dan dokumentasi fitur YPanel',
    descEn: 'Comprehensive guides and documentation',
    category: 'info',
  },
  {
    kind: 'changelog',
    descId: 'Catatan rilis dan riwayat pembaruan sistem',
    descEn: 'Release notes and version update history',
    category: 'info',
  },
]

const CATEGORIES: { key: CategoryKey; labelId: string; labelEn: string }[] = [
  { key: 'all', labelId: 'Semua Aplikasi', labelEn: 'All Applications' },
  { key: 'system', labelId: 'Sistem & Server', labelEn: 'System & Server' },
  { key: 'dev', labelId: 'Development & Data', labelEn: 'Development & Data' },
  { key: 'network', labelId: 'Jaringan & Akses', labelEn: 'Network & Access' },
  { key: 'info', labelId: 'Pengaturan & Info', labelEn: 'Settings & Info' },
]

interface ApplicationsMenuProps {
  isAdmin: boolean
}

export function ApplicationsMenu({ isAdmin }: ApplicationsMenuProps) {
  const { t, language } = useI18n()
  const { openWindow } = useWindowStore()
  const [isOpen, setIsOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const menuRef = useRef<HTMLDivElement>(null)

  const isEn = language === 'en'

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  const accessibleItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => (isAdmin ? true : !item.adminOnly))
  }, [isAdmin])

  const filteredItems = useMemo(() => {
    return accessibleItems.filter((item) => {
      return activeCategory === 'all' || item.category === activeCategory
    })
  }, [accessibleItems, activeCategory])

  const handleLaunch = (kind: WindowKind) => {
    openWindow(kind)
    setIsOpen(false)
  }

  return (
    <div className="relative inline-flex items-center select-none" ref={menuRef}>
      {/* ── Applications Trigger Button (Fluent Apps Icon + Text + Chevron) ── */}
      <button
        type="button"
        id="taskbar-applications-btn"
        className="group flex items-center gap-1.5 h-7 px-1.5 bg-transparent border-0 outline-none ring-0 shadow-none cursor-pointer transition-opacity duration-150 hover:opacity-70 focus:outline-none select-none"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className="text-[var(--tb-text)] inline-flex items-center justify-center shrink-0 transition-transform duration-150 group-active:scale-95">
          <Apps24Filled style={{ fontSize: '15px', width: '15px', height: '15px' }} />
        </span>
        <span className="text-[13px] font-semibold tracking-normal text-[var(--tb-text)] font-sans">
          {isEn ? 'Applications' : 'Aplikasi'}
        </span>
        <ChevronDown
          size={12}
          className={`text-[var(--tb-text)] opacity-60 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* ── Applications Drawer Popover (Emerges smoothly beneath taskbar) ── */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed left-4 top-[44px] z-[59990] w-[500px] h-[400px] overflow-hidden pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex w-full h-full flex-col rounded-t-none rounded-b-2xl border-x border-b border-[var(--menu-border)] bg-[var(--menu-bg)] backdrop-blur-2xl shadow-[var(--menu-shadow)] text-[var(--win-text)] overflow-hidden"
            >
              {/* ── Main Content: Sidebar Categories + App List ── */}
              <div className="flex flex-1 min-h-0">
                {/* Category Column */}
                <div className="w-[170px] border-r border-[var(--win-border)] p-2.5 flex flex-col gap-1 bg-[var(--panel-surface)] overflow-y-auto">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-80">
                    {isEn ? 'Categories' : 'Kategori'}
                  </div>
                  {CATEGORIES.map((cat) => {
                    const isActive = activeCategory === cat.key
                    const count = cat.key === 'all'
                      ? accessibleItems.length
                      : accessibleItems.filter((i) => i.category === cat.key).length

                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setActiveCategory(cat.key)}
                        className={`flex items-center justify-between w-full px-2.5 py-2 rounded-xl text-left text-[12px] font-medium transition-all duration-150 cursor-pointer ${
                          isActive
                            ? 'bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold border border-[var(--panel-primary-text)]/25 shadow-xs'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]'
                        }`}
                      >
                        <span className="truncate">{isEn ? cat.labelEn : cat.labelId}</span>
                        <span className="text-[10.5px] opacity-70 ml-1 font-mono">{count}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Apps List Column */}
                <div className="flex-1 p-2.5 overflow-y-auto space-y-1">
                  {filteredItems.map((item) => {
                    const title = t(windowTitleKey(item.kind))
                    const desc = isEn ? item.descEn : item.descId

                    return (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => handleLaunch(item.kind)}
                        className="group flex items-center gap-3 w-full p-2.5 rounded-xl text-left transition-all duration-150 hover:bg-[var(--panel-surface-hover)] active:scale-[0.99] cursor-pointer"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--panel-surface)] border border-[var(--win-border)] shadow-xs transition-transform duration-150 group-hover:scale-105">
                          <AppIcon kind={item.kind} size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold text-[var(--win-text)] group-hover:text-[var(--panel-primary-text)] transition-colors">
                            {title}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] truncate leading-snug mt-0.5">
                            {desc}
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-[var(--text-secondary)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--panel-primary-text)] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Bottom Bar: Total Apps Counter ── */}
              <div className="flex items-center justify-end px-4 py-2 border-t border-[var(--win-border)] bg-[var(--panel-surface)] text-[11px] text-[var(--text-secondary)]">
                <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                  {accessibleItems.length} {isEn ? 'apps installed' : 'aplikasi'}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
