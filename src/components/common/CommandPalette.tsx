import { useEffect, useCallback } from 'react'
import { Command } from 'cmdk'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Terminal,
  FolderOpen,
  Settings,
  Users,
  Layers,
  ScrollText,
  RotateCcw,
  Sun,
  Moon,
  Lock,
  Search,
  Database,
  Radio,
  BookOpen,
  Clock,
  Cpu,
  Globe,
  StickyNote,
  Activity,
  Sparkles,
  CornerDownLeft,
} from 'lucide-react'
import { useCommandStore } from '@/store/commandStore'
import { useWindowStore } from '@/store/windowStore'
import { useWidgetStore } from '@/store/widgetStore'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import { canAccessWindow } from '@/components/desktop/Desktop'
import type { WindowKind, WidgetType } from '@/types'

export function CommandPalette() {
  const { isOpen, closeCommandPalette } = useCommandStore()
  const { openWindow, resetWindows } = useWindowStore()
  const { addWidget, resetLayout, hasWidget } = useWidgetStore()
  const { mode, toggleMode } = useThemeStore()
  const { user } = useAuthStore()

  const userRole = user?.role ?? null

  const handleSelectWindow = useCallback(
    (kind: WindowKind) => {
      if (!canAccessWindow(kind, userRole)) return
      openWindow(kind)
      closeCommandPalette()
    },
    [userRole, openWindow, closeCommandPalette]
  )

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      addWidget(type)
      closeCommandPalette()
    },
    [addWidget, closeCommandPalette]
  )

  const handleResetWidgets = useCallback(() => {
    resetLayout()
    closeCommandPalette()
  }, [resetLayout, closeCommandPalette])

  const handleToggleTheme = useCallback(() => {
    toggleMode()
    closeCommandPalette()
  }, [toggleMode, closeCommandPalette])

  const handleLockScreen = useCallback(() => {
    useThemeStore.getState().setIsLocked(true)
    closeCommandPalette()
  }, [closeCommandPalette])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeCommandPalette()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeCommandPalette])

  // Uniform monochrome icon wrapper matching YPanel desktop icon aesthetics
  const renderIconBox = (IconComp: React.ComponentType<{ size?: number; className?: string }>) => (
    <div className="h-8 w-8 rounded-xl bg-black/25 dark:bg-white/[0.06] border border-white/10 dark:border-white/10 flex items-center justify-center shrink-0 text-slate-300 dark:text-slate-200 group-data-[selected=true]:border-cyan-500/40 group-data-[selected=true]:bg-cyan-500/10 group-data-[selected=true]:text-cyan-400 transition-colors">
      <IconComp size={16} />
    </div>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none">
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeCommandPalette}
            className="fixed inset-0 bg-black/65 backdrop-blur-md"
          />

          {/* Modal Container: Perfect Center & Sleek Monochromatic Shell */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            className="relative w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col z-10 -translate-y-4"
            style={{
              backgroundColor: 'var(--win-bg)',
              borderColor: 'var(--win-border)',
              color: 'var(--win-text)',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65), 0 0 0 1px var(--win-border)',
            }}
          >
            <Command
              loop
              label="Command Palette"
              className="w-full flex flex-col focus:outline-none"
            >
              {/* Search Bar Header */}
              <div
                className="flex items-center gap-3.5 px-5 py-4 border-b"
                style={{ borderColor: 'var(--win-border)' }}
              >
                <Search size={18} className="text-cyan-500 shrink-0 opacity-90" />
                <Command.Input
                  autoFocus
                  placeholder="Ketik nama aplikasi, widget, atau perintah sistem..."
                  className="w-full bg-transparent text-[14px] text-[var(--win-text)] placeholder-[var(--text-secondary)]/60 focus:outline-none"
                />
                <kbd
                  onClick={closeCommandPalette}
                  className="px-2 py-0.5 rounded-md text-[10px] font-mono border cursor-pointer hover:bg-slate-500/15 transition-colors shrink-0"
                  style={{
                    backgroundColor: 'var(--panel-surface-strong)',
                    borderColor: 'var(--win-border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  ESC
                </kbd>
              </div>

              {/* Scrollable Command List */}
              <Command.List
                className="max-h-[380px] overflow-y-auto p-2.5 focus:outline-none custom-widget-scrollbar space-y-1"
                style={{ color: 'var(--win-text)' }}
              >
                <Command.Empty className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  Tidak ada perintah atau aplikasi yang sesuai.
                </Command.Empty>

                {/* Group 1: Aplikasi & Window */}
                <Command.Group
                  heading="Aplikasi & Alat Server"
                  className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-[var(--text-secondary)] opacity-85"
                >
                  {canAccessWindow('host-terminal', userRole) && (
                    <Command.Item
                      onSelect={() => handleSelectWindow('host-terminal')}
                      className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {renderIconBox(Terminal)}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                            Host Terminal
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            Terminal interaktif Linux PTY dengan akses shell host
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <kbd className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                          Alt + T
                        </kbd>
                        <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                      </div>
                    </Command.Item>
                  )}

                  <Command.Item
                    onSelect={() => handleSelectWindow('apps')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Layers)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Docker Containers
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Manajemen container, image, log, dan status runtime
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        App
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleSelectWindow('file-manager')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(FolderOpen)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          File Manager
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Eksplorasi folder, upload, edit, dan permission file server
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <kbd className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Alt + F
                      </kbd>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  {canAccessWindow('database', userRole) && (
                    <Command.Item
                      onSelect={() => handleSelectWindow('database')}
                      className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {renderIconBox(Database)}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                            Database Manager
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            Monitoring koneksi database PostgreSQL, MySQL, dan backup
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                          Database
                        </span>
                        <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                      </div>
                    </Command.Item>
                  )}

                  {canAccessWindow('system-logs', userRole) && (
                    <Command.Item
                      onSelect={() => handleSelectWindow('system-logs')}
                      className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {renderIconBox(ScrollText)}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                            System Logs
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            Streaming log live dari journald dan service server
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                          Logs
                        </span>
                        <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                      </div>
                    </Command.Item>
                  )}

                  <Command.Item
                    onSelect={() => handleSelectWindow('tunnels')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Radio)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Cloudflare Tunnels
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Publikasi port lokal ke domain publik aman tanpa buka router
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Network
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleSelectWindow('projects')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Layers)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Projects
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Katalog aplikasi web dan direktori proyek server
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <kbd className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Alt + P
                      </kbd>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleSelectWindow('settings')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Settings)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Pengaturan Sistem
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Wallpaper, preferensi desktop, screensaver, dan agent
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <kbd className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Alt + S
                      </kbd>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  {canAccessWindow('users', userRole) && (
                    <Command.Item
                      onSelect={() => handleSelectWindow('users')}
                      className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {renderIconBox(Users)}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                            Manajemen Pengguna
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            Tambah user panel, atur role, dan hak akses
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <kbd className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                          Alt + U
                        </kbd>
                        <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                      </div>
                    </Command.Item>
                  )}

                  <Command.Item
                    onSelect={() => handleSelectWindow('docs')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(BookOpen)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Dokumentasi Panel
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Panduan lengkap penggunaan fitur dan API YPanel
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Docs
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>
                </Command.Group>

                {/* Group 2: Modul Widget Desktop */}
                <Command.Group
                  heading="Modul Widget Desktop"
                  className="px-2.5 pt-3 pb-1 text-[11px] font-medium text-[var(--text-secondary)] opacity-85"
                >
                  <Command.Item
                    onSelect={() => handleSelectWindow('widgets')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Sparkles)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Galeri Widget Desktop
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Katalog lengkap modul floating info untuk desktop
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Gallery
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleAddWidget('clock-uptime')}
                    disabled={hasWidget('clock-uptime')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25 aria-disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Clock)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Pasang Clock & Uptime
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Jam digital presisi, tanggal lokal, dan durasi aktif server
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        {hasWidget('clock-uptime') ? 'Terpasang' : 'Widget'}
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleAddWidget('system-vital')}
                    disabled={hasWidget('system-vital')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25 aria-disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Cpu)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Pasang System Vitals
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Bar meter realtime CPU, RAM memori, dan storage disk
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        {hasWidget('system-vital') ? 'Terpasang' : 'Widget'}
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleAddWidget('network-traffic')}
                    disabled={hasWidget('network-traffic')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25 aria-disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Globe)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Pasang Network Traffic
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Grafik transfer rate RX/TX dan interface IP host
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        {hasWidget('network-traffic') ? 'Terpasang' : 'Widget'}
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleAddWidget('quick-note')}
                    disabled={hasWidget('quick-note')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25 aria-disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(StickyNote)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Pasang Sysadmin Memo
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Sticky note catatan cepat perintah atau info server
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        {hasWidget('quick-note') ? 'Terpasang' : 'Widget'}
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => handleAddWidget('cpu-graph')}
                    disabled={hasWidget('cpu-graph')}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25 aria-disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Activity)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Pasang CPU History
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Grafik tren sparkline beban prosesor 60 detik
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        {hasWidget('cpu-graph') ? 'Terpasang' : 'Widget'}
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={handleResetWidgets}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(RotateCcw)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Reset Tata Letak Widget
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Rapikan widget desktop ke susunan rak susun jarak selaras 15px
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Action
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>
                </Command.Group>

                {/* Group 3: Sistem & Tampilan */}
                <Command.Group
                  heading="Sistem & Tampilan"
                  className="px-2.5 pt-3 pb-1 text-[11px] font-medium text-[var(--text-secondary)] opacity-85"
                >
                  <Command.Item
                    onSelect={handleToggleTheme}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(mode === 'dark' ? Sun : Moon)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Ganti Tema ke {mode === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Alihkan skema visual tampilan kontrol panel
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        {mode === 'dark' ? 'Dark' : 'Light'}
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      resetWindows()
                      closeCommandPalette()
                    }}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(RotateCcw)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Reset Semua Jendela
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Tutup semua window dan bersihkan workspace desktop
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Window
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>

                  <Command.Item
                    onSelect={handleLockScreen}
                    className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer border border-transparent transition-all data-[selected=true]:bg-cyan-500/12 data-[selected=true]:border-cyan-500/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderIconBox(Lock)}
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--win-text)] truncate">
                          Kunci Layar (Lock Screen)
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] truncate">
                          Kunci sesi workstation untuk keamanan
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                        Security
                      </span>
                      <CornerDownLeft size={13} className="text-cyan-400 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
                    </div>
                  </Command.Item>
                </Command.Group>
              </Command.List>

              {/* Footer Tip Bar */}
              <div
                className="flex items-center justify-between px-5 py-2.5 text-[11px] border-t"
                style={{
                  backgroundColor: 'var(--panel-surface)',
                  borderColor: 'var(--win-border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <div className="flex items-center gap-3 font-mono text-[10px]">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--win-border)] bg-[var(--panel-surface-strong)] font-semibold text-[var(--win-text)]">↑↓</kbd>
                    Navigasi
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--win-border)] bg-[var(--panel-surface-strong)] font-semibold text-[var(--win-text)]">↵</kbd>
                    Pilih
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--win-border)] bg-[var(--panel-surface-strong)] font-semibold text-[var(--win-text)]">ESC</kbd>
                    Tutup
                  </span>
                </div>
                <div className="text-[10px] font-mono opacity-70">
                  YPanel Quick Command
                </div>
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
