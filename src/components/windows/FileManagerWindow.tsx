import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Folder, File as FileIcon, CornerLeftUp, Loader2, FilePlus, FolderPlus, Edit2, Key, Download, Trash, RefreshCw, Archive, PackageOpen, X, Plus, Copy, ClipboardPaste, Scissors } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { getFileRootAccessStatus, getMeV2, revokeFileRootAccess, verifyFileRootAccess } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'
import { useEditorStore } from '@/store/editorStore'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'

interface FileNode {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  mode: string
}

interface DirResponse {
  path: string
  parent?: string
  contents: FileNode[]
}

const formatSize = (size: number) => {
  if (size < 1024) return size + ' B'
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return (size / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]
}

const formatDate = (dateString: string) => {
  const d = new Date(dateString)
  return d.toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type ModalType =
  | { type: 'delete'; item: FileNode }
  | { type: 'rename'; item: FileNode }
  | { type: 'chmod'; item: FileNode }
  | { type: 'compress'; item: FileNode }
  | { type: 'extract'; item: FileNode }
  | { type: 'mkdir' }
  | { type: 'touch' }

interface FileManagerTab {
  id: string
  currentPath: string
  inputPath: string
  data: DirResponse | null
  loading: boolean
}

let nextFileManagerTabId = 1

// Constants for Modal Configuration
const MODAL_CONFIGS: Record<string, { icon: React.ReactNode; confirmBtn: string }> = {
  delete: {
    icon: <Trash className="text-[var(--panel-danger-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-danger-bg)] shadow-[var(--file-manager-confirm-danger-shadow)] hover:bg-[var(--file-manager-confirm-danger-hover)]',
  },
  rename: {
    icon: <Edit2 className="text-[var(--panel-primary-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  compress: {
    icon: <Archive className="text-[var(--panel-warning-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  extract: {
    icon: <PackageOpen className="text-[var(--panel-primary-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  mkdir: {
    icon: <FolderPlus className="text-[var(--panel-success-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  touch: {
    icon: <FilePlus className="text-[var(--panel-success-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  chmod: {
    icon: <Key className="text-[var(--panel-warning-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  }
}

const FileRow = memo(({
  item,
  isSelected,
  onToggleSelect,
  dragOverPath,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  onDoubleClick,
  formatSize,
  formatDate
}: {
  item: FileNode
  isSelected: boolean
  onToggleSelect: (path: string, checked: boolean) => void
  dragOverPath: string | null
  onDragStart: (e: React.DragEvent, item: FileNode) => void
  onDragOver: (e: React.DragEvent, item: FileNode) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, item: FileNode) => void
  onContextMenu: (e: React.MouseEvent, item: FileNode) => void
  onDoubleClick: (item: FileNode) => void
  formatSize: (size: number) => string
  formatDate: (date: string) => string
}) => {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={`grid grid-cols-[30px_1fr_80px_100px_130px] gap-4 px-4 py-2 rounded-lg cursor-pointer transition items-center group border ${dragOverPath === item.path ? 'bg-[var(--panel-primary-hover)] border-[var(--focus-ring)] shadow-[var(--win-shadow)]' : isSelected ? 'bg-[var(--panel-primary-bg)] border-[var(--win-border)]' : 'border-transparent hover:bg-[var(--tb-hover)] hover:border-[var(--win-bar-border)]'}`}
      onDragOver={(e) => onDragOver(e, item)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      onDoubleClick={() => onDoubleClick(item)}
    >
      <div className="flex items-center justify-center">
        <input type="checkbox" checked={isSelected} onChange={(e) => onToggleSelect(item.path, e.target.checked)} className="cursor-pointer accent-[var(--focus-ring)] w-3.5 h-3.5 transition-all" onClick={(e) => e.stopPropagation()} />
      </div>
      <div className="flex items-center gap-3 overflow-hidden">
        {item.isDir ? <Folder size={17} className="text-[var(--panel-primary-text)] fill-sky-500/20 shrink-0" /> : <FileIcon size={17} className="text-[var(--text-secondary)] shrink-0" />}
        <span className="text-[13px] font-medium text-[var(--win-text)] truncate group-hover:text-[var(--panel-primary-text)] transition-colors">{item.name}</span>
      </div>
      <div className="text-[12px] text-[var(--text-secondary)] p-1 font-mono tracking-tight">
        {item.isDir ? '--' : formatSize(item.size)}
      </div>
      <div className="flex items-center">
        <div className="text-[12px] text-[var(--tb-clock)] bg-[var(--file-manager-mode-bg)] font-mono tracking-tighter rounded max-w-full px-2 py-0.5 border border-[var(--win-bar-border)]">
          {item.mode}
        </div>
      </div>
      <div className="text-[12px] text-[var(--text-secondary)] p-1 truncate font-medium">
        {formatDate(item.modified)}
      </div>
    </div>
  )
})

export function FileManagerWindow({ win, authenticated }: { win: WindowState, authenticated?: boolean }) {
  const { openWindow, updateWindowParams } = useWindowStore()
  const { setPendingFile } = useEditorStore()
  const { t } = useI18n()

  // Initialize tabs from snapshot params if available, otherwise default to root
  const initialPath = win.params?.currentPath || '/'

  const [tabs, setTabs] = useState<FileManagerTab[]>([
    { id: 'tab-0', currentPath: initialPath, inputPath: initialPath, data: null, loading: false }
  ])
  const [activeTabId, setActiveTabId] = useState<string>('tab-0')
  const [modalLoading, setModalLoading] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [rootAccess, setRootAccess] = useState<{ enabled: boolean; expiresAt?: string }>({ enabled: false })
  const [showRootAccessModal, setShowRootAccessModal] = useState(false)
  const [rootPassword, setRootPassword] = useState('')
  const [rootAccessLoading, setRootAccessLoading] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  // Sync current path to window params for persistence
  useEffect(() => {
    if (activeTab.currentPath) {
      updateWindowParams(win.id, { currentPath: activeTab.currentPath })
    }
  }, [activeTab.currentPath, win.id, updateWindowParams])

  useEffect(() => {
    if (!authenticated) return
    void getMeV2()
      .then((me) => setIsSuperadmin(me.role === 'superadmin'))
      .catch(() => setIsSuperadmin(false))
    void getFileRootAccessStatus()
      .then(setRootAccess)
      .catch(() => setRootAccess({ enabled: false }))
  }, [authenticated])

  const [menu, setMenu] = useState<{ x: number; y: number; item?: FileNode; targetPath: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [clipboard, setClipboard] = useState<{ items: FileNode[]; mode: 'cut' | 'copy' } | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedPaths(new Set())
  }, [activeTabId, activeTab?.currentPath])

  // Internal Custom Modal State
  const [modal, setModal] = useState<ModalType | null>(null)
  const [modalInput, setModalInput] = useState('')
  const [modalPathInput, setModalPathInput] = useState('')
  const [chmodMode, setChmodMode] = useState('0644')
  const [chmodRecursive, setChmodRecursive] = useState(false)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

  // Tab Strip Drag
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const isTabDraggingRef = useRef(false)
  const tabStartXRef = useRef(0)
  const tabScrollLeftRef = useRef(0)

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return
    isTabDraggingRef.current = true
    tabStartXRef.current = e.pageX - tabsScrollRef.current.offsetLeft
    tabScrollLeftRef.current = tabsScrollRef.current.scrollLeft
  }
  const handleTabsMouseLeave = () => { isTabDraggingRef.current = false }
  const handleTabsMouseUp = () => { isTabDraggingRef.current = false }
  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isTabDraggingRef.current || !tabsScrollRef.current) return
    e.preventDefault()
    const x = e.pageX - tabsScrollRef.current.offsetLeft
    const walk = (x - tabStartXRef.current) * 1.5
    tabsScrollRef.current.scrollLeft = tabScrollLeftRef.current - walk
  }

  const loadDirectory = useCallback(async (path: string, tabId: string) => {
    // Pengecekan awal: Jika sudah loading, jangan double hit!
    let skip = false
    setTabs(prev => {
      const t = prev.find(tab => tab.id === tabId)
      if (t?.loading) {
        skip = true
        return prev
      }
      return prev.map(tab => tab.id === tabId ? { ...tab, loading: true } : tab)
    })

    if (skip) return

    console.log(`[FileManager] Hitting API for path: ${path} (Tab: ${tabId})`)
    setMenu(null)
    setModal(null)

    try {
      const res = await axios.get<DirResponse>('/api/v1/files?path=' + encodeURIComponent(path), {
        baseURL: import.meta.env.VITE_AGENT_BASE,
        withCredentials: true
      })

      setTabs(prev => prev.map(t => t.id === tabId ? {
        ...t,
        data: { ...res.data, contents: res.data.contents || [] },
        currentPath: res.data.path,
        inputPath: res.data.path,
        loading: false
      } : t))
    } catch (err: any) {
      if (err?.response?.status !== 401) {
        alertLib.fire(t('fileManager.accessDeniedTitle'), err?.response?.data?.error || t('fileManager.readDirectoryFailed'), 'error', 'file-manager')
      }
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false } : t))
    }
  }, [])

  // 1. SINGLE TRIGGER: Memastikan hit pertama dan recovery hanya memicu satu call
  useEffect(() => {
    if (!authenticated) return

    // Temukan tab yang butuh data (kosong dan tidak sedang loading)
    // Utamakan tab aktif
    const targetTab = tabs.find(t => t.id === activeTabId && !t.data && !t.loading)
      || tabs.find(t => !t.data && !t.loading)

    if (targetTab) {
      void loadDirectory(targetTab.currentPath, targetTab.id)
    }
  }, [authenticated, activeTabId, tabs, loadDirectory])

  const setCurrentPath = (path: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, currentPath: path } : t))
    void loadDirectory(path, activeTabId)
  }

  const setInputPath = (path: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, inputPath: path } : t))
  }

  const openNewTab = () => {
    const id = `tab-${nextFileManagerTabId++}`
    const newTab: FileManagerTab = {
      id,
      currentPath: activeTab.currentPath,
      inputPath: activeTab.currentPath,
      data: null,
      loading: false
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(id)
    void loadDirectory(activeTab.currentPath, id)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length === 1) return
    const idx = tabs.findIndex(t => t.id === id)
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    if (id === activeTabId) {
      const newActive = newTabs[Math.max(0, idx - 1)]
      setActiveTabId(newActive.id)
    }
  }

  const joinPath = (parent: string, child: string) => parent === '/' ? `/${child}` : `${parent}/${child}`

  // Standard Actions
  const handleEdit = (item: FileNode) => {
    setMenu(null)
    setPendingFile({ path: item.path, name: item.name })
    openWindow('file-editor')
  }

  const handleDownload = (item: FileNode) => {
    setMenu(null)
    const url = import.meta.env.VITE_AGENT_BASE + '/api/v1/files/read?path=' + encodeURIComponent(item.path)
    window.open(url, '_blank')
  }

  // Modal Openers
  const openModal = (m: ModalType) => {
    setMenu(null)
    if (m.type === 'rename') {
      setModalInput(m.item.name)
      setModalPathInput('')
    } else if (m.type === 'compress') {
      setModalInput(m.item.name + '.zip')
      setModalPathInput(activeTab.currentPath)
    } else if (m.type === 'extract') {
      setModalInput(m.item.name.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '') || 'extracted_folder')
      setModalPathInput(activeTab.currentPath)
    } else {
      setModalInput('')
      setModalPathInput('')
    }
    setChmodMode('0644') // fallback default
    setChmodRecursive(false)
    setModal(m)
  }

  const submitRootAccess = async () => {
    if (!rootPassword.trim()) {
      alertLib.fire(t('fileManager.passwordRequiredTitle'), t('fileManager.passwordRequiredMessage'), 'warning', 'file-manager')
      return
    }
    setRootAccessLoading(true)
    try {
      const status = await verifyFileRootAccess(rootPassword)
      setRootAccess(status)
      setShowRootAccessModal(false)
      setRootPassword('')
      setCurrentPath('/')
      alertLib.fire(t('fileManager.rootAccessActiveTitle'), t('fileManager.rootAccessActiveMessage'), 'success', 'file-manager')
    } catch (err: any) {
      alertLib.fire(t('fileManager.validationFailedTitle'), err?.response?.data?.error || t('fileManager.invalidPassword'), 'error', 'file-manager')
    } finally {
      setRootAccessLoading(false)
    }
  }

  const handleRootAccessButton = async () => {
    if (!isSuperadmin) return
    if (!rootAccess.enabled) {
      setRootPassword('')
      setShowRootAccessModal(true)
      return
    }
    setRootAccessLoading(true)
    try {
      const status = await revokeFileRootAccess()
      setRootAccess(status)
      alertLib.fire(t('fileManager.rootAccessClosedTitle'), t('fileManager.rootAccessClosedMessage'), 'success', 'file-manager')
    } catch (err: any) {
      alertLib.fire(t('fileManager.rootAccessCloseFailedTitle'), err?.response?.data?.error || t('fileManager.rootAccessCloseFailedMessage'), 'error', 'file-manager')
    } finally {
      setRootAccessLoading(false)
    }
  }

  // Execute Modal
  const executeModal = async () => {
    if (!modal) return
    let reqUrl = ''
    let payload = {}
    setModalLoading(true)
    try {
      if (modal.type === 'delete') {
        reqUrl = '/api/v1/files/delete'
        payload = { path: modal.item.path }
      } else if (modal.type === 'rename') {
        if (!modalInput) throw new Error(t('fileManager.errorTargetNameRequired'))
        reqUrl = '/api/v1/files/rename'
        payload = { oldPath: modal.item.path, newPath: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'mkdir') {
        if (!modalInput) throw new Error(t('fileManager.errorFolderNameRequired'))
        reqUrl = '/api/v1/files/mkdir'
        payload = { path: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'touch') {
        if (!modalInput) throw new Error(t('fileManager.errorFileNameRequired'))
        reqUrl = '/api/v1/files/touch'
        payload = { path: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'compress') {
        if (!modalInput) throw new Error(t('fileManager.errorArchiveNameRequired'))
        reqUrl = '/api/v1/files/compress'
        payload = { target: modal.item.path, destName: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'extract') {
        if (!modalPathInput) throw new Error(t('fileManager.errorExtractDirectoryRequired'))
        if (!modalInput) throw new Error(t('fileManager.errorExtractFolderRequired'))
        reqUrl = '/api/v1/files/extract'
        payload = { source: modal.item.path, dest: joinPath(modalPathInput, modalInput) }
      } else if (modal.type === 'chmod') {
        const numericMode = parseInt(chmodMode, 8)
        if (isNaN(numericMode)) throw new Error(t('fileManager.errorInvalidOctal'))
        reqUrl = '/api/v1/files/chmod'
        payload = { path: modal.item.path, mode: numericMode, recursive: chmodRecursive }
      }

      await axios.post(reqUrl, payload, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
      setModal(null)
      void loadDirectory(activeTab.currentPath, activeTabId)

      if (modal.type === 'delete') alertLib.fire(t('fileManager.deleteSuccessTitle'), t('fileManager.deleteSuccessMessage', { name: modal.item.name }), 'success', 'file-manager')
      else if (modal.type === 'rename') alertLib.fire(t('fileManager.renameSuccessTitle'), t('fileManager.renameSuccessMessage'), 'success', 'file-manager')
      else if (modal.type === 'mkdir') alertLib.fire(t('common.success'), t('fileManager.mkdirSuccessMessage'), 'success', 'file-manager')
      else if (modal.type === 'touch') alertLib.fire(t('common.success'), t('fileManager.touchSuccessMessage'), 'success', 'file-manager')
      else if (modal.type === 'chmod') alertLib.fire(t('common.success'), t('fileManager.chmodSuccessMessage'), 'success', 'file-manager')

    } catch (err: any) {
      alertLib.fire(t('fileManager.operationFailedTitle'), err?.response?.data?.error || err.message || t('fileManager.internalError'), 'error', 'file-manager')
    } finally {
      setModalLoading(false)
    }
  }

  const moveItems = async (sourcePaths: string[], destinationDir: string) => {
    setDragOverPath(null)
    setModalLoading(true)
    let count = 0
    let failed = 0
    try {
      for (const sourcePath of sourcePaths) {
        const sourceName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || ''
        const destinationPath = joinPath(destinationDir, sourceName)
        if (sourcePath === destinationPath) {
          continue
        }
        try {
          await axios.post('/api/v1/files/move', {
            oldPath: sourcePath,
            newPath: destinationPath
          }, {
            baseURL: import.meta.env.VITE_AGENT_BASE,
            withCredentials: true
          })
          count++
        } catch (e) {
          console.error('Task move error:', e)
          failed++
        }
      }
      setSelectedPaths(new Set())
      await loadDirectory(activeTab.currentPath, activeTabId)

      if (count > 0 && failed === 0) {
        alertLib.fire(t('fileManager.moveSuccessTitle'), t('fileManager.moveSuccessMessage', { count }), 'success', 'file-manager')
      } else if (count > 0 && failed > 0) {
        alertLib.fire(t('fileManager.movePartialTitle'), t('fileManager.movePartialMessage', { count, failed }), 'warning', 'file-manager')
      } else if (failed > 0) {
        alertLib.fire(t('fileManager.moveFailedTitle'), t('fileManager.moveFailedMessage'), 'error', 'file-manager')
      }
    } catch (err: any) {
      alertLib.fire(t('fileManager.moveErrorTitle'), err?.response?.data?.error || err.message || t('fileManager.moveRuntimeError'), 'error', 'file-manager')
    } finally {
      setModalLoading(false)
    }
  }

  const setClipboardItem = (item: FileNode, mode: 'cut' | 'copy') => {
    setMenu(null)
    setClipboard({ items: [item], mode })
  }

  const setClipboardBulk = (mode: 'cut' | 'copy') => {
    if (!activeTab.data?.contents) return
    const items = activeTab.data.contents.filter(i => selectedPaths.has(i.path))
    setClipboard({ items, mode })
    setSelectedPaths(new Set())
  }

  const handleBulkDelete = async () => {
    const isConfirmed = await alertLib.confirm(
      t('fileManager.bulkDeleteConfirmTitle'),
      t('fileManager.bulkDeleteConfirmMessage', { count: selectedPaths.size }),
      t('fileManager.bulkDeleteConfirmAction'),
      t('common.cancel'),
      'warning',
      'file-manager'
    )
    if (!isConfirmed) return

    setModalLoading(true)
    try {
      const paths = Array.from(selectedPaths)
      for (const p of paths) {
        await axios.post('/api/v1/files/delete', { path: p }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true }).catch(err => console.error(err))
      }
      const count = paths.length
      setSelectedPaths(new Set())
      await loadDirectory(activeTab.currentPath, activeTabId)
      alertLib.fire(t('fileManager.deleteSuccessTitle'), t('fileManager.bulkDeleteSuccessMessage', { count }), 'success', 'file-manager')
    } finally {
      setModalLoading(false)
    }
  }

  const handlePasteClipboard = async (destinationDir: string) => {
    if (!clipboard || clipboard.items.length === 0) return

    setMenu(null)
    setModalLoading(true)
    try {
      const endpoint = clipboard.mode === 'cut' ? '/api/v1/files/move' : '/api/v1/files/copy'
      for (const item of clipboard.items) {
        const sourceName = item.path.split('/').pop() || item.path.split('\\').pop() || ''
        const destinationPath = joinPath(destinationDir, sourceName)
        if (item.path !== destinationPath) {
          await axios.post(endpoint, {
            oldPath: item.path,
            newPath: destinationPath
          }, {
            baseURL: import.meta.env.VITE_AGENT_BASE,
            withCredentials: true
          })
        }
      }

      if (clipboard.mode === 'cut') {
        setClipboard(null)
      }

      await loadDirectory(activeTab.currentPath, activeTabId)
      alertLib.fire(t('fileManager.pasteSuccessTitle'), t(clipboard.mode === 'cut' ? 'fileManager.pasteMovedMessage' : 'fileManager.pasteCopiedMessage', { count: clipboard.items.length }), 'success', 'file-manager')
    } catch (err: any) {
      alertLib.fire(t('fileManager.pasteFailedTitle'), err?.response?.data?.error || err.message || t('fileManager.pasteFailedMessage'), 'error', 'file-manager')
    } finally {
      setModalLoading(false)
    }
  }

  // Modal Render Helpers
  const parseOctal = (str: string) => {
    const padded = str.padStart(3, '0').slice(-3)
    const [u, g, o] = padded.split('').map(Number)
    return { u: u || 0, g: g || 0, o: o || 0 }
  }

  const toggleBit = (currentOctalStr: string, position: 'u' | 'g' | 'o', bit: number) => {
    const m = parseOctal(currentOctalStr)
    const val = m[position]
    const hasBit = (val & bit) === bit

    if (hasBit) m[position] -= bit
    else m[position] += bit

    setChmodMode(`0${m.u}${m.g}${m.o}`)
  }

  const renderModalContent = () => {
    if (!modal) return null

    const config = MODAL_CONFIGS[modal.type]
    if (!config) return null

    const { icon, confirmBtn } = config
    const modalItem = 'item' in modal ? modal.item : undefined
    const modalKey = modal.type
    const title = t(`fileManager.modal.${modalKey}.title`)
    const confirmText = t(`fileManager.modal.${modalKey}.confirm`)
    const description = t(`fileManager.modal.${modalKey}.description`, { name: modalItem?.name ?? '' })

    return (
      <div className="flex flex-col items-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--win-bar)] shadow-inner ring-1 ring-[var(--win-border)]">
          {icon}
        </div>
        <h3 className="mb-2 text-[16.5px] font-semibold tracking-[-0.02em] text-[var(--win-text)]">
          {title}
        </h3>
        <p className="mb-6 text-[12.5px] leading-relaxed text-[var(--text-secondary)]" dangerouslySetInnerHTML={{ __html: description }} />

        {/* INPUT AREA */}
        {['rename', 'mkdir', 'touch', 'compress'].includes(modal.type) && (
          <div className="w-full mb-6">
            <input
              autoFocus
              className="w-full bg-[var(--surface-subtle)] dark:bg-[var(--surface-subtle-dark)] border border-[var(--win-border)] rounded-xl px-4 py-3 text-[var(--win-text)] text-[13.5px] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-ring)] transition shadow-inner placeholder-[var(--text-secondary)]"
              placeholder={modal.type === 'rename' ? modal.item.name : t('fileManager.typeHere')}
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') executeModal() }}
            />
          </div>
        )}

        {modal.type === 'extract' && (
          <div className="w-full mb-6 space-y-3">
            <div className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-primary-bg)] px-3 py-2 text-[11.5px] text-[var(--panel-primary-text)] dark:text-[var(--panel-primary-text)]">
              <div className="font-semibold text-[var(--panel-primary-text)] dark:text-[var(--panel-primary-text)]">{t('fileManager.extractionDirection')}</div>
              <div className="mt-1 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{modal.item.path} → {joinPath(modalPathInput || activeTab.currentPath, modalInput || t('fileManager.destinationFolderFallback'))}</div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--tb-clock)]">{t('fileManager.destinationDirectory')}</label>
              <input
                autoFocus
                className="w-full bg-[var(--surface-subtle)] dark:bg-[var(--surface-subtle-dark)] border border-[var(--win-border)] rounded-xl px-4 py-3 text-[var(--win-text)] text-[13.5px] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-ring)] transition shadow-inner placeholder-[var(--text-secondary)]"
                placeholder={t('fileManager.destinationDirectoryPlaceholder')}
                value={modalPathInput}
                onChange={(e) => setModalPathInput(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--tb-clock)]">{t('fileManager.extractFolderName')}</label>
              <input
                className="w-full bg-[var(--surface-subtle)] dark:bg-[var(--surface-subtle-dark)] border border-[var(--win-border)] rounded-xl px-4 py-3 text-[var(--win-text)] text-[13.5px] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-ring)] transition shadow-inner placeholder-[var(--text-secondary)]"
                placeholder={t('fileManager.extractFolderNamePlaceholder')}
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') executeModal() }}
              />
            </div>
          </div>
        )}

        {/* CHMOD UI */}
        {modal.type === 'chmod' && (
          <div className="w-full mb-6 flex flex-col mt-2">
            <div className="flex justify-between gap-3 px-1 mb-6">
              {(['u', 'g', 'o'] as const).map((pos) => {
                const titleMap = { u: t('fileManager.owner'), g: t('fileManager.group'), o: t('fileManager.public') }
                const val = parseOctal(chmodMode.substring(1))[pos]
                return (
                  <div key={pos} className="flex-col gap-2 p-3 bg-[var(--surface-subtle)] dark:bg-[var(--surface-subtle-dark)] border border-[var(--win-border)] rounded-xl relative flex-1 text-left">
                    <label className="absolute -top-2.5 left-3 bg-[var(--menu-bg)] px-1.5 text-[10.5px] tracking-wide font-bold uppercase text-[var(--panel-primary-text)] dark:text-[var(--panel-primary-text)] rounded backdrop-blur border border-[var(--win-border)]">
                      {titleMap[pos]}
                    </label>
                    <label className="flex items-center gap-2 mt-3 mb-2 text-[12px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--win-text)] transition">
                      <input type="checkbox" checked={(val & 4) === 4} onChange={() => toggleBit(chmodMode, pos, 4)} className="accent-[var(--focus-ring)] w-3.5 h-3.5" /> {t('fileManager.read')}
                    </label>
                    <label className="flex items-center gap-2 mb-2 text-[12px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--win-text)] transition">
                      <input type="checkbox" checked={(val & 2) === 2} onChange={() => toggleBit(chmodMode, pos, 2)} className="accent-[var(--focus-ring)] w-3.5 h-3.5" /> {t('fileManager.write')}
                    </label>
                    <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--win-text)] transition">
                      <input type="checkbox" checked={(val & 1) === 1} onChange={() => toggleBit(chmodMode, pos, 1)} className="accent-[var(--focus-ring)] w-3.5 h-3.5" /> {t('fileManager.execute')}
                    </label>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between px-2 gap-3">
              <div className="flex items-center gap-3">
                <label className="text-[12px] font-semibold text-[var(--tb-clock)] uppercase tracking-widest">{t('fileManager.octal')}</label>
                <input
                  value={chmodMode}
                  onChange={e => setChmodMode(e.target.value)}
                  className="w-20 bg-[var(--surface-subtle)] dark:bg-[var(--surface-subtle-dark)] border border-[var(--win-border)] rounded-lg py-2 px-3 text-[13px] text-[var(--panel-primary-text)] dark:text-[var(--panel-primary-text)] font-mono outline-none focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--focus-ring)] transition shadow-inner"
                  onKeyDown={(e) => { if (e.key === 'Enter') executeModal() }}
                />
              </div>
              {modal.item.isDir && (
                <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--panel-warning-text)] dark:text-[var(--panel-warning-text)]/80 cursor-pointer hover:text-[var(--panel-warning-text)] transition">
                  <input type="checkbox" checked={chmodRecursive} onChange={(e) => setChmodRecursive(e.target.checked)} className="accent-[var(--panel-warning-text)] w-3.5 h-3.5 cursor-pointer" />
                  {t('fileManager.applyRecursive')}
                </label>
              )}
            </div>
          </div>
        )}

        {/* BUTTONS */}
        <div className="flex w-full items-center justify-center gap-3">
          <button
            onClick={() => setModal(null)}
            disabled={modalLoading}
            className="flex-1 rounded-full border border-[var(--win-border)] bg-[var(--surface-subtle)] dark:bg-[var(--surface-subtle-dark)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--win-text)] transition hover:brightness-[0.95] dark:hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={executeModal}
            disabled={modalLoading}
            className={`flex-1 flex gap-2 justify-center items-center rounded-full border border-[var(--win-border)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--win-text)] transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-70 disabled:cursor-not-allowed ${confirmBtn}`}
          >
            {modalLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {modalLoading ? t('fileManager.processing') : confirmText}
          </button>
        </div>
      </div>
    )
  }

  // Safe Coordinate Logic Context Menu
  const getMenuHeight = () => {
    if (!menu) return 0
    if (!menu.item) return 100 // New File, New Folder
    let count = 0
    if (!menu.item.isDir) count += 1 // Open Editor
    count += 2 // Cut, Copy
    if (clipboard && clipboard.items.length > 0) count += 1 // Paste
    count += 3 // Rename, Permission, Compress
    if (/\.(zip|tar\.gz|tgz|tar)$/i.test(menu.item.name) && !menu.item.isDir) count += 1 // Extract
    if (!menu.item.isDir) count += 1 // Download
    count += 1 // Delete
    return 30 + 10 + 12 + (count * 35) // Header + Divider + Padding + Items
  }

  const getSafeMenuStyles = () => {
    if (!menu || !containerRef.current) return {}
    const rect = containerRef.current.getBoundingClientRect()
    const menuWidth = 180
    const menuHeight = getMenuHeight()

    let top = menu.y - rect.top
    let left = menu.x - rect.left

    if (top + menuHeight > rect.height) {
      top -= menuHeight
    }
    if (left + menuWidth > rect.width) {
      left -= menuWidth
    }

    return { top: Math.max(0, top), left: Math.max(0, left) }
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-[var(--win-content-bg)] text-[var(--text-secondary)] relative select-none"
      style={{ background: 'var(--win-bg)' }}
      onClick={() => setMenu(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, targetPath: activeTab.currentPath })
      }}
    >

      {/* ── Tabs Strip ── */}
      <div className="flex h-[35px] shrink-0 overflow-hidden bg-[var(--win-bg)]" style={{ background: 'var(--win-bg)' }}>
        <div
          className="flex flex-1 overflow-x-auto no-scrollbar items-end border-b border-[var(--win-border)] transition-colors"
          ref={tabsScrollRef}
          onMouseDown={handleTabsMouseDown}
          onMouseLeave={handleTabsMouseLeave}
          onMouseUp={handleTabsMouseUp}
          onMouseMove={handleTabsMouseMove}
          style={{ cursor: isTabDraggingRef.current ? 'grabbing' : 'auto' }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const tColor = isActive ? 'var(--win-text)' : 'var(--tb-clock)'
            const tBg = isActive ? 'var(--win-bg)' : 'transparent'

            return (
              <div
                key={tab.id}
                className="flex items-center gap-2 px-3 h-[35px] border-r border-[var(--win-border)] shrink-0 text-[12.5px] transition select-none group relative cursor-pointer"
                style={{
                  background: tBg,
                  color: tColor,
                  borderTop: isActive ? '2px solid var(--file-manager-tab-accent)' : '2px solid transparent'
                }}
                onClick={() => setActiveTabId(tab.id)}
              >
                <Folder size={14} className={isActive ? 'text-[var(--panel-primary-text)]' : 'text-[var(--text-secondary)]'} />
                <span className="truncate max-w-[150px] font-medium">{tab.currentPath.split('/').pop() || '/'}</span>
                {tabs.length > 1 && (
                  <button
                    className={`ml-1 w-5 h-5 flex items-center justify-center rounded-md hover:bg-[var(--panel-surface-hover)] transition opacity-0 group-hover:opacity-100`}
                    onClick={(e) => closeTab(tab.id, e)}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button className="w-[35px] h-[35px] flex items-center justify-center hover:bg-[var(--tb-hover)] transition text-[var(--tb-clock)] shrink-0" onClick={openNewTab} title={t('fileManager.newTab')}>
          <Plus size={18} />
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="file-manager-toolbar panel-toolbar--flat border-b border-[var(--win-border)] bg-[var(--win-bar)] px-4 py-2">
        <button
          disabled={!activeTab.data?.parent}
          onClick={() => { if (activeTab.data?.parent) setCurrentPath(activeTab.data.parent) }}
          className="panel-icon-btn"
          title={t('fileManager.parentDirectory')}
        >
          <CornerLeftUp size={16} />
        </button>
        <div className="file-manager-path flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden select-none text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] sm:inline">{t('fileManager.path')}</span>
          <input
            className="panel-input panel-input--mono h-[34px] min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0"
            value={activeTab.inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onBlur={() => setCurrentPath(activeTab.inputPath)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setCurrentPath(activeTab.inputPath)
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isSuperadmin ? (
            <button
              type="button"
              onClick={handleRootAccessButton}
              disabled={rootAccessLoading}
              className={`panel-btn ${rootAccess.enabled ? 'panel-btn--danger-soft' : 'panel-btn--ghost'} px-3 py-2 text-[12px]`}
              title={rootAccess.enabled ? t('fileManager.closeRootAccessTitle') : t('fileManager.openRootAccessTitle')}
            >
              <Key size={14} />
              {rootAccess.enabled ? t('fileManager.rootActive') : t('fileManager.rootAccess')}
            </button>
          ) : null}
          <button
            onClick={() => openModal({ type: 'touch' })}
            className="panel-btn panel-btn--ghost px-3 py-2 text-[12px]"
            title={t('fileManager.newFile')}
          >
            <FilePlus size={14} className="text-[var(--panel-success-text)]" />
            <span className="hidden md:inline">{t('fileManager.file')}</span>
          </button>
          <button
            onClick={() => openModal({ type: 'mkdir' })}
            className="panel-btn panel-btn--ghost px-3 py-2 text-[12px]"
            title={t('fileManager.newFolder')}
          >
            <FolderPlus size={14} className="text-[var(--panel-primary-text)]" />
            <span className="hidden md:inline">{t('fileManager.folder')}</span>
          </button>

          <button
            onClick={() => loadDirectory(activeTab.currentPath, activeTabId)}
            className="panel-icon-btn"
            title={t('common.refresh')}
          >
            {activeTab.loading ? <Loader2 size={15} className="animate-spin text-[var(--panel-primary-text)]" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      {/* ── Table Header ── */}
      <div className="grid grid-cols-[30px_1fr_80px_100px_130px] gap-4 px-6 py-2 border-b border-[var(--win-border)] bg-[var(--tb-hover)] text-[10.5px] uppercase tracking-[0.05em] font-bold text-[var(--tb-clock)] sticky top-0">
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            className="cursor-pointer accent-[var(--focus-ring)] w-3.5 h-3.5 transition-all"
            checked={!!(activeTab.data?.contents?.length && selectedPaths.size === activeTab.data.contents.length)}
            onChange={(e) => {
              if (e.target.checked && activeTab.data?.contents) {
                setSelectedPaths(new Set(activeTab.data.contents.map((it: FileNode) => it.path)))
              } else {
                setSelectedPaths(new Set())
              }
            }}
          />
        </div>
        <div>{t('fileManager.nameColumn')}</div>
        <div>{t('fileManager.sizeColumn')}</div>
        <div>{t('fileManager.accessColumn')}</div>
        <div>{t('fileManager.modifiedColumn')}</div>
      </div>

      {/* ── File List ── */}
      <div
        className={`flex-1 overflow-y-auto p-2 border-t border-[var(--win-border)] bg-[var(--win-content-bg)] transition-colors relative ${dragOverPath === activeTab.currentPath ? 'bg-[var(--panel-primary-bg)]' : ''}`}
        onDragOver={(e) => {
          const raw = e.dataTransfer.getData('application/x-ui-panel-file')
          if (!raw) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOverPath(activeTab.currentPath)
        }}
        onDragLeave={() => {
          if (dragOverPath === activeTab.currentPath) setDragOverPath(null)
        }}
        onDrop={async (e) => {
          const raw = e.dataTransfer.getData('application/x-ui-panel-file') || e.dataTransfer.getData('text/plain')
          setDragOverPath(null)
          if (!raw) return
          e.preventDefault()
          try {
            const dragged = JSON.parse(raw) as { path: string; name: string; isDir: boolean; paths?: string[] }
            const itemsToMove = dragged.paths && dragged.paths.length > 0 ? dragged.paths : [dragged.path]
            await moveItems(itemsToMove, activeTab.currentPath)
          } catch (err) { }
        }}
      >
        {/* FIX: Show loader if loading OR if we don't have data yet (initial hit) */}
        {(activeTab.loading || (!activeTab.data && !activeTab.loading)) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--win-bg)]/60 backdrop-blur-[1px] transition-opacity">
            <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-[var(--win-bg)] shadow-[var(--win-shadow)] border border-[var(--win-border)]">
              <Loader2 size={24} className="animate-spin text-[var(--panel-primary-text)]" />
              <span className="text-[12px] font-semibold text-[var(--tb-clock)] uppercase tracking-widest">{t('fileManager.loadingFiles')}</span>
            </div>
          </div>
        )}

        {activeTab.data && (activeTab.data.contents || []).length === 0 && !activeTab.loading && (
          <div className="flex flex-col items-center justify-center p-14 text-[var(--text-secondary)]">
            <Folder size={46} className="mb-3 opacity-30" />
            <p className="text-[13px] font-medium opacity-80">{t('fileManager.emptyFolder')}</p>
          </div>
        )}
        {activeTab.data && (activeTab.data.contents || []).map((item) => (
          <FileRow
            key={item.path}
            item={item}
            isSelected={selectedPaths.has(item.path)}
            onToggleSelect={(p, checked) => {
              const newSet = new Set(selectedPaths)
              if (checked) newSet.add(p)
              else newSet.delete(p)
              setSelectedPaths(newSet)
            }}
            dragOverPath={dragOverPath}
            formatSize={formatSize}
            formatDate={formatDate}
            onDragStart={(e, it) => {
              e.stopPropagation()
              const drags = selectedPaths.has(it.path) ? Array.from(selectedPaths) : [it.path]
              const payload = JSON.stringify({
                path: it.path,
                name: it.name,
                isDir: it.isDir,
                isBulk: drags.length > 1,
                paths: drags
              })
              e.dataTransfer.setData('application/x-ui-panel-file', payload)
              e.dataTransfer.setData('text/plain', payload)
              e.dataTransfer.effectAllowed = 'move'

              if (drags.length > 1) {
                const el = document.createElement('div')
                el.className = 'fixed left-[-9999px] top-[-9999px] bg-[var(--file-manager-drag-ghost-bg)] text-[var(--win-text)] text-[12px] font-bold px-3 py-2 rounded shadow-lg backdrop-blur z-[9999]'
                el.innerText = `${drags.length} item`
                document.body.appendChild(el)
                e.dataTransfer.setDragImage(el, -10, -10)
                requestAnimationFrame(() => { if (document.body.contains(el)) document.body.removeChild(el) })
              }
            }}
            onDragOver={(e, it) => {
              if (!it.isDir) return
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              setDragOverPath(it.path)
            }}
            onDragLeave={() => {
              if (dragOverPath !== activeTab.currentPath) setDragOverPath(null)
            }}
            onDrop={async (e, it) => {
              if (!it.isDir) return
              const raw = e.dataTransfer.getData('application/x-ui-panel-file') || e.dataTransfer.getData('text/plain')
              setDragOverPath(null)
              if (!raw) return
              e.preventDefault()
              e.stopPropagation()
              try {
                const dragged = JSON.parse(raw) as { path: string; name: string; isDir: boolean; paths?: string[] }
                const itemsToMove = dragged.paths && dragged.paths.length > 0 ? dragged.paths : [dragged.path]
                await moveItems(itemsToMove, it.path)
              } catch (err) { }
            }}
            onContextMenu={(e, it) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, item: it, targetPath: it.isDir ? it.path : activeTab.currentPath })
            }}
            onDoubleClick={(it) => {
              if (it.isDir) {
                setCurrentPath(it.path)
              } else {
                handleEdit(it)
              }
            }}
          />
        ))}
      </div>

      {/* ── Status Bar ── */}
      <div className="px-4 py-2 bg-[var(--tb-hover)] border-t border-[var(--win-border)] text-[12px] text-[var(--tb-clock)] flex justify-between tracking-wide font-medium">
        <span>{activeTab.data ? t('fileManager.itemCount', { count: (activeTab.data.contents || []).length }) : t('fileManager.loadingObjects')}</span>
        {/* <span className="text-[var(--panel-success-text)]/70 font-bold uppercase flex items-center gap-1">
          Root Access
        </span> */}
      </div>

      {/* ── Bulk Actions Floating Bar ── */}
      <AnimatePresence>
        {selectedPaths.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[var(--menu-bg)] backdrop-blur-xl border border-[var(--win-border)] text-[var(--win-text)] px-5 py-3 rounded-full shadow-[var(--file-manager-floating-shadow)] flex items-center gap-3 z-[40]"
          >
            <span className="text-[13px] font-semibold pr-3 border-r border-[var(--win-border)]">
              {t('fileManager.selectedCount', { count: selectedPaths.size })}
            </span>
            <button title={t('fileManager.move')} onClick={() => setClipboardBulk('cut')} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--panel-warning-text)] transition" ><Scissors size={16} /></button>
            <button title={t('common.copy')} onClick={() => setClipboardBulk('copy')} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--panel-primary-text)] transition"><Copy size={16} /></button>
            <button title={t('common.delete')} onClick={() => handleBulkDelete()} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--panel-danger-text)] transition"><Trash size={16} /></button>
            <div className="w-[1px] h-4 bg-[var(--file-manager-floating-divider)] mx-1" />
            <button title={t('common.cancel')} onClick={() => setSelectedPaths(new Set())} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--text-secondary)] transition"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Local Window Specific Fullscreen Overlay Modal (GlobalAlert Clone) ── */}
      <AnimatePresence>
        {modal && (
          <div className="absolute inset-0 z-[50] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-[var(--panel-overlay)] backdrop-blur-[4px]"
              onClick={() => setModal(null)}
            />
            {/* Dialog Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -15 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="relative w-full max-w-[340px] overflow-hidden rounded-[20px] border border-[var(--win-border)] p-6 backdrop-blur-[48px] sm:max-w-[370px]"
              style={{
                background: 'var(--menu-bg)',
                boxShadow: 'var(--menu-shadow)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {renderModalContent()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRootAccessModal && (
          <div className="panel-modal-overlay absolute inset-0 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="panel-modal-card max-w-[430px]"
            >
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
                <Key className="panel-window__icon h-4 w-4" />
                {t('fileManager.rootAccessTitle')}
              </h3>
              <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                {t('fileManager.rootAccessDescriptionStart')} <code className="rounded bg-[var(--panel-surface)] px-1.5 py-0.5">/</code> {t('fileManager.rootAccessDescriptionEnd')}
              </p>
              <label className="panel-section-label">{t('fileManager.superadminPassword')}</label>
              <input
                type="password"
                className="panel-input"
                value={rootPassword}
                autoFocus
                onChange={(e) => setRootPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitRootAccess()
                }}
                placeholder={t('fileManager.passwordPlaceholder')}
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="panel-btn panel-btn--ghost"
                  onClick={() => {
                    setShowRootAccessModal(false)
                    setRootPassword('')
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="panel-btn panel-btn--primary-soft"
                  disabled={rootAccessLoading}
                  onClick={() => void submitRootAccess()}
                >
                  {rootAccessLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                  {t('fileManager.openRoot')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Context Menu (Floating Box absolute per container bounds) ── */}
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute bg-[var(--menu-bg)] backdrop-blur-xl border border-[var(--menu-border)] shadow-[var(--menu-shadow)] rounded-xl py-2 z-[9998] min-w-[170px]"
            style={{ top: getSafeMenuStyles().top, left: getSafeMenuStyles().left }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-2 text-[12px] uppercase tracking-wider font-bold text-[var(--text-secondary)] border-b border-[var(--win-border)] mb-1 truncate max-w-[170px]">
              {menu.item ? menu.item.name : menu.targetPath}
            </div>

            {!menu.item && (
              <>
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'touch' })}>
                  <FilePlus size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.newFile')}
                </button>
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'mkdir' })}>
                  <FolderPlus size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.newFolder')}
                </button>
              </>
            )}

            {menu.item && !menu.item.isDir && (
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => handleEdit(menu.item!)}>
                <Edit2 size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.openEditor')}
              </button>
            )}

            {menu.item && (
              <>
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => setClipboardItem(menu.item!, 'cut')}>
                  <Scissors size={13} className="text-[var(--text-secondary)]" /> {t('common.cut')}
                </button>
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => setClipboardItem(menu.item!, 'copy')}>
                  <Copy size={13} className="text-[var(--text-secondary)]" /> {t('common.copy')}
                </button>
              </>
            )}

            {clipboard && clipboard.items.length > 0 && (
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-success-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => handlePasteClipboard(menu.targetPath)}>
                <ClipboardPaste size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.pasteAction', { action: clipboard.mode === 'cut' ? t('fileManager.move') : t('common.copy'), count: clipboard.items.length })}
              </button>
            )}

            {menu.item && (
              <>
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'rename', item: menu.item! })}>
                  <Edit2 size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.renameAction')}
                </button>

                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'chmod', item: menu.item! })}>
                  <Key size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.permissionAction')}
                </button>

                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'compress', item: menu.item! })}>
                  <Archive size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.compressAction')}
                </button>

                {/\.(zip|tar\.gz|tgz|tar)$/i.test(menu.item.name) && !menu.item.isDir && (
                  <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'extract', item: menu.item! })}>
                    <PackageOpen size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.extractHereAction')}
                  </button>
                )}

                {!menu.item.isDir && (
                  <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => handleDownload(menu.item!)}>
                    <Download size={13} className="text-[var(--text-secondary)]" /> {t('common.download')}
                  </button>
                )}

                <div className="border-t border-[var(--win-border)] my-1"></div>

                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] font-medium transition group" onClick={() => openModal({ type: 'delete', item: menu.item! })}>
                  <Trash size={13} className="group-hover:scale-110 transition-transform" /> {t('fileManager.deleteAction')}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}




