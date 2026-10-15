import { CornerLeftUp, Loader2, FilePlus, FolderPlus, Key, RefreshCw } from 'lucide-react'
import type { FileManagerState } from './useFileManager'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'

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
    openModal,
    handleRootAccessButton,
  } = fm

  return (
    <div className="file-manager-toolbar panel-toolbar--flat border-b border-[var(--win-border)] bg-[var(--win-bar)] px-4 py-2 mobile:flex-wrap mobile:gap-y-2">
      <IconButton
        disabled={!activeTab.data?.parent}
        onClick={() => { if (activeTab.data?.parent) setCurrentPath(activeTab.data.parent) }} label={t('fileManager.parentDirectory')}
      >
        <CornerLeftUp size={16} />
      </IconButton>
      <div className="file-manager-path flex min-w-0 flex-1 items-center gap-2 mobile:order-last mobile:basis-full">
        <span className="hidden select-none text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] sm:inline">{t('fileManager.path')}</span>
        <TextInput mono className="h-[34px] min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0"
          value={activeTab.inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onBlur={() => setCurrentPath(activeTab.inputPath)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setCurrentPath(activeTab.inputPath)
          }}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isSuperadmin ? (
          <button
            type="button"
            onClick={handleRootAccessButton}
            disabled={rootAccessLoading}
            className={`panel-btn ${rootAccess.enabled ? 'panel-btn--danger-soft' : 'panel-btn--ghost'} px-3 py-2 text-[12px]`}
            title={rootAccess.enabled ? t('fileManager.closeRootAccessTitle') : t('fileManager.openRootAccessTitle')}
          >
            <Key size={14} />
            <span className="mobile:hidden">{rootAccess.enabled ? t('fileManager.rootActive') : t('fileManager.rootAccess')}</span>
          </button>
        ) : null}
        <Button
          onClick={() => openModal({ type: 'touch' })} variant="ghost" className="px-3 py-2 text-[12px]"
          title={t('fileManager.newFile')}
        >
          <FilePlus size={14} className="text-[var(--panel-success-text)]" />
          <span className="hidden md:inline">{t('fileManager.file')}</span>
        </Button>
        <Button
          onClick={() => openModal({ type: 'mkdir' })} variant="ghost" className="px-3 py-2 text-[12px]"
          title={t('fileManager.newFolder')}
        >
          <FolderPlus size={14} className="text-[var(--panel-primary-text)]" />
          <span className="hidden md:inline">{t('fileManager.folder')}</span>
        </Button>

        <IconButton
          onClick={() => loadDirectory(activeTab.currentPath, activeTabId)} label={t('common.refresh')}
        >
          {activeTab.loading ? <Loader2 size={15} className="animate-spin text-[var(--panel-primary-text)]" /> : <RefreshCw size={15} />}
        </IconButton>
      </div>
    </div>
  )
}
