import { useState, useRef, useEffect, useMemo } from 'react'
import { LayoutGrid, ChevronRight, ChevronDown } from 'lucide-react'
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
      {/* ── XFCE Trigger Button (Pure Flat: Monochrome Icon + Text + Chevron, No Box/Outline) ── */}
      <button
        type="button"
        id="taskbar-applications-btn"
        className="group flex items-center gap-1.5 h-7 px-1.5 bg-transparent border-0 outline-none ring-0 shadow-none cursor-pointer transition-opacity duration-150 hover:opacity-70 focus:outline-none select-none"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <LayoutGrid size={15} className="text-[var(--tb-text)] shrink-0 transition-transform duration-150 group-active:scale-95" />
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

      {/* ── XFCE App Drawer Popover ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 top-[36px] z-[70000] flex w-[500px] h-[390px] flex-col rounded-2xl border border-white/15 bg-neutral-900/95 backdrop-blur-2xl shadow-2xl text-neutral-100 overflow-hidden"
          >
            {/* ── Main Content: Sidebar Categories + App List ── */}
            <div className="flex flex-1 min-h-0">
              {/* Category Column */}
              <div className="w-[160px] border-r border-white/10 p-2.5 flex flex-col gap-1 bg-black/20 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
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
                      className={`flex items-center justify-between w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30'
                          : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{isEn ? cat.labelEn : cat.labelId}</span>
                      <span className="text-[10px] opacity-60 ml-1 font-mono">{count}</span>
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
                      className="group flex items-center gap-3 w-full p-2 rounded-xl text-left transition-all duration-150 hover:bg-white/10 active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/40 border border-white/10 shadow-sm transition-transform duration-150 group-hover:scale-105">
                        <AppIcon kind={item.kind} size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white group-hover:text-sky-300 transition-colors">
                          {title}
                        </div>
                        <div className="text-[10.5px] text-neutral-400 truncate leading-snug">
                          {desc}
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-neutral-600 group-hover:text-neutral-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Bottom Bar: Quick summary / host info ── */}
            <div className="flex items-center justify-between px-3.5 py-2 border-t border-white/10 bg-black/30 text-[11px] text-neutral-400">
              <span className="font-mono text-[10px] text-neutral-400">
                YPanel Linux Host
              </span>
              <span className="text-[10px] text-neutral-500">
                {accessibleItems.length} {isEn ? 'apps installed' : 'aplikasi'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
