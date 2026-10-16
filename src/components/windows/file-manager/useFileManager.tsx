import { useState, useCallback, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
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
  MODAL_CONFIGS,
} from './fileManagerConfig'

import type { WindowState } from '@/types'
import { Checkbox } from '@/components/ui/Checkbox'

let nextFileManagerTabId = 1

export function useFileManager({ win, authenticated }: { win: WindowState, authenticated?: boolean }) {
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
                    <div className="mt-3 flex flex-col gap-2">
                      <Checkbox checked={(val & 4) === 4} onChange={() => toggleBit(chmodMode, pos, 4)} label={t('fileManager.read')} />
                      <Checkbox checked={(val & 2) === 2} onChange={() => toggleBit(chmodMode, pos, 2)} label={t('fileManager.write')} />
                      <Checkbox checked={(val & 1) === 1} onChange={() => toggleBit(chmodMode, pos, 1)} label={t('fileManager.execute')} />
                    </div>
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
                <Checkbox tone="warning" checked={chmodRecursive} onChange={setChmodRecursive} label={t('fileManager.applyRecursive')} />
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
    openNewTab,
    closeTab,
    handleEdit,
    handleDownload,
    openModal,
    submitRootAccess,
    handleRootAccessButton,
    moveItems,
    setClipboardItem,
    setClipboardBulk,
    handleBulkDelete,
    handlePasteClipboard,
    renderModalContent,
    getSafeMenuStyles,
  }
}

export type FileManagerState = ReturnType<typeof useFileManager>
