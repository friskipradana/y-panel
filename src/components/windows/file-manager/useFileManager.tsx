import { useState, useCallback, useEffect, useRef } from 'react'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { getFileRootAccessStatus, getMeV2, revokeFileRootAccess, verifyFileRootAccess } from '@/api/agent'
import { useWindowStore } from '@/store/windowStore'
import { useEditorStore } from '@/store/editorStore'
import { useI18n } from '@/lib/i18n'
import {
  type FileNode, type DirResponse, type ModalType, type FileManagerTab,
  joinPath, extractFileError, downloadFileNode, computeSafeMenuStyles, buildModalRequest,
} from './fileManagerConfig'
import type { WindowState } from '@/types'
import { EMPTY_LIST_QUERY, listParams, type ListQuery } from '@/lib/listQuery'
import { listColumn, type ColumnOptions } from '@/hooks/useListQuery'

let nextFileManagerTabId = 1

export function useFileManager({ win, authenticated }: { win: WindowState; authenticated?: boolean }) {
  const { openWindow, updateWindowParams } = useWindowStore()
  const { setPendingFile } = useEditorStore()
  const { t } = useI18n()

  const initialPath = (win.params?.currentPath as string | undefined) || '/'

  const [tabs, setTabs] = useState<FileManagerTab[]>([
    { id: 'tab-0', currentPath: initialPath, inputPath: initialPath, data: null, loading: false, failed: false, query: EMPTY_LIST_QUERY, searchText: '' },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('tab-0')
  const [modalLoading, setModalLoading] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [rootAccess, setRootAccess] = useState<{ enabled: boolean; expiresAt?: string }>({ enabled: false })
  const [showRootAccessModal, setShowRootAccessModal] = useState(false)
  const [rootPassword, setRootPassword] = useState('')
  const [rootAccessLoading, setRootAccessLoading] = useState(false)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0]
  useEffect(() => {
    if (activeTab.currentPath) updateWindowParams(win.id, { currentPath: activeTab.currentPath })
  }, [activeTab.currentPath, win.id, updateWindowParams])
  useEffect(() => {
    if (!authenticated) return
    void getMeV2().then((me) => setIsSuperadmin(me.role === 'superadmin')).catch(() => setIsSuperadmin(false))
    void getFileRootAccessStatus().then(setRootAccess).catch(() => setRootAccess({ enabled: false }))
  }, [authenticated])
  const [menu, setMenu] = useState<{ x: number; y: number; item?: FileNode; targetPath: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [clipboard, setClipboard] = useState<{ items: FileNode[]; mode: 'cut' | 'copy' } | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelectedPaths(new Set())
  }, [activeTabId, activeTab?.currentPath])

  const [modal, setModal] = useState<ModalType | null>(null)
  const [modalInput, setModalInput] = useState('')
  const [modalPathInput, setModalPathInput] = useState('')
  const [chmodMode, setChmodMode] = useState('0644')
  const [chmodRecursive, setChmodRecursive] = useState(false)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

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
    tabsScrollRef.current.scrollLeft = tabScrollLeftRef.current - (x - tabStartXRef.current) * 1.5
  }

  const tabsRef = useRef(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  const readSerial = useRef<Record<string, number>>({})

  const loadDirectory = useCallback(async (path: string, tabId: string, queryOverride?: ListQuery) => {
    const existing = tabsRef.current.find((tab) => tab.id === tabId)
    if (existing?.loading && !queryOverride) return
    const query = queryOverride ?? existing?.query ?? EMPTY_LIST_QUERY
    const serial = (readSerial.current[tabId] ?? 0) + 1
    readSerial.current[tabId] = serial

    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, loading: true, failed: false } : tab)))
    setMenu(null)
    setModal(null)

    try {
      const params = listParams(query)
      params.set('path', path)
      const res = await axios.get<DirResponse>('/api/v1/files', {
        baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true, params,
      })
      if (readSerial.current[tabId] !== serial) return
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, data: { ...res.data, contents: res.data.contents || [] }, currentPath: res.data.path, inputPath: res.data.path, loading: false, failed: false }
            : tab,
        ),
      )
    } catch (err: unknown) {
      if (readSerial.current[tabId] !== serial) return
      const info = extractFileError(err, t('fileManager.readDirectoryFailed'))
      if (info.status !== 401) alertLib.fire(t('fileManager.accessDeniedTitle'), info.message, 'error', 'file-manager')
      setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, loading: false, failed: true } : tab)))
    }
  }, [t])

  useEffect(() => {
    if (!authenticated) return
    const targetTab = tabs.find((tab) => tab.id === activeTabId && !tab.data && !tab.loading && !tab.failed)
      || tabs.find((tab) => !tab.data && !tab.loading && !tab.failed)
    if (targetTab) void loadDirectory(targetTab.currentPath, targetTab.id)
  }, [authenticated, activeTabId, tabs, loadDirectory])

  const setCurrentPath = (path: string) => {
    const same = path === activeTab.currentPath
    const query: ListQuery = same ? activeTab.query : { ...activeTab.query, q: '', filters: {} }
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, currentPath: path, query, searchText: same ? tab.searchText : '' } : tab)))
    void loadDirectory(path, activeTabId, query)
  }

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
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, query: next } : tab)))
    void loadDirectory(activeTab.currentPath, activeTabId, next)
  }

  const setSearchText = (text: string) => setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, searchText: text } : tab)))

  useEffect(() => {
    const q = activeTab.searchText.trim()
    if (q === activeTab.query.q) return
    const timer = window.setTimeout(() => {
      const next: ListQuery = { ...activeTab.query, q }
      setTabs((prev) => prev.map((tab) => (tab.id === activeTab.id ? { ...tab, query: next } : tab)))
      void loadDirectory(activeTab.currentPath, activeTab.id, next)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [activeTab.id, activeTab.searchText, activeTab.query, activeTab.currentPath, loadDirectory])

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
      key, label, activeTab.data?.facets?.[key], options,
    )

  const narrowed = !!activeTab.query.q || Object.keys(activeTab.query.filters).length > 0
  const setInputPath = (path: string) => setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, inputPath: path } : tab)))

  const openNewTab = () => {
    const id = `tab-${nextFileManagerTabId++}`
    const newTab: FileManagerTab = {
      id, currentPath: activeTab.currentPath, inputPath: activeTab.currentPath,
      data: null, loading: false, failed: false, query: EMPTY_LIST_QUERY, searchText: '',
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    void loadDirectory(activeTab.currentPath, id)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length === 1) return
    const idx = tabs.findIndex((tab) => tab.id === id)
    const newTabs = tabs.filter((tab) => tab.id !== id)
    setTabs(newTabs)
    if (id === activeTabId) setActiveTabId(newTabs[Math.max(0, idx - 1)].id)
  }

  const handleEdit = (item: FileNode) => {
    setMenu(null)
    setPendingFile({ path: item.path, name: item.name })
    openWindow('file-editor')
  }

  const handleDownload = (item: FileNode) => {
    setMenu(null)
    downloadFileNode(item)
  }

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
    setChmodMode('0644')
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
    } catch (err: unknown) {
      alertLib.fire(t('fileManager.validationFailedTitle'), extractFileError(err, t('fileManager.invalidPassword')).message, 'error', 'file-manager')
    } finally {
      setRootAccessLoading(false)
    }
  }

  const openTerminalHere = () => openWindow('host-terminal', { cwd: activeTab.currentPath, cwdRequest: Date.now() })

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
    } catch (err: unknown) {
      alertLib.fire(t('fileManager.rootAccessCloseFailedTitle'), extractFileError(err, t('fileManager.rootAccessCloseFailedMessage')).message, 'error', 'file-manager')
    } finally {
      setRootAccessLoading(false)
    }
  }

  const executeModal = async () => {
    if (!modal) return
    setModalLoading(true)
    try {
      const { reqUrl, payload } = buildModalRequest(modal, activeTab.currentPath, modalInput, modalPathInput, chmodMode, chmodRecursive, t)
      await axios.post(reqUrl, payload, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
      setModal(null)
      void loadDirectory(activeTab.currentPath, activeTabId)

      if (modal.type === 'delete') alertLib.fire(t('fileManager.deleteSuccessTitle'), t('fileManager.deleteSuccessMessage', { name: modal.item.name }), 'success', 'file-manager')
      else if (modal.type === 'rename') alertLib.fire(t('fileManager.renameSuccessTitle'), t('fileManager.renameSuccessMessage'), 'success', 'file-manager')
      else if (modal.type === 'mkdir') alertLib.fire(t('common.success'), t('fileManager.mkdirSuccessMessage'), 'success', 'file-manager')
      else if (modal.type === 'touch') alertLib.fire(t('common.success'), t('fileManager.touchSuccessMessage'), 'success', 'file-manager')
      else if (modal.type === 'chmod') alertLib.fire(t('common.success'), t('fileManager.chmodSuccessMessage'), 'success', 'file-manager')
    } catch (err: unknown) {
      alertLib.fire(t('fileManager.operationFailedTitle'), extractFileError(err, t('fileManager.internalError')).message, 'error', 'file-manager')
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
        if (sourcePath === destinationPath) continue
        try {
          await axios.post('/api/v1/files/move', { oldPath: sourcePath, newPath: destinationPath }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
          count++
        } catch {
          failed++
        }
      }
      setSelectedPaths(new Set())
      await loadDirectory(activeTab.currentPath, activeTabId)

      if (count > 0 && failed === 0) alertLib.fire(t('fileManager.moveSuccessTitle'), t('fileManager.moveSuccessMessage', { count }), 'success', 'file-manager')
      else if (count > 0 && failed > 0) alertLib.fire(t('fileManager.movePartialTitle'), t('fileManager.movePartialMessage', { count, failed }), 'warning', 'file-manager')
      else if (failed > 0) alertLib.fire(t('fileManager.moveFailedTitle'), t('fileManager.moveFailedMessage'), 'error', 'file-manager')
    } catch (err: unknown) {
      alertLib.fire(t('fileManager.moveErrorTitle'), extractFileError(err, t('fileManager.moveRuntimeError')).message, 'error', 'file-manager')
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
    setClipboard({ items: activeTab.data.contents.filter((i) => selectedPaths.has(i.path)), mode })
    setSelectedPaths(new Set())
  }

  const handleBulkDelete = async () => {
    const isConfirmed = await alertLib.confirm(
      t('fileManager.bulkDeleteConfirmTitle'), t('fileManager.bulkDeleteConfirmMessage', { count: selectedPaths.size }),
      t('fileManager.bulkDeleteConfirmAction'), t('common.cancel'), 'warning', 'file-manager',
    )
    if (!isConfirmed) return
    setModalLoading(true)
    try {
      const paths = Array.from(selectedPaths)
      for (const p of paths) {
        await axios.post('/api/v1/files/delete', { path: p }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true }).catch(() => undefined)
      }
      setSelectedPaths(new Set())
      await loadDirectory(activeTab.currentPath, activeTabId)
      alertLib.fire(t('fileManager.deleteSuccessTitle'), t('fileManager.bulkDeleteSuccessMessage', { count: paths.length }), 'success', 'file-manager')
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
          await axios.post(endpoint, { oldPath: item.path, newPath: destinationPath }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
        }
      }
      if (clipboard.mode === 'cut') setClipboard(null)
      await loadDirectory(activeTab.currentPath, activeTabId)
      alertLib.fire(t('fileManager.pasteSuccessTitle'), t(clipboard.mode === 'cut' ? 'fileManager.pasteMovedMessage' : 'fileManager.pasteCopiedMessage', { count: clipboard.items.length }), 'success', 'file-manager')
    } catch (err: unknown) {
      alertLib.fire(t('fileManager.pasteFailedTitle'), extractFileError(err, t('fileManager.pasteFailedMessage')).message, 'error', 'file-manager')
    } finally {
      setModalLoading(false)
    }
  }

  const getSafeMenuStyles = () => computeSafeMenuStyles(menu, containerRef.current, Boolean(clipboard && clipboard.items.length > 0))

  return {
    t, tabs, activeTabId, setActiveTabId, isSuperadmin, rootAccess, showRootAccessModal, setShowRootAccessModal,
    rootPassword, setRootPassword, rootAccessLoading, activeTab, menu, setMenu, containerRef, clipboard,
    selectedPaths, setSelectedPaths, modal, setModal, dragOverPath, setDragOverPath, tabsScrollRef, isTabDragging,
    handleTabsMouseDown, handleTabsMouseLeave, handleTabsMouseUp, handleTabsMouseMove, loadDirectory, setCurrentPath,
    setInputPath, setSearchText, fileColumn, narrowed, openNewTab, closeTab, handleEdit, handleDownload, openModal,
    submitRootAccess, openTerminalHere, handleRootAccessButton, moveItems, setClipboardItem, setClipboardBulk,
    handleBulkDelete, handlePasteClipboard, modalInput, setModalInput, modalPathInput, setModalPathInput,
    chmodMode, setChmodMode, chmodRecursive, setChmodRecursive, modalLoading, executeModal, joinPath, getSafeMenuStyles,
  }
}

export type FileManagerState = ReturnType<typeof useFileManager>
