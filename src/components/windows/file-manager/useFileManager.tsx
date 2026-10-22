import { useState, useCallback, useEffect, useRef } from 'react'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { getFileRootAccessStatus, getMeV2, revokeFileRootAccess, verifyFileRootAccess } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'
import { useEditorStore } from '@/store/editorStore'
import { useI18n } from '@/lib/i18n'
import {
  type FileNode,
  type DirResponse,
  type ModalType,
  type FileManagerTab,
} from './fileManagerConfig'

import type { WindowState } from '@/types'
import { EMPTY_LIST_QUERY, listParams, type ListQuery } from '@/lib/listQuery'
import { listColumn, type ColumnOptions } from '@/hooks/useListQuery'

let nextFileManagerTabId = 1

export function useFileManager({ win, authenticated }: { win: WindowState, authenticated?: boolean }) {
  const { openWindow, updateWindowParams } = useWindowStore()
  const { setPendingFile } = useEditorStore()
  const { t } = useI18n()

  // Initialize tabs from snapshot params if available, otherwise default to root
  const initialPath = win.params?.currentPath || '/'

  const [tabs, setTabs] = useState<FileManagerTab[]>([
    { id: 'tab-0', currentPath: initialPath, inputPath: initialPath, data: null, loading: false, failed: false, query: EMPTY_LIST_QUERY, searchText: '' }
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
  const [isTabDragging, setIsTabDragging] = useState(false)
  const tabStartXRef = useRef(0)
  const tabScrollLeftRef = useRef(0)

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return
    isTabDraggingRef.current = true
    setIsTabDragging(true)
    tabStartXRef.current = e.pageX - tabsScrollRef.current.offsetLeft
    tabScrollLeftRef.current = tabsScrollRef.current.scrollLeft
  }
  const stopTabDrag = () => {
    isTabDraggingRef.current = false
    setIsTabDragging(false)
  }
  const handleTabsMouseLeave = stopTabDrag
  const handleTabsMouseUp = stopTabDrag
  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isTabDraggingRef.current || !tabsScrollRef.current) return
    e.preventDefault()
    const x = e.pageX - tabsScrollRef.current.offsetLeft
    const walk = (x - tabStartXRef.current) * 1.5
    tabsScrollRef.current.scrollLeft = tabScrollLeftRef.current - walk
  }

  // the tabs as the last render had them, for code that must not wait for a new render
  const tabsRef = useRef(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  // the newest read of each tab: an older answer that arrives late is dropped
  const readSerial = useRef<Record<string, number>>({})

  // Reads a folder with the tab's search, order and filters; a changed query is passed in because the state has not caught up yet
  const loadDirectory = useCallback(async (path: string, tabId: string, queryOverride?: ListQuery) => {
    const existing = tabsRef.current.find((tab) => tab.id === tabId)
    // a plain reload while one is under way is not repeated; a changed query always is
    if (existing?.loading && !queryOverride) return
    const query = queryOverride ?? existing?.query ?? EMPTY_LIST_QUERY
    const serial = (readSerial.current[tabId] ?? 0) + 1
    readSerial.current[tabId] = serial

    setTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, loading: true, failed: false } : tab))
    setMenu(null)
    setModal(null)

    try {
      const params = listParams(query)
      params.set('path', path)
      const res = await axios.get<DirResponse>('/api/v1/files', {
        baseURL: import.meta.env.VITE_AGENT_BASE,
        withCredentials: true,
        params,
      })
      if (readSerial.current[tabId] !== serial) return

      setTabs(prev => prev.map(t => t.id === tabId ? {
        ...t,
        data: { ...res.data, contents: res.data.contents || [] },
        currentPath: res.data.path,
        inputPath: res.data.path,
        loading: false,
        failed: false
      } : t))
    } catch (err: any) {
      if (readSerial.current[tabId] !== serial) return
      if (err?.response?.status !== 401) {
        alertLib.fire(t('fileManager.accessDeniedTitle'), err?.response?.data?.error || t('fileManager.readDirectoryFailed'), 'error', 'file-manager')
      }
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false, failed: true } : t))
    }
  }, [])

  // 1. SINGLE TRIGGER: Memastikan hit pertama dan recovery hanya memicu satu call
  useEffect(() => {
    if (!authenticated) return

    // Temukan tab yang butuh data (kosong dan tidak sedang loading)
    // Utamakan tab aktif
    const targetTab = tabs.find(t => t.id === activeTabId && !t.data && !t.loading && !t.failed)
      || tabs.find(t => !t.data && !t.loading && !t.failed)

    if (targetTab) {
      void loadDirectory(targetTab.currentPath, targetTab.id)
    }
  }, [authenticated, activeTabId, tabs, loadDirectory])

  // Another folder starts without the search and filters of the last one; the order is kept
  const setCurrentPath = (path: string) => {
    const same = path === activeTab.currentPath
    const query: ListQuery = same ? activeTab.query : { ...activeTab.query, q: '', filters: {} }
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, currentPath: path, query, searchText: same ? t.searchText : '' } : t))
    void loadDirectory(path, activeTabId, query)
  }

  // A request from outside (the Projects window) to show a folder, also while this window is already open
  const lastOpenRequest = useRef(win.params?.openRequest)
  const requested = win.params?.openRequest
  const requestedPath = win.params?.openPath
  useEffect(() => {
    if (requested === undefined || requested === lastOpenRequest.current) return
    lastOpenRequest.current = requested
    if (typeof requestedPath === 'string' && requestedPath) setCurrentPath(requestedPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, requestedPath])

  const changeQuery = (patch: Partial<ListQuery>) => {
    const next: ListQuery = { ...activeTab.query, ...patch }
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query: next } : t))
    void loadDirectory(activeTab.currentPath, activeTabId, next)
  }

  const setSearchText = (text: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, searchText: text } : t))
  }

  // typing narrows the folder after a short pause, not on every key
  useEffect(() => {
    const q = activeTab.searchText.trim()
    if (q === activeTab.query.q) return
    const timer = window.setTimeout(() => {
      const next: ListQuery = { ...activeTab.query, q }
      setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, query: next } : t))
      void loadDirectory(activeTab.currentPath, activeTab.id, next)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [activeTab.id, activeTab.searchText, activeTab.query, activeTab.currentPath, loadDirectory])

  // The spreadsheet header of one column of the open folder
  const fileColumn = (key: string, label: string, options?: ColumnOptions) =>
    listColumn(
      activeTab.query,
      {
        orderBy: (column, descending) => changeQuery({ sort: column, desc: descending }),
        clearSort: () => changeQuery({ sort: null, desc: false }),
        setFilter: (column, values) => {
          const filters = { ...activeTab.query.filters }
          if (values.length === 0) delete filters[column]
          else filters[column] = values
          changeQuery({ filters })
        },
      },
      key,
      label,
      activeTab.data?.facets?.[key],
      options,
    )

  const narrowed = !!activeTab.query.q || Object.keys(activeTab.query.filters).length > 0

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
      loading: false,
      failed: false,
      query: EMPTY_LIST_QUERY,
      searchText: '',
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
    // without an agent base (the panel serves its own page) the address starts at the root; a bare "undefined" in front would be a page that is not there
    const base = (import.meta.env.VITE_AGENT_BASE as string | undefined) ?? ''
    const link = document.createElement('a')
    link.href = base + '/api/v1/files/read?path=' + encodeURIComponent(item.path)
    link.download = item.name
    document.body.appendChild(link)
    link.click()
    link.remove()
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

  // A terminal that starts in the folder that is open; one already open gets another tab there (cwdRequest says "again")
  const openTerminalHere = () => {
    openWindow('host-terminal', { cwd: activeTab.currentPath, cwdRequest: Date.now() })
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
    return 30 + 10 + 12 + (count * 32) // Header + Dividers + Padding + Items
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

  return {
    t,
    tabs,
    activeTabId,
    setActiveTabId,
    isSuperadmin,
    rootAccess,
    showRootAccessModal,
    setShowRootAccessModal,
    rootPassword,
    setRootPassword,
    rootAccessLoading,
    activeTab,
    menu,
    setMenu,
    containerRef,
    clipboard,
    selectedPaths,
    setSelectedPaths,
    modal,
    setModal,
    dragOverPath,
    setDragOverPath,
    tabsScrollRef,
    isTabDragging,
    handleTabsMouseDown,
    handleTabsMouseLeave,
    handleTabsMouseUp,
    handleTabsMouseMove,
    loadDirectory,
    setCurrentPath,
    setInputPath,
    setSearchText,
    fileColumn,
    narrowed,
    openNewTab,
    closeTab,
    handleEdit,
    handleDownload,
    openModal,
    submitRootAccess,
    openTerminalHere,
    handleRootAccessButton,
    moveItems,
    setClipboardItem,
    setClipboardBulk,
    handleBulkDelete,
    handlePasteClipboard,
    modalInput,
    setModalInput,
    modalPathInput,
    setModalPathInput,
    chmodMode,
    setChmodMode,
    chmodRecursive,
    setChmodRecursive,
    modalLoading,
    executeModal,
    joinPath,
    getSafeMenuStyles,
  }
}

export type FileManagerState = ReturnType<typeof useFileManager>
