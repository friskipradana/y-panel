import { Folder, Plus, X } from 'lucide-react'
import type { FileManagerState } from './useFileManager'

// The folders open in this window, one tab each
export function FileTabsStrip({ fm }: { fm: FileManagerState }) {
  const { t, tabs, activeTabId, setActiveTabId, tabsScrollRef, isTabDragging, handleTabsMouseDown, handleTabsMouseLeave, handleTabsMouseUp, handleTabsMouseMove, openNewTab, closeTab } = fm

  return (
    <div className="file-tabs">
      <div
        className="file-tabs__list no-scrollbar"
        role="tablist"
        ref={tabsScrollRef}
        onMouseDown={handleTabsMouseDown}
        onMouseLeave={handleTabsMouseLeave}
        onMouseUp={handleTabsMouseUp}
        onMouseMove={handleTabsMouseMove}
        style={{ cursor: isTabDragging ? 'grabbing' : 'auto' }}
      >
        {tabs.map((tab) => {
          const label = tab.currentPath.split('/').pop() || '/'
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTabId}
              tabIndex={0}
              className={`file-tab${tab.id === activeTabId ? ' file-tab--active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTabId(tab.id)}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="file-tab__label" title={tab.currentPath}>{label}</span>
              {tabs.length > 1 ? (
                <button type="button" className="file-tab__close" title={t('common.close')} aria-label={t('common.close')} onClick={(e) => closeTab(tab.id, e)}>
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      <button type="button" className="file-tabs__add" title={t('fileManager.newTab')} aria-label={t('fileManager.newTab')} onClick={openNewTab}>
        <Plus className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}
