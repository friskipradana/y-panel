import { Eraser, Eye, EyeOff } from 'lucide-react'
import { formatSize } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

// Folder summary bar: item count, total visible file size, hidden toggle, quick cleanup shortcut
export function FileStatusBar({ fm }: { fm: FileManagerState }) {
  const { t, activeTab, narrowed, showHidden, setShowHidden, setViewMode } = fm
  const data = activeTab.data
  const rawContents = data?.contents || []
  const visible = showHidden || activeTab.query.q ? rawContents : rawContents.filter((it) => !it.name.startsWith('.'))
  const shown = visible.length
  const totalBytes = visible.reduce((acc, it) => acc + (it.isDir ? 0 : it.size), 0)

  return (
    <div className="docker-statusbar flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span>
          {!data
            ? t('fileManager.loadingObjects')
            : narrowed
              ? t('fileManager.itemCountOf', { shown, total: data.all ?? shown })
              : t('fileManager.itemCount', { count: shown })}
        </span>
        {data && totalBytes > 0 ? (
          <span className="panel-mono opacity-80">· {formatSize(totalBytes)}</span>
        ) : null}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
          onClick={() => setShowHidden((v) => !v)}
        >
          {showHidden ? <Eye className="h-3 w-3" strokeWidth={1.75} /> : <EyeOff className="h-3 w-3" strokeWidth={1.75} />}
          <span>{showHidden ? t('fileManager.hiddenShown') : t('fileManager.hiddenHidden')}</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--panel-primary-text)] hover:underline cursor-pointer"
          onClick={() => setViewMode('cleanup')}
        >
          <Eraser className="h-3 w-3" strokeWidth={1.75} />
          <span>{t('fileManager.scanJunkShortcut')}</span>
        </button>
      </div>
    </div>
  )
}
