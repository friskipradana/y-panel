import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckSquare, Eraser, Folder, FolderOpen, File as FileIcon, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteFileCleanup, scanFileCleanup, type CleanupCategory, type CleanupItem, type CleanupScope } from '@/api/files'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { formatDate, formatSize } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

type CategoryFilter = 'all' | CleanupCategory

const CATEGORIES: CategoryFilter[] = ['all', 'cache', 'temp', 'logs', 'build', 'empty', 'large']

export function FileCleanupPanel({ fm }: { fm: FileManagerState }) {
  const { t, activeTab, activeTabId, isSuperadmin, setCurrentPath, setViewMode, loadDirectory } = fm
  const [scope, setScope] = useState<CleanupScope>('folder')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const scanQ = useQuery({
    queryKey: ['file-cleanup-scan', scope, activeTab.currentPath],
    queryFn: () => scanFileCleanup(activeTab.currentPath, scope),
  })

  const items = useMemo(() => scanQ.data?.items ?? [], [scanQ.data?.items])

  useEffect(() => {
    setSelected(new Set())
  }, [scanQ.dataUpdatedAt, scope, activeTab.currentPath])

  const countsByCat = useMemo(() => {
    const map: Record<string, number> = { all: items.length }
    for (const it of items) map[it.category] = (map[it.category] ?? 0) + 1
    return map
  }, [items])

  const visibleItems = useMemo(
    () => (category === 'all' ? items : items.filter((it) => it.category === category)),
    [items, category],
  )

  const selectedList = useMemo(() => items.filter((it) => selected.has(it.path)), [items, selected])
  const selectedBytes = useMemo(() => selectedList.reduce((acc, it) => acc + it.size, 0), [selectedList])
  const visibleBytes = useMemo(() => visibleItems.reduce((acc, it) => acc + it.size, 0), [visibleItems])

  const deleteMut = useMutation({
    mutationFn: (paths: string[]) => deleteFileCleanup(paths),
    onSuccess: (res) => {
      setSelected(new Set())
      if (res.deleted > 0) {
        toast.success(t('fileManager.cleanup.deletedToast', { count: res.deleted, size: formatSize(res.freedBytes) }))
      }
      if (res.failed.length > 0) {
        toast.warning(t('fileManager.cleanup.failedCountToast', { count: res.failed.length }))
      }
      void scanQ.refetch()
      void loadDirectory(activeTab.currentPath, activeTabId)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const confirmAndDelete = async (targets: CleanupItem[], allMode: boolean) => {
    if (targets.length === 0) return
    const bytes = targets.reduce((acc, it) => acc + it.size, 0)
    const ok = await alertLib.confirm(
      allMode ? t('fileManager.cleanup.deleteAllTitle') : t('fileManager.cleanup.deleteSelectedTitle'),
      t('fileManager.cleanup.deleteConfirmDesc', { count: targets.length, size: formatSize(bytes) }),
      t('fileManager.bulkDeleteConfirmAction'),
      t('common.cancel'),
      'warning',
      'file-manager',
    )
    if (ok) deleteMut.mutate(targets.map((it) => it.path))
  }

  const selectSafe = () => {
    setSelected(new Set(visibleItems.filter((it) => it.safety === 'safe').map((it) => it.path)))
  }

  const toggleAllVisible = (checked: boolean) => {
    setSelected(checked ? new Set(visibleItems.map((it) => it.path)) : new Set())
  }

  const toggleOne = (path: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(path)
      else next.delete(path)
      return next
    })
  }

  const revealParentFolder = (itemPath: string) => {
    const idx = itemPath.lastIndexOf('/')
    const parent = idx > 0 ? itemPath.slice(0, idx) : '/'
    setViewMode('browse')
    setCurrentPath(parent)
  }

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((it) => selected.has(it.path))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Scope & summary header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <button
            type="button"
            className={`panel-btn !h-7 !px-2.5 text-[11px] ${scope === 'folder' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
            onClick={() => setScope('folder')}
          >
            {t('fileManager.cleanup.scopeFolder')}
          </button>
          {isSuperadmin ? (
            <button
              type="button"
              className={`panel-btn !h-7 !px-2.5 text-[11px] ${scope === 'system' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
              onClick={() => setScope('system')}
            >
              {t('fileManager.cleanup.scopeSystem')}
            </button>
          ) : null}
          <span className="panel-mono truncate max-w-[260px] text-[11px] text-[var(--text-secondary)]" title={scanQ.data?.root || activeTab.currentPath}>
            {scanQ.data?.root || activeTab.currentPath}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-[var(--text-secondary)]">
            {t('fileManager.cleanup.foundSummary', {
              count: items.length,
              size: formatSize(scanQ.data?.totalBytes ?? 0),
            })}
          </span>
          <Badge tone="success" size="sm">
            {t('fileManager.cleanup.safeBadgeSummary', { size: formatSize(scanQ.data?.safeBytes ?? 0) })}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className={`h-3.5 w-3.5 ${scanQ.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />}
            disabled={scanQ.isFetching}
            onClick={() => void scanQ.refetch()}
          >
            {t('fileManager.cleanup.rescanBtn')}
          </Button>
        </div>
      </div>

      {/* Category filters & batch delete actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {CATEGORIES.map((cat) => {
            const count = countsByCat[cat] ?? 0
            if (cat !== 'all' && count === 0) return null
            return (
              <button
                key={cat}
                type="button"
                className={`panel-btn !h-7 !px-2 text-[11px] ${category === cat ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
                onClick={() => setCategory(cat)}
              >
                <span>{t(`fileManager.cleanup.cat.${cat}`)}</span>
                <span className="panel-mono opacity-75">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />}
            disabled={visibleItems.filter((it) => it.safety === 'safe').length === 0}
            onClick={selectSafe}
          >
            {t('fileManager.cleanup.selectSafeBtn')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<CheckSquare className="h-3.5 w-3.5" strokeWidth={1.75} />}
            disabled={visibleItems.length === 0}
            onClick={() => toggleAllVisible(!allVisibleSelected)}
          >
            {allVisibleSelected ? t('fileManager.cleanup.deselectAll') : t('fileManager.selectAll')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
            disabled={selectedList.length === 0 || deleteMut.isPending}
            loading={deleteMut.isPending}
            onClick={() => void confirmAndDelete(selectedList, false)}
          >
            {selectedList.length > 0
              ? t('fileManager.cleanup.deleteSelectedCount', { count: selectedList.length, size: formatSize(selectedBytes) })
              : t('fileManager.cleanup.deleteSelectedBtn')}
          </Button>
          <Button
            size="sm"
            variant="danger-soft"
            icon={<Eraser className="h-3.5 w-3.5" strokeWidth={1.75} />}
            disabled={visibleItems.length === 0 || deleteMut.isPending}
            onClick={() => void confirmAndDelete(visibleItems, true)}
          >
            {t('fileManager.cleanup.deleteAllBtn', { size: formatSize(visibleBytes) })}
          </Button>
        </div>
      </div>

      {/* Detected junk items list */}
      <ListTable
        variant="files-cleanup"
        empty={scanQ.isLoading || scanQ.isError || visibleItems.length === 0}
        columns={[
          {
            label: t('fileManager.selectAll'),
            node: (
              <Checkbox
                aria-label={t('fileManager.selectAll')}
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
              />
            ),
          },
          { label: t('fileManager.nameColumn') },
          { label: t('fileManager.cleanup.colCategory') },
          { label: t('fileManager.sizeColumn') },
          { label: t('fileManager.cleanup.colSafety') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={scanQ.isLoading}
          error={scanQ.isError}
          errorTitle={t('fileManager.cleanup.scanFailed')}
          errorHint={(scanQ.error as Error)?.message}
          loadingText={t('fileManager.cleanup.scanning')}
          empty={visibleItems.length === 0}
          emptyIcon={<Eraser />}
          emptyTitle={t('fileManager.cleanup.cleanEmptyTitle')}
        >
          {visibleItems.map((it) => {
            const isChecked = selected.has(it.path)
            return (
              <div
                key={it.path}
                className={`docker-row docker-row--files${isChecked ? ' docker-row--selected' : ''}`}
                onClick={() => toggleOne(it.path, !isChecked)}
              >
                <div className="docker-row__select">
                  <Checkbox
                    aria-label={it.name}
                    checked={isChecked}
                    onChange={(checked) => toggleOne(it.path, checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    {it.isDir ? <Folder className="h-3.5 w-3.5" /> : <FileIcon className="h-3.5 w-3.5" />}
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={it.name}>{it.name}</span>
                    <span className="docker-row__sub panel-mono" title={it.path}>{it.path}</span>
                    <span className="docker-row__meta">{it.reason} · {formatDate(it.modified)}</span>
                  </div>
                </div>
                <div className="docker-cell">
                  <Badge tone="neutral" size="sm">{t(`fileManager.cleanup.cat.${it.category}`)}</Badge>
                </div>
                <div className="docker-cell docker-cell--mono">{formatSize(it.size)}</div>
                <div className="docker-cell">
                  <Badge tone={it.safety === 'safe' ? 'success' : 'warning'} size="sm">
                    {it.safety === 'safe' ? t('fileManager.cleanup.safetySafe') : t('fileManager.cleanup.safetyCaution')}
                  </Badge>
                </div>
                <div className="docker-action-btns" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('fileManager.cleanup.openFolder')}
                    aria-label={t('fileManager.cleanup.openFolder')}
                    onClick={() => revealParentFolder(it.path)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    disabled={deleteMut.isPending}
                    onClick={() => void confirmAndDelete([it], false)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      <div className="docker-statusbar">
        <span>
          {t('fileManager.cleanup.scannedFooter', {
            scanned: scanQ.data?.scannedFiles ?? 0,
            selected: selectedList.length,
            size: formatSize(selectedBytes),
          })}
        </span>
      </div>
    </div>
  )
}
