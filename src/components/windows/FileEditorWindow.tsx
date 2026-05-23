import { useState, useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { X, Save, RefreshCcw, FileCode2 } from 'lucide-react'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { useThemeStore } from '@/store/themeStore'
import { useI18n } from '@/lib/i18n'

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

export function FileEditorWindow({ authenticated }: { authenticated?: boolean }) {
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const isDark = useThemeStore((state) => state.mode) === 'dark'
  const { pendingFile, setPendingFile } = useEditorStore()
  const { t } = useI18n()

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
  const handleOpenFile = useCallback(async (path: string, name: string, force = false) => {
    // Prevent duplicate if not forcing reload
    const existing = tabs.find((t) => t.path === path)
    if (existing && !force) {
      setActiveTabId(existing.id)
      return
    }

    const id = existing?.id || `tab-${nextTabId++}`

    if (existing) {
      // If force reloading an existing tab, set loading state first
      setTabs((prev) => prev.map((t) => t.id === id ? { ...t, isLoading: true } : t))
      setActiveTabId(id)
    } else {
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
    }

    try {
      const { data } = await axios.get('/api/v1/files/read?path=' + encodeURIComponent(path), {
        baseURL: import.meta.env.VITE_AGENT_BASE,
        withCredentials: true,
        responseType: 'text',
      })
      setTabs((prev) => prev.map((t) => t.id === id ? { ...t, content: String(data), originalContent: String(data), isLoading: false } : t))
    } catch (err: any) {
      alertLib.fire(t('fileEditor.loadErrorTitle'), err?.response?.data?.error || t('fileEditor.loadErrorMessage'), 'error', 'file-editor')
      setTabs((prev) => prev.map((tab) => tab.id === id ? { ...tab, isLoading: false, content: t('fileEditor.unreadableContent') } : tab))
    }
  }, [tabs])

  useEffect(() => {
    if (authenticated) {
      tabs.forEach(tab => {
        // Only retry if it was in an error state or stuck loading
        if (tab.isLoading || (tab.content === t('fileEditor.unreadableContent') && tab.originalContent === '')) {
          console.log(`[FileEditor] Re-trying to load file: ${tab.path}`)
          void handleOpenFile(tab.path, tab.name, true)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]) // ONLY depend on authenticated status

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
        t('fileEditor.closeConfirmTitle'),
        t('fileEditor.closeConfirmMessage'),
        t('fileEditor.closeConfirmAction'),
        t('common.cancel'),
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
      alertLib.fire(t('fileEditor.savedTitle'), t('fileEditor.savedMessage', { file: tab.name }), 'success', 'file-editor')
    } catch (err: any) {
      alertLib.fire(t('fileEditor.saveFailedTitle'), err?.response?.data?.error || t('fileEditor.saveFailedMessage'), 'error', 'file-editor')
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
      className="flex flex-col h-full bg-[var(--win-bg)] overflow-hidden"
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
      <div className="flex bg-[var(--win-bar)] border-b border-[var(--win-bar-border)] h-[35px] shrink-0 overflow-hidden">
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

            return (
              <div
                key={tab.id}
                className={`ht-tab--active flex items-center gap-2 px-3 h-[35px] border-r border-[var(--win-bar-border)] shrink-0 text-[13px] transition select-none group relative`}
                style={{
                  background: isActive ? 'var(--win-bg)' : 'var(--tb-hover)',
                  color: isActive ? 'var(--win-text)' : 'var(--tb-clock)',
                  borderTop: isActive ? '2px solid #007acc' : '2px solid transparent'
                }}
                onClick={(e) => handleTabClick(tab.id, e)}
              >
                <FileCode2 size={14} className="opacity-80" />
                <span className="truncate max-w-[150px]">{tab.name}</span>
                {isDirty && <div className="w-[8px] h-[8px] bg-[var(--panel-warning-text)] rounded-full ml-1" title={t('fileEditor.unsavedChanges')} />}
                <button
                  className={`ml-1 w-5 h-5 flex items-center justify-center rounded-md hover:bg-[var(--panel-surface-hover)] dark:hover:bg-[var(--panel-surface-hover)] transition ${isDirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            )
          })}
          {tabs.length === 0 && (
            <div className="flex items-center px-4 h-full text-[12px] opacity-70 text-[var(--win-text)]">
              {t('fileEditor.noOpenFiles')}
            </div>
          )}
        </div>
      </div>

      {/* ── Editor Toolbar ──────────────────────────────────────────────── */}
      {activeTab && (
        <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-[var(--win-border)] bg-[var(--win-bg)]">
          <div className="text-[12px] opacity-70 font-mono text-[var(--win-text)] truncate max-w-[60%] select-all">
            {activeTab.path}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleOpenFile(activeTab.path, activeTab.name, true)}
              className="px-3 py-2 flex items-center gap-1 text-[12px] font-medium rounded bg-[var(--tb-hover)] hover:bg-[var(--tb-hover)] text-[var(--tb-clock)] transition"
              title={t('fileEditor.reloadTitle')}
            >
              <RefreshCcw size={12} /> {t('fileEditor.reload')}
            </button>
            <button
              onClick={() => handleSave(activeTab)}
              disabled={activeTab.content === activeTab.originalContent}
              className={`px-3 py-2 flex items-center gap-1.5 text-[12px] font-medium rounded transition ${activeTab.content !== activeTab.originalContent
                ? 'bg-[var(--panel-primary-solid)] hover:bg-[var(--panel-primary-hover)] text-[var(--win-text)] shadow-lg shadow-blue-500/20'
                : 'bg-[var(--tb-hover)] text-[var(--tb-clock)] opacity-50 cursor-not-allowed'
                }`}
            >
              <Save size={13} /> {t('fileEditor.saveChanges')}
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
            <p className="text-xl font-medium tracking-wide">{t('fileEditor.title')}</p>
            <p className="text-sm mt-2 opacity-60">{t('fileEditor.selectFileHint')}</p>
          </div>
        ) : activeTab.isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center opacity-50">
            {t('fileEditor.fetching', { file: activeTab.name })}
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




