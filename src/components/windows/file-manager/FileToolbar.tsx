import { useRef } from 'react'
import {
  ClipboardPaste,
  CornerLeftUp,
  Eraser,
  FolderOpen,
  Key,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import type { FileManagerState } from './useFileManager'
import type { FileUpload } from './useFileUpload'

// Compact workstation toolbar: Browse/Cleanup switch, Up + Path, Search, Paste, Upload, + Menu, Refresh
export function FileToolbar({ fm, upload }: { fm: FileManagerState; upload: FileUpload }) {
  const isMobile = useIsMobileLayout()
  const picker = useRef<HTMLInputElement>(null)
  const {
    t,
    viewMode,
    setViewMode,
    showHidden,
    setShowHidden,
    activeTabId,
    isSuperadmin,
    rootAccess,
    rootAccessLoading,
    activeTab,
    clipboard,
    loadDirectory,
    setCurrentPath,
    setInputPath,
    setSearchText,
    openModal,
    openTerminalHere,
    handleRootAccessButton,
    handlePasteClipboard,
  } = fm

  const moreActions: ActionMenuItem[] = [
    { key: 'touch', label: t('fileManager.newFile'), onSelect: () => openModal({ type: 'touch' }) },
    { key: 'mkdir', label: t('fileManager.newFolder'), onSelect: () => openModal({ type: 'mkdir' }) },
    {
      key: 'upload',
      label: t('fileManager.uploadTitle'),
      disabled: !!upload.upload,
      onSelect: () => picker.current?.click(),
    },
    {
      key: 'terminal',
      label: t('fileManager.openTerminalTitle'),
      dividerBefore: true,
      onSelect: openTerminalHere,
    },
    {
      key: 'hidden',
      label: showHidden ? t('fileManager.hideHiddenFiles') : t('fileManager.showHiddenFiles'),
      onSelect: () => setShowHidden((v) => !v),
    },
    ...(isSuperadmin
      ? [
          {
            key: 'root',
            label: rootAccess.enabled ? t('fileManager.closeRootAccessTitle') : t('fileManager.openRootAccessTitle'),
            tone: (rootAccess.enabled ? 'danger' : 'default') as 'danger' | 'default',
            dividerBefore: true,
            disabled: rootAccessLoading,
            onSelect: () => void handleRootAccessButton(),
          },
        ]
      : []),
  ]

  const fileInput = (
    <input
      ref={picker}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        void upload.start(Array.from(e.target.files ?? []))
        e.target.value = ''
      }}
    />
  )

  if (isMobile) {
    return (
      <div className="docker-topbar docker-topbar--path flex flex-col gap-2 p-2.5">
        {fileInput}
        <div className="flex w-full items-center gap-1.5">
          <button
            type="button"
            className="docker-icon-btn shrink-0"
            title={t('fileManager.parentDirectory')}
            aria-label={t('fileManager.parentDirectory')}
            disabled={!activeTab.data?.parent}
            onClick={() => {
              setViewMode('browse')
              if (activeTab.data?.parent) setCurrentPath(activeTab.data.parent)
            }}
          >
            <CornerLeftUp className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <label className="docker-path min-w-0 flex-1">
            <span className="docker-path__label shrink-0">{t('fileManager.path')}</span>
            <input
              className="docker-path__input min-w-0 flex-1 font-mono text-xs"
              aria-label={t('fileManager.path')}
              spellCheck={false}
              value={activeTab.inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onBlur={() => setCurrentPath(activeTab.inputPath)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setViewMode('browse')
                  setCurrentPath(activeTab.inputPath)
                }
              }}
            />
          </label>
        </div>

        <div className="flex w-full items-center gap-1.5">
          <button
            type="button"
            className={`panel-btn !h-7 !px-2.5 text-[11px] shrink-0 ${viewMode === 'browse' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
            onClick={() => setViewMode('browse')}
          >
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('fileManager.modeBrowse')}</span>
          </button>
          <button
            type="button"
            className={`panel-btn !h-7 !px-2.5 text-[11px] shrink-0 ${viewMode === 'cleanup' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
            onClick={() => setViewMode('cleanup')}
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('fileManager.modeCleanup')}</span>
          </button>
          {clipboard && clipboard.items.length > 0 ? (
            <button
              type="button"
              className="docker-secondary-btn shrink-0"
              title={t('fileManager.pasteHere')}
              aria-label={t('fileManager.pasteHere')}
              onClick={() => void handlePasteClipboard(activeTab.currentPath)}
            >
              <ClipboardPaste className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <ActionMenu label={t('fileManager.quickActions')} items={moreActions} compact />
            <button
              type="button"
              className="docker-icon-btn shrink-0"
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
              onClick={() => void loadDirectory(activeTab.currentPath, activeTabId)}
            >
              {activeTab.loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {viewMode === 'browse' ? (
          <div className="docker-search-wrap docker-search-wrap--mobile">
            <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
            <input
              id="file-manager-search-input"
              type="search"
              className="docker-search-input docker-search-input--mobile"
              aria-label={t('fileManager.searchFiles')}
              placeholder={t('fileManager.searchFiles')}
              value={activeTab.searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="docker-topbar docker-topbar--path">
      {fileInput}
      <div className="docker-topbar__left">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-0.5 shrink-0">
          <button
            type="button"
            className={`panel-btn !h-7 !px-2.5 text-[11px] ${viewMode === 'browse' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
            onClick={() => setViewMode('browse')}
          >
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('fileManager.modeBrowse')}</span>
          </button>
          <button
            type="button"
            className={`panel-btn !h-7 !px-2.5 text-[11px] ${viewMode === 'cleanup' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
            onClick={() => setViewMode('cleanup')}
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('fileManager.modeCleanup')}</span>
          </button>
        </div>

        <button
          type="button"
          className="docker-icon-btn"
          title={t('fileManager.parentDirectory')}
          aria-label={t('fileManager.parentDirectory')}
          disabled={!activeTab.data?.parent}
          onClick={() => {
            setViewMode('browse')
            if (activeTab.data?.parent) setCurrentPath(activeTab.data.parent)
          }}
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
              if (e.key === 'Enter') {
                setViewMode('browse')
                setCurrentPath(activeTab.inputPath)
              }
            }}
          />
        </label>
      </div>

      <div className="docker-topbar__right">
        {viewMode === 'browse' ? (
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
        ) : null}

        {clipboard && clipboard.items.length > 0 && viewMode === 'browse' ? (
          <button
            type="button"
            className="docker-secondary-btn"
            title={t('fileManager.pasteHere')}
            aria-label={t('fileManager.pasteHere')}
            onClick={() => void handlePasteClipboard(activeTab.currentPath)}
          >
            <ClipboardPaste className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">
              {t('fileManager.pasteCount', { count: clipboard.items.length })}
            </span>
          </button>
        ) : null}

        {isSuperadmin && rootAccess.enabled ? (
          <button
            type="button"
            className="docker-secondary-btn docker-secondary-btn--danger"
            disabled={rootAccessLoading}
            title={t('fileManager.closeRootAccessTitle')}
            aria-label={t('fileManager.closeRootAccessTitle')}
            onClick={handleRootAccessButton}
          >
            <Key className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">{t('fileManager.rootActive')}</span>
          </button>
        ) : null}

        {viewMode === 'browse' ? (
          <button
            type="button"
            className="docker-secondary-btn"
            title={t('fileManager.uploadTitle')}
            aria-label={t('fileManager.uploadTitle')}
            disabled={!!upload.upload}
            onClick={() => picker.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="docker-secondary-btn__text">{t('fileManager.upload')}</span>
          </button>
        ) : null}

        <ActionMenu label={t('fileManager.quickActions')} items={moreActions} />

        <button
          type="button"
          className="docker-icon-btn"
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
          onClick={() => void loadDirectory(activeTab.currentPath, activeTabId)}
        >
          {activeTab.loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}
