import { useState, useCallback, useEffect, useRef } from 'react'
import { Folder, File as FileIcon, CornerLeftUp, Loader2, FilePlus, FolderPlus, Edit2, Key, Download, Trash, RefreshCw, Archive, PackageOpen, X, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { useWindowStore } from '@/store/windowStore'

import { useEditorStore } from '@/store/editorStore'

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

export function FileManagerWindow() {
  const { openWindow } = useWindowStore()
  const { setPendingFile } = useEditorStore()

  const [tabs, setTabs] = useState<FileManagerTab[]>([
    { id: 'tab-0', currentPath: '/', inputPath: '/', data: null, loading: false }
  ])
  const [activeTabId, setActiveTabId] = useState<string>('tab-0')
  const [modalLoading, setModalLoading] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  const [menu, setMenu] = useState<{ x: number; y: number; item: FileNode } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Internal Custom Modal State
  const [modal, setModal] = useState<ModalType | null>(null)
  const [modalInput, setModalInput] = useState('')
  const [chmodMode, setChmodMode] = useState('0644')
  const [chmodRecursive, setChmodRecursive] = useState(false)

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
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: true } : t))
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
      alertLib.fire('Akses Ditolak', err?.response?.data?.error || 'Gagal membaca direktori.', 'error', 'file-manager')
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false } : t))
    }
  }, [])

  useEffect(() => {
    tabs.forEach(tab => {
      if (!tab.data && !tab.loading && tab.currentPath === '/') {
        void loadDirectory(tab.currentPath, tab.id)
      }
    })
  }, [tabs, loadDirectory])

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
    } else if (m.type === 'compress') {
      setModalInput(m.item.name + '.zip')
    } else if (m.type === 'extract') {
      setModalInput(m.item.name.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '') || 'extracted_folder')
    } else {
      setModalInput('')
    }
    setChmodMode('0644') // fallback default
    setChmodRecursive(false)
    setModal(m)
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
        if (!modalInput) throw new Error('Nama tujuan wajib diisi.')
        reqUrl = '/api/v1/files/rename'
        payload = { oldPath: modal.item.path, newPath: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'mkdir') {
        if (!modalInput) throw new Error('Nama folder wajib diisi.')
        reqUrl = '/api/v1/files/mkdir'
        payload = { path: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'touch') {
        if (!modalInput) throw new Error('Nama berkas wajib diisi.')
        reqUrl = '/api/v1/files/touch'
        payload = { path: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'compress') {
        if (!modalInput) throw new Error('Nama arsip wajib diisi.')
        reqUrl = '/api/v1/files/compress'
        payload = { target: modal.item.path, destName: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'extract') {
        if (!modalInput) throw new Error('Nama folder ekstraksi wajib diisi.')
        reqUrl = '/api/v1/files/extract'
        payload = { source: modal.item.path, dest: joinPath(activeTab.currentPath, modalInput) }
      } else if (modal.type === 'chmod') {
        const numericMode = parseInt(chmodMode, 8)
        if (isNaN(numericMode)) throw new Error('Format oktal tidak valid (Cth: 0644).')
        reqUrl = '/api/v1/files/chmod'
        payload = { path: modal.item.path, mode: numericMode, recursive: chmodRecursive }
      }

      await axios.post(reqUrl, payload, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
      setModal(null)
      loadDirectory(activeTab.currentPath, activeTabId)
    } catch (err: any) {
      alertLib.fire('Kegagalan Operasi', err?.response?.data?.error || err.message || 'Terjadi kesalahan internal.', 'error', 'file-manager')
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

    let title = ''
    let description = ''
    let icon = null
    let confirmBtn = 'bg-sky-500/90 shadow-[0_2px_12px_rgba(14,165,233,0.3)] hover:bg-sky-400'
    let confirmText = 'Alihkan'

    if (modal.type === 'delete') {
      title = 'Hapus Permanen?'
      description = `Anda akan menghapus <strong>${modal.item.name}</strong> beserta seluruh isinya.`
      icon = <Trash className="text-red-400" size={32} />
      confirmBtn = 'bg-red-500/90 shadow-[0_2px_12px_rgba(239,68,68,0.3)] hover:bg-red-400'
      confirmText = 'Ya, Hapus!'
    } else if (modal.type === 'rename') {
      title = 'Ubah Nama File/Folder'
      description = 'Ganti nama berkas berserta ekstensinya pada baris di bawah.'
      icon = <Edit2 className="text-sky-400" size={32} />
      confirmText = 'Terapkan'
    } else if (modal.type === 'compress') {
      title = 'Kompres Arsip'
      description = `Kompres <strong>${modal.item.name}</strong> ke format .zip / .tar.gz.`
      icon = <Archive className="text-amber-400" size={32} />
      confirmText = 'Kompres'
    } else if (modal.type === 'extract') {
      title = 'Ekstrak Arsip'
      description = `Destinasi (folder tujuan) ekstrak untuk <strong>${modal.item.name}</strong>.`
      icon = <PackageOpen className="text-sky-400" size={32} />
      confirmText = 'Ekstrak'
    } else if (modal.type === 'mkdir') {
      title = 'Buat Folder Baru'
      description = 'Masukkan nama koleksi/direktori tanpa karakter terlarang (/, null).'
      icon = <FolderPlus className="text-emerald-400" size={32} />
      confirmText = 'Buat'
    } else if (modal.type === 'touch') {
      title = 'Buat File Berkas Baru'
      description = 'Ekstensi didukung. Contoh: index.html, script.js'
      icon = <FilePlus className="text-emerald-400" size={32} />
      confirmText = 'Buat'
    } else if (modal.type === 'chmod') {
      title = 'Ubah Hak Akses (UNIX)'
      description = `Modifikasi mode octal pada <strong>${modal.item.name}</strong>`
      icon = <Key className="text-amber-400" size={32} />
      confirmText = 'Terapkan'
    }

    return (
      <div className="flex flex-col items-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/5 shadow-inner ring-1 ring-white/10">
          {icon}
        </div>
        <h3 className="mb-2 text-[16.5px] font-semibold tracking-[-0.02em] text-white">
          {title}
        </h3>
        <p className="mb-6 text-[12.5px] leading-relaxed text-slate-300" dangerouslySetInnerHTML={{ __html: description }} />

        {/* INPUT AREA */}
        {['rename', 'mkdir', 'touch', 'compress', 'extract'].includes(modal.type) && (
          <div className="w-full mb-6">
            <input
              autoFocus
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-[13.5px] focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition shadow-inner placeholder-slate-500"
              placeholder={modal.type === 'rename' ? modal.item.name : 'Ketik di sini...'}
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') executeModal() }}
            />
          </div>
        )}

        {/* CHMOD UI */}
        {modal.type === 'chmod' && (
          <div className="w-full mb-6 flex flex-col mt-2">
            <div className="flex justify-between gap-3 px-1 mb-6">
              {(['u', 'g', 'o'] as const).map((pos) => {
                const titleMap = { u: 'Owner', g: 'Group', o: 'Public' }
                const val = parseOctal(chmodMode.substring(1))[pos]
                return (
                  <div key={pos} className="flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-xl relative flex-1 text-left">
                    <label className="absolute -top-2.5 left-3 bg-slate-800/80 px-1.5 text-[10.5px] tracking-wide font-bold uppercase text-sky-400 rounded backdrop-blur">
                      {titleMap[pos]}
                    </label>
                    <label className="flex items-center gap-2 mt-3 mb-2 text-xs text-slate-300 cursor-pointer hover:text-white transition">
                      <input type="checkbox" checked={(val & 4) === 4} onChange={() => toggleBit(chmodMode, pos, 4)} className="accent-sky-500 w-3.5 h-3.5" /> Read
                    </label>
                    <label className="flex items-center gap-2 mb-2 text-xs text-slate-300 cursor-pointer hover:text-white transition">
                      <input type="checkbox" checked={(val & 2) === 2} onChange={() => toggleBit(chmodMode, pos, 2)} className="accent-sky-500 w-3.5 h-3.5" /> Write
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white transition">
                      <input type="checkbox" checked={(val & 1) === 1} onChange={() => toggleBit(chmodMode, pos, 1)} className="accent-sky-500 w-3.5 h-3.5" /> Exec
                    </label>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between px-2 gap-3">
              <div className="flex items-center gap-3">
                <label className="text-[12px] font-semibold text-slate-400 uppercase tracking-widest">Octal</label>
                <input
                  value={chmodMode}
                  onChange={e => setChmodMode(e.target.value)}
                  className="w-20 bg-slate-900/80 border border-white/10 rounded-lg py-1 px-3 text-[13px] text-sky-400 font-mono outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition shadow-inner"
                  onKeyDown={(e) => { if (e.key === 'Enter') executeModal() }}
                />
              </div>
              {modal.item.isDir && (
                <label className="flex items-center gap-2 text-[11.5px] font-medium text-amber-200/80 cursor-pointer hover:text-amber-200 transition">
                  <input type="checkbox" checked={chmodRecursive} onChange={(e) => setChmodRecursive(e.target.checked)} className="accent-amber-500 w-3.5 h-3.5 cursor-pointer" />
                  Terapkan Rekursif
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
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-[12.5px] font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            onClick={executeModal}
            disabled={modalLoading}
            className={`flex-1 flex gap-2 justify-center items-center rounded-full border border-white/10 px-4 py-2.5 text-[12.5px] font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-70 disabled:cursor-not-allowed ${confirmBtn}`}
          >
            {modalLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {modalLoading ? 'Memproses...' : confirmText}
          </button>
        </div>
      </div>
    )
  }

  // Safe Coordinate Logic Context Menu
  const getSafeMenuStyles = () => {
    if (!menu || !containerRef.current) return {}
    const rect = containerRef.current.getBoundingClientRect()
    const menuWidth = 180
    const menuHeight = 220

    let top = menu.y - rect.top
    let left = menu.x - rect.left

    if (top + menuHeight > rect.height) top -= menuHeight
    if (left + menuWidth > rect.width) left -= menuWidth

    return { top: Math.max(0, top), left: Math.max(0, left) }
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-slate-50 text-slate-800 relative select-none" style={{ background: 'var(--win-bg)' }} onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>

      {/* ── Tabs Strip ── */}
      <div className="flex bg-[#252526] h-[35px] shrink-0 overflow-hidden" style={{ background: 'var(--win-bg)' }}>
        <div
          className="flex flex-1 overflow-x-auto no-scrollbar items-end border-b border-black/10 transition-colors"
          ref={tabsScrollRef}
          onMouseDown={handleTabsMouseDown}
          onMouseLeave={handleTabsMouseLeave}
          onMouseUp={handleTabsMouseUp}
          onMouseMove={handleTabsMouseMove}
          style={{ cursor: isTabDraggingRef.current ? 'grabbing' : 'auto' }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const tColor = isActive ? '#0284c7' : '#64748b'
            const tBg = isActive ? '#fff' : 'transparent'

            return (
              <div
                key={tab.id}
                className="flex items-center gap-2 px-3 h-[35px] border-r border-black/5 shrink-0 text-[12.5px] transition select-none group relative cursor-pointer"
                style={{
                  background: tBg,
                  color: tColor,
                  borderTop: isActive ? '2px solid #0ea5e9' : '2px solid transparent'
                }}
                onClick={() => setActiveTabId(tab.id)}
              >
                <Folder size={14} className={isActive ? 'text-sky-500' : 'text-slate-400'} />
                <span className="truncate max-w-[150px] font-medium">{tab.currentPath.split('/').pop() || '/'}</span>
                {tabs.length > 1 && (
                  <button
                    className={`ml-1 w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/5 transition opacity-0 group-hover:opacity-100`}
                    onClick={(e) => closeTab(tab.id, e)}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button className="w-[35px] h-[35px] flex items-center justify-center hover:bg-black/5 transition text-slate-500 border-b border-black/10 shrink-0" onClick={openNewTab} title="New Tab">
          <Plus size={18} />
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 p-2 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border-b border-white/5 bg-slate-100/5 backdrop-blur-md">
        <button
          disabled={!activeTab.data?.parent}
          onClick={() => { if (activeTab.data?.parent) setCurrentPath(activeTab.data.parent) }}
          className="p-1.5 rounded-md hover:bg-slate-200/50 disabled:opacity-30 transition text-slate-600 outline-none"
          title="Ke direktori induk"
        >
          <CornerLeftUp size={16} />
        </button>
        <div className="flex-1 bg-white/60 border border-slate-200 rounded-md px-2 py-1.5 flex items-center gap-2 shadow-inner overflow-hidden max-w-full">
          <span className="text-sm text-slate-500 hidden sm:inline select-none font-medium">Path:</span>
          <input
            className="flex-1 bg-transparent border-none outline-none text-[13.5px] font-medium text-slate-700 min-w-0"
            value={activeTab.inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onBlur={() => setCurrentPath(activeTab.inputPath)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setCurrentPath(activeTab.inputPath)
            }}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2 border-l border-slate-200 pl-2">
          <button
            onClick={() => openModal({ type: 'touch' })}
            className="px-2.5 py-1.5 rounded-md hover:bg-slate-200/50 transition text-slate-700 font-medium text-[12px] flex items-center gap-1.5 outline-none"
            title="New File"
          >
            <FilePlus size={14} className="text-emerald-600" />
            <span className="hidden md:inline">File</span>
          </button>
          <button
            onClick={() => openModal({ type: 'mkdir' })}
            className="px-2.5 py-1.5 rounded-md hover:bg-slate-200/50 transition text-slate-700 font-medium text-[12px] flex items-center gap-1.5 outline-none"
            title="New Folder"
          >
            <FolderPlus size={14} className="text-sky-600" />
            <span className="hidden md:inline">Folder</span>
          </button>

          <button
            onClick={() => loadDirectory(activeTab.currentPath, activeTabId)}
            className="p-1.5 ml-1 rounded-md hover:bg-slate-200/50 transition text-slate-600 relative outline-none"
            title="Refresh"
          >
            {activeTab.loading ? <Loader2 size={15} className="animate-spin text-sky-600" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      {/* ── Table Header ── */}
      <div className="grid grid-cols-[1fr_80px_100px_130px] gap-4 px-6 py-2 border-b border-white/5 bg-slate-50/50 text-[10.5px] uppercase tracking-[0.05em] font-bold text-slate-400 sticky top-0">
        <div>Nama Berkas</div>
        <div>Ukuran</div>
        <div>Akses</div>
        <div>Tgl Diubah</div>
      </div>

      {/* ── File List ── */}
      <div className="flex-1 overflow-y-auto p-2 border-t border-black/5 bg-white/50">
        {activeTab.loading && !activeTab.data && (
          <div className="flex justify-center p-8 text-sky-600">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
        {activeTab.data && (activeTab.data.contents || []).length === 0 && (
          <div className="flex flex-col items-center justify-center p-14 text-slate-400">
            <Folder size={46} className="mb-3 opacity-30" />
            <p className="text-[13px] font-medium opacity-80">Folder ini kosong</p>
          </div>
        )}
        {activeTab.data && (activeTab.data.contents || []).map((item) => (
          <div
            key={item.path}
            draggable={!item.isDir}
            onDragStart={(e) => {
              if (item.isDir) return
              e.dataTransfer.setData('application/x-ui-panel-file', JSON.stringify({ path: item.path, name: item.name }))
              e.dataTransfer.effectAllowed = 'copyMove'
            }}
            className="grid grid-cols-[1fr_80px_100px_130px] gap-4 px-4 py-1.5 hover:bg-slate-200/40 rounded-lg cursor-pointer transition items-center group border border-transparent hover:border-slate-200/50"
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, item })
            }}
            onDoubleClick={() => {
              if (item.isDir) {
                setCurrentPath(item.path)
              } else {
                handleEdit(item)
              }
            }}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {item.isDir ? <Folder size={17} className="text-sky-500 fill-sky-500/20 shrink-0" /> : <FileIcon size={17} className="text-slate-400 shrink-0" />}
              <span className="text-[13px] font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors">{item.name}</span>
            </div>
            <div className="text-[12px] opacity-70 p-1 font-mono tracking-tight">
              {item.isDir ? '--' : formatSize(item.size)}
            </div>
            <div className="flex items-center">
              <div className="text-[11px] opacity-60 font-mono tracking-tighter bg-slate-200/60 rounded max-w-full px-1.5 py-0.5">
                {item.mode}
              </div>
            </div>
            <div className="text-[11px] opacity-60 p-1 truncate font-medium">
              {formatDate(item.modified)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Status Bar ── */}
      <div className="px-4 py-1.5 bg-slate-200/30 border-t border-slate-200/50 text-[11px] text-slate-500 flex justify-between tracking-wide font-medium">
        <span>{activeTab.data ? `${(activeTab.data.contents || []).length} item(s)` : 'Memuat objek...'}</span>
        <span className="text-emerald-700/70 font-bold uppercase flex items-center gap-1">
          Root Access
        </span>
      </div>

      {/* ── Local Window Specific Fullscreen Overlay Modal (GlobalAlert Clone) ── */}
      <AnimatePresence>
        {modal && (
          <div className="absolute inset-0 z-[50] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-[4px]"
              onClick={() => setModal(null)}
            />
            {/* Dialog Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -15 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="relative w-full max-w-[340px] overflow-hidden rounded-[20px] border border-white/10 bg-white/5 p-6 shadow-[0_32px_64px_rgba(0,0,0,0.6)] backdrop-blur-[48px] sm:max-w-[370px]"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 32px 64px rgba(0,0,0,0.6)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {renderModalContent()}
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
            className="absolute bg-white/95 backdrop-blur border border-slate-200/80 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.15)] rounded-xl py-1.5 z-[9998] min-w-[170px]"
            style={{ top: getSafeMenuStyles().top, left: getSafeMenuStyles().left }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100/80 mb-1 truncate max-w-[170px]">
              {menu.item.name}
            </div>

            {!menu.item.isDir && (
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-sky-50 text-slate-700 font-medium transition" onClick={() => handleEdit(menu.item)}>
                <Edit2 size={13} className="text-sky-500" /> Open Editor
              </button>
            )}

            <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-sky-50 text-slate-700 font-medium transition" onClick={() => openModal({ type: 'rename', item: menu.item })}>
              <Edit2 size={13} className="text-slate-400" /> Rename ...
            </button>

            <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-sky-50 text-slate-700 font-medium transition" onClick={() => openModal({ type: 'chmod', item: menu.item })}>
              <Key size={13} className="text-emerald-500" /> Permission ...
            </button>

            <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-sky-50 text-slate-700 font-medium transition" onClick={() => openModal({ type: 'compress', item: menu.item })}>
              <Archive size={13} className="text-amber-500" /> Compress ...
            </button>

            {/\.(zip|tar\.gz|tgz|tar)$/i.test(menu.item.name) && !menu.item.isDir && (
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-sky-50 text-slate-700 font-medium transition" onClick={() => openModal({ type: 'extract', item: menu.item })}>
                <PackageOpen size={13} className="text-emerald-600" /> Extract Here ...
              </button>
            )}

            {!menu.item.isDir && (
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-sky-50 text-slate-700 font-medium transition" onClick={() => handleDownload(menu.item)}>
                <Download size={13} className="text-indigo-500" /> Download
              </button>
            )}

            <div className="border-t border-slate-100/80 my-1"></div>

            <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-red-50 text-red-600 font-medium transition group" onClick={() => openModal({ type: 'delete', item: menu.item })}>
              <Trash size={13} className="group-hover:scale-110 transition-transform" /> Delete ...
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
