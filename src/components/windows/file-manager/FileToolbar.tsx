import { CornerLeftUp, FilePlus, FolderPlus, Key, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import type { FileManagerState } from './useFileManager'

// The bar of the Docker window: up, the path, search, the creating actions, and refresh
export function FileToolbar({ fm }: { fm: FileManagerState }) {
  const {
    t,
    activeTabId,
    isSuperadmin,
    rootAccess,
    rootAccessLoading,
    activeTab,
    loadDirectory,
    setCurrentPath,
    setInputPath,
    setSearchText,
    openModal,
    handleRootAccessButton,
  } = fm

  return (
    <div className="docker-topbar docker-topbar--path">
      <div className="docker-topbar__left">
        <button
          type="button"
          className="docker-icon-btn"
          title={t('fileManager.parentDirectory')}
          aria-label={t('fileManager.parentDirectory')}
          disabled={!activeTab.data?.parent}
          onClick={() => { if (activeTab.data?.parent) setCurrentPath(activeTab.data.parent) }}
        >
          <CornerLeftUp className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <label className="docker-path">
          <span className="docker-path__label">{t('fileManager.path')}</span>
          <input
            className="docker-path__input"
            aria-label={t('fileManager.path')}
            spellCheck={false}
            value={activeTab.inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onBlur={() => setCurrentPath(activeTab.inputPath)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setCurrentPath(activeTab.inputPath)
            }}
          />
        </label>
      </div>

      <div className="docker-topbar__right">
        <div className="docker-search-wrap">
          <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
          <input
            id="file-manager-search-input"
            type="search"
            className="docker-search-input"
            aria-label={t('fileManager.searchFiles')}
            placeholder={t('fileManager.searchFiles')}
            value={activeTab.searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {isSuperadmin ? (
          <button
            type="button"
            className={`docker-secondary-btn${rootAccess.enabled ? ' docker-secondary-btn--danger' : ''}`}
            disabled={rootAccessLoading}
            title={rootAccess.enabled ? t('fileManager.closeRootAccessTitle') : t('fileManager.openRootAccessTitle')}
            aria-label={rootAccess.enabled ? t('fileManager.closeRootAccessTitle') : t('fileManager.openRootAccessTitle')}
            onClick={handleRootAccessButton}
          >
            <Key className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">{rootAccess.enabled ? t('fileManager.rootActive') : t('fileManager.rootAccess')}</span>
          </button>
        ) : null}
        <button type="button" className="docker-secondary-btn" title={t('fileManager.newFile')} aria-label={t('fileManager.newFile')} onClick={() => openModal({ type: 'touch' })}>
          <FilePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="docker-secondary-btn__text">{t('fileManager.file')}</span>
        </button>
        <button type="button" className="docker-secondary-btn" title={t('fileManager.newFolder')} aria-label={t('fileManager.newFolder')} onClick={() => openModal({ type: 'mkdir' })}>
          <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="docker-secondary-btn__text">{t('fileManager.folder')}</span>
        </button>
        <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={() => void loadDirectory(activeTab.currentPath, activeTabId)}>
          {activeTab.loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}
