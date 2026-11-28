import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Eraser, File as FileIcon, Folder, FolderOpen, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteFileCleanup, scanFileCleanup, type CleanupCategory, type CleanupItem, type CleanupSafety, type CleanupScope } from '@/api/files'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { type ColumnSort } from '@/components/ui/ColumnMenu'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { alertLib } from '@/lib/alert'
import { formatDate, formatSize } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

type CategoryFilter = 'all' | CleanupCategory
type SortField = 'name' | 'category' | 'size' | 'safety'

const CATEGORIES: CategoryFilter[] = ['all', 'cache', 'temp', 'logs', 'build', 'empty', 'large']

// Single-toolbar Storage Cleanup view matching Reneo list-window standards
export function FileCleanupPanel({ fm }: { fm: FileManagerState }) {
  const isMobile = useIsMobileLayout()
  const { t, activeTab, activeTabId, isSuperadmin, setCurrentPath, setViewMode, loadDirectory } = fm
  const [scope, setScope] = useState<CleanupScope>('folder')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [safetyFilter, setSafetyFilter] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortField | null>('size')
  const [sortDesc, setSortDesc] = useState(true)
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

  const countsBySafety = useMemo(() => {
    const base = category === 'all' ? items : items.filter((it) => it.category === category)
    const map: Record<CleanupSafety, number> = { safe: 0, caution: 0 }
    for (const it of base) map[it.safety]++
    return map
  }, [items, category])

  const visibleItems = useMemo(() => {
    let list = category === 'all' ? items : items.filter((it) => it.category === category)
    if (safetyFilter.length > 0) {
      const allowed = new Set(safetyFilter)
      list = list.filter((it) => allowed.has(it.safety))
    }
    if (!sortBy) return list
    const dir = sortDesc ? -1 : 1
    return [...list].sort((a, b) => {
      if (sortBy === 'size') return (a.size - b.size) * dir || a.name.localeCompare(b.name)
      if (sortBy === 'name') return a.name.localeCompare(b.name) * dir
      if (sortBy === 'category') return a.category.localeCompare(b.category) * dir || b.size - a.size
      const rank = (s: CleanupSafety) => (s === 'safe' ? 0 : 1)
      return (rank(a.safety) - rank(b.safety)) * dir || b.size - a.size
    })
  }, [items, category, safetyFilter, sortBy, sortDesc])

  const selectedList = useMemo(() => visibleItems.filter((it) => selected.has(it.path)), [visibleItems, selected])
  const selectedBytes = useMemo(() => selectedList.reduce((acc, it) => acc + it.size, 0), [selectedList])
  const visibleBytes = useMemo(() => visibleItems.reduce((acc, it) => acc + it.size, 0), [visibleItems])
  const safeVisible = useMemo(() => visibleItems.filter((it) => it.safety === 'safe'), [visibleItems])

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

  const sortCol = (field: SortField): ColumnSort => ({
    direction: sortBy === field ? (sortDesc ? 'desc' : 'asc') : null,
    onOrder: (desc) => {
      setSortBy(field)
      setSortDesc(desc)
    },
    onClear: () => setSortBy(null),
  })

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((it) => selected.has(it.path))
  const isSpinning = scanQ.isFetching && !scanQ.isLoading

  const modeItems = [
    { key: 'browse', label: t('fileManager.modeBrowse') },
    { key: 'cleanup', label: t('fileManager.modeCleanup') },
  ]

  const scopeItems = [
    { key: 'folder', label: t('fileManager.cleanup.scopeFolder') },
    ...(isSuperadmin ? [{ key: 'system', label: t('fileManager.cleanup.scopeSystem') }] : []),
  ]

  const categoryItems = CATEGORIES.filter((cat) => cat === 'all' || (countsByCat[cat] ?? 0) > 0).map((cat) => ({
    key: cat,
    label: t(`fileManager.cleanup.cat.${cat}`),
    count: countsByCat[cat] ?? 0,
  }))

  const bulkMenuItems: ActionMenuItem[] = [
    {
      key: 'select-safe',
      label: `${t('fileManager.cleanup.selectSafeBtn')} (${formatSize(safeVisible.reduce((a, b) => a + b.size, 0))})`,
      disabled: safeVisible.length === 0,
      onSelect: () => setSelected(new Set(safeVisible.map((it) => it.path))),
    },
    {
      key: 'select-all',
      label: allVisibleSelected ? t('fileManager.cleanup.deselectAll') : t('fileManager.selectAll'),
      disabled: visibleItems.length === 0,
      onSelect: () => toggleAllVisible(!allVisibleSelected),
    },
    ...(selectedList.length > 0
      ? [
          {
            key: 'delete-all',
            label: t('fileManager.cleanup.deleteAllBtn', { size: formatSize(visibleBytes) }),
            tone: 'danger' as const,
            dividerBefore: true,
            disabled: visibleItems.length === 0 || deleteMut.isPending,
            onSelect: () => void confirmAndDelete(visibleItems, true),
          },
        ]
      : []),
  ]

  const primaryDeleteLabel =
    selectedList.length > 0
      ? t('fileManager.cleanup.deleteSelectedCount', { count: selectedList.length, size: formatSize(selectedBytes) })
      : t('fileManager.cleanup.deleteAllBtn', { size: formatSize(visibleBytes) })

  const primaryDeleteAction = () =>
    selectedList.length > 0
      ? void confirmAndDelete(selectedList, false)
      : void confirmAndDelete(visibleItems, true)

  const primaryDeleteDisabled = visibleItems.length === 0 || deleteMut.isPending

  const filterControls = (
    <>
      <FilterMenu label={t('fileManager.modeCleanup')} value="cleanup" onChange={(v) => setViewMode(v as 'browse' | 'cleanup')} items={modeItems} />
      {isSuperadmin ? (
        <FilterMenu label={t('fileManager.cleanup.scopeFolder')} value={scope} onChange={(v) => setScope(v as CleanupScope)} items={scopeItems} />
      ) : null}
      <FilterMenu label={t('fileManager.cleanup.colCategory')} value={category} onChange={(v) => setCategory(v as CategoryFilter)} items={categoryItems} />
    </>
  )

  const deleteButton = (
    <button
      type="button"
      className={`docker-secondary-btn docker-secondary-btn--danger${isMobile ? ' flex-1 justify-center' : ''}`}
      disabled={primaryDeleteDisabled}
      onClick={primaryDeleteAction}
    >
      {deleteMut.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
      <span>{primaryDeleteLabel}</span>
    </button>
  )

  const refreshButton = (
    <button
      type="button"
      className={`docker-icon-btn${isMobile ? ' docker-icon-btn--mobile shrink-0' : ''}`}
      title={t('fileManager.cleanup.rescanBtn')}
      aria-label={t('fileManager.cleanup.rescanBtn')}
      onClick={() => void scanQ.refetch()}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
    </button>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">{filterControls}</div>
          <div className="docker-topbar__mobile-row">
            {deleteButton}
            <ActionMenu label={t('fileManager.quickActions')} items={bulkMenuItems} size="md" variant="outline" />
            {refreshButton}
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">{filterControls}</div>
          <div className="docker-topbar__right">
            {deleteButton}
            <ActionMenu label={t('fileManager.quickActions')} items={bulkMenuItems} size="md" variant="outline" />
            {refreshButton}
          </div>
        </div>
      )}

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
          { label: t('fileManager.nameColumn'), key: 'name', sort: sortCol('name') },
          { label: t('fileManager.cleanup.colCategory'), key: 'category', sort: sortCol('category') },
          { label: t('fileManager.sizeColumn'), key: 'size', sort: sortCol('size') },
          {
            label: t('fileManager.cleanup.colSafety'),
            key: 'safety',
            sort: sortCol('safety'),
            filter: {
              selected: safetyFilter,
              onChange: setSafetyFilter,
              options: [
                { value: 'safe', label: t('fileManager.cleanup.safetySafe'), count: countsBySafety.safe },
                { value: 'caution', label: t('fileManager.cleanup.safetyCaution'), count: countsBySafety.caution },
              ],
            },
          },
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

      <div className="docker-statusbar items-center gap-3">
        <span className="truncate">
          {t('fileManager.cleanup.foundSummary', {
            count: visibleItems.length,
            size: formatSize(visibleBytes),
          })}
          {' · '}
          {t('fileManager.cleanup.safeBadgeSummary', { size: formatSize(scanQ.data?.safeBytes ?? 0) })}
        </span>
        <span className="panel-mono truncate max-w-[260px]" title={scanQ.data?.root || activeTab.currentPath}>
          {scanQ.data?.root || activeTab.currentPath}
        </span>
      </div>
    </div>
  )
}
