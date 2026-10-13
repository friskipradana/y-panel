import { Folder, X, Plus } from 'lucide-react'
import type { FileManagerState } from './useFileManager'

export function FileTabsStrip({ fm }: { fm: FileManagerState }) {
  const {
    t,
    tabs,
    activeTabId,
    setActiveTabId,
    tabsScrollRef,
    isTabDragging,
    handleTabsMouseDown,
    handleTabsMouseLeave,
    handleTabsMouseUp,
    handleTabsMouseMove,
    openNewTab,
    closeTab,
  } = fm

  return (
    <div className="flex h-[35px] shrink-0 overflow-hidden bg-[var(--win-bg)]" style={{ background: 'var(--win-bg)' }}>
      <div
        className="flex flex-1 overflow-x-auto no-scrollbar items-end border-b border-[var(--win-border)] transition-colors"
        ref={tabsScrollRef}
        onMouseDown={handleTabsMouseDown}
        onMouseLeave={handleTabsMouseLeave}
        onMouseUp={handleTabsMouseUp}
        onMouseMove={handleTabsMouseMove}
        style={{ cursor: isTabDragging ? 'grabbing' : 'auto' }}
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
  )
}
