import { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { X, Save, RefreshCcw, FileCode2 } from 'lucide-react'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { useThemeStore } from '@/store/themeStore'

import { useEditorStore } from '@/store/editorStore'

interface EditorTab {
  id: string
  path: string
  name: string
  content: string
  originalContent: string
  language: string
  isLoading: boolean
}

let nextTabId = 1

function guessLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'json': return 'json'
    case 'html': return 'html'
    case 'css': return 'css'
    case 'md': return 'markdown'
    case 'go': return 'go'
    case 'sh':
    case 'bash':
      return 'shell'
    case 'py': return 'python'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'xml': return 'xml'
    default: return 'plaintext'
  }
}

export function FileEditorWindow() {
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const isDark = useThemeStore((state) => state.mode) === 'dark'
  const { pendingFile, setPendingFile } = useEditorStore()

  // ── Drag to scroll for tabs ─────────────────────────────────────────────
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const isTabDraggingRef = useRef(false)
  const tabStartXRef = useRef(0)
  const tabScrollLeftRef = useRef(0)
  const tabHasDraggedRef = useRef(false)

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return
    isTabDraggingRef.current = true
    tabHasDraggedRef.current = false
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
    if (Math.abs(walk) > 3) tabHasDraggedRef.current = true
    tabsScrollRef.current.scrollLeft = tabScrollLeftRef.current - walk
  }

  const handleTabClick = (id: string, e: React.MouseEvent) => {
    if (tabHasDraggedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    setActiveTabId(id)
  }

  // Auto-focus scroll for active tab
  useEffect(() => {
    if (!tabsScrollRef.current) return
    const container = tabsScrollRef.current
    requestAnimationFrame(() => {
      const activeEl = container.querySelector('.ht-tab--active') as HTMLElement | null
      if (activeEl) {
        const elLeft = activeEl.offsetLeft
        const elWidth = activeEl.offsetWidth
        const contScroll = container.scrollLeft
        const contWidth = container.offsetWidth
        if (elLeft < contScroll || elLeft + elWidth > contScroll + contWidth) {
          container.scrollTo({ left: elLeft - contWidth / 2 + elWidth / 2, behavior: 'smooth' })
        }
      }
    })
  }, [activeTabId, tabs.length])

  // Open file globally
  const handleOpenFile = useCallback(async (path: string, name: string) => {
    // Prevent duplicate duplicate
    const existing = tabs.find((t) => t.path === path)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }

    const id = `tab-${nextTabId++}`
    const newTab: EditorTab = {
      id,
      path,
      name,
      content: '',
      originalContent: '',
      language: guessLanguage(name),
      isLoading: true,
    }

    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)

    try {
      const { data } = await axios.get('/api/v1/files/read?path=' + encodeURIComponent(path), {
        baseURL: import.meta.env.VITE_AGENT_BASE,
        withCredentials: true,
        responseType: 'text',
      })
      setTabs((prev) => prev.map((t) => t.id === id ? { ...t, content: String(data), originalContent: String(data), isLoading: false } : t))
    } catch (err: any) {
      alertLib.fire('Loaded Error', err?.response?.data?.error || 'Gagal membaca isi file.', 'error', 'file-editor')
      setTabs((prev) => prev.map((t) => t.id === id ? { ...t, isLoading: false, content: '// Akses ditolak atau file tidak terbaca.' } : t))
    }
  }, [tabs])

  useEffect(() => {
    if (pendingFile) {
      void handleOpenFile(pendingFile.path, pendingFile.name)
      setPendingFile(null)
    }
  }, [pendingFile, handleOpenFile, setPendingFile])


  const closeTab = (id: string, force = false) => {
    const tabToClose = tabs.find((t) => t.id === id)
    if (!tabToClose) return
    const isDirty = tabToClose.content !== tabToClose.originalContent
    if (isDirty && !force) {
      alertLib.confirm(
        'Tutup Berkas?',
        'File ini memiliki perubahan yang belum disimpan. Perubahan akan hilang.',
        'Tutup Tanpa Simpan',
        'Batal',
        'warning',
        'file-editor'
      ).then((confirmed) => {
        if (confirmed) closeTab(id, true)
      })
      return
    }

    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id)
      if (filtered.length === 0) {
        setActiveTabId(null)
      } else if (activeTabId === id) {
        setActiveTabId(filtered[filtered.length - 1].id)
      }
      return filtered
    })
  }

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const handleUpdateContent = (value: string | undefined) => {
    if (!activeTabId || typeof value !== 'string') return
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, content: value } : t))
  }

  const handleSave = async (tab: EditorTab) => {
    try {
      await axios.post('/api/v1/files/write', { path: tab.path, content: tab.content }, {
        baseURL: import.meta.env.VITE_AGENT_BASE,
        withCredentials: true,
      })
      setTabs((prev) => prev.map((t) => t.id === tab.id ? { ...t, originalContent: tab.content } : t))
      alertLib.fire('Tersimpan', `File ${tab.name} berhasil disimpan.`, 'success', 'file-editor')
    } catch (err: any) {
      alertLib.fire('Gagal Menyimpan', err?.response?.data?.error || 'Terjadi kesalahan sistem saat menyimpan file.', 'error', 'file-editor')
    }
  }

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      e.stopPropagation()
      if (activeTab && activeTab.content !== activeTab.originalContent) {
        void handleSave(activeTab)
      }
    }
  }

  return (
    <div 
      className="flex flex-col h-full bg-[#1e1e1e] overflow-hidden" 
      style={{ background: isDark ? '#1e1e1e' : '#fffffe' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        try {
          const dataText = e.dataTransfer.getData('application/x-ui-panel-file')
          if (dataText) {
            const parsed = JSON.parse(dataText)
            if (parsed.path && parsed.name) {
              void handleOpenFile(parsed.path, parsed.name)
            }
          }
        } catch {
          // ignore parsing error
        }
      }}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* ── Tabs Strip ─────────────────────────────────────────────────── */}
      <div className="flex bg-[#252526] h-[35px] shrink-0 overflow-hidden" style={{ background: isDark ? '#252526' : '#f3f3f3' }}>
        <div
          className="flex flex-1 overflow-x-auto no-scrollbar items-end"
          ref={tabsScrollRef}
          onMouseDown={handleTabsMouseDown}
          onMouseLeave={handleTabsMouseLeave}
          onMouseUp={handleTabsMouseUp}
          onMouseMove={handleTabsMouseMove}
          style={{ cursor: isTabDraggingRef.current ? 'grabbing' : 'auto' }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isDirty = tab.content !== tab.originalContent
            const tColor = isDark ? (isActive ? '#fff' : '#969696') : (isActive ? '#333' : '#737373')
            const tBg = isDark ? (isActive ? '#1e1e1e' : '#2d2d2d') : (isActive ? '#fff' : '#ececec')

            return (
              <div
                key={tab.id}
                className={`ht-tab--active flex items-center gap-2 px-3 h-[35px] border-r border-[#ffffff10] shrink-0 text-[13px] transition select-none group relative`}
                style={{
                  background: tBg,
                  color: tColor,
                  borderTop: isActive ? '2px solid #007acc' : '2px solid transparent'
                }}
                onClick={(e) => handleTabClick(tab.id, e)}
              >
                <FileCode2 size={14} className="opacity-80" />
                <span className="truncate max-w-[150px]">{tab.name}</span>
                {isDirty && <div className="w-[8px] h-[8px] bg-yellow-500 rounded-full ml-1" title="Unsaved changes" />}
                <button
                  className={`ml-1 w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/10 transition ${isDirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            )
          })}
          {tabs.length === 0 && (
            <div className="flex items-center px-4 h-full text-[12px] opacity-50" style={{ color: isDark ? '#fff' : '#000' }}>
              Tidak ada file yang sedang dibuka...
            </div>
          )}
        </div>
      </div>

      {/* ── Editor Toolbar ──────────────────────────────────────────────── */}
      {activeTab && (
        <div className="flex items-center justify-between px-4 py-1.5 shrink-0 border-b border-[#ffffff10]" style={{ background: isDark ? '#1e1e1e' : '#fff' }}>
          <div className="text-[12px] opacity-60 font-mono truncate max-w-[60%] select-all" style={{ color: isDark ? '#ccc' : '#333' }}>
            {activeTab.path}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleOpenFile(activeTab.path, activeTab.name)}
              className="px-2 py-1 flex items-center gap-1 text-[11px] font-medium rounded bg-slate-500/10 hover:bg-slate-500/20 transition"
              style={{ color: isDark ? '#ddd' : '#444' }}
              title="Reload File from Disk"
            >
              <RefreshCcw size={12} /> Reload
            </button>
            <button
              onClick={() => handleSave(activeTab)}
              disabled={activeTab.content === activeTab.originalContent}
              className={`px-3 py-1 flex items-center gap-1.5 text-[11px] font-medium rounded transition ${activeTab.content !== activeTab.originalContent
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                  : (isDark ? 'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-black/5 text-black/40 cursor-not-allowed')
                }`}
            >
              <Save size={13} /> Simpan Perubahan
            </button>
          </div>
        </div>
      )}

      {/* ── Main Editor App ──────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {!activeTab ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 select-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-32 h-32 mb-4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p className="text-xl font-medium tracking-wide">Monaco Code Editor</p>
            <p className="text-sm mt-2 opacity-60">Pilih file dari Explorer untuk mengedit</p>
          </div>
        ) : activeTab.isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center opacity-50">
            Fetching {activeTab.name}...
          </div>
        ) : (
          <Editor
            key={activeTab.id} // Re-mount or use path
            height="100%"
            language={activeTab.language}
            theme={isDark ? 'vs-dark' : 'light'}
            value={activeTab.content}
            onChange={handleUpdateContent}
            options={{
              minimap: { enabled: true, renderCharacters: false },
              fontSize: 14,
              formatOnPaste: true,
              wordWrap: 'on',
              mouseWheelZoom: true,
              fontFamily: "'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
              scrollBeyondLastLine: false,
              smoothScrolling: true,
            }}
          />
        )}
      </div>
    </div>
  )
}
