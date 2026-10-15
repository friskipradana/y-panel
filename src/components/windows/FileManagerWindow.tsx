import type { WindowState } from '@/types'
import { useFileManager } from './file-manager/useFileManager'
import { FileTabsStrip } from './file-manager/FileTabsStrip'
import { FileToolbar } from './file-manager/FileToolbar'
import { FileTableHeader } from './file-manager/FileTableHeader'
import { FileList } from './file-manager/FileList'
import { FileStatusBar } from './file-manager/FileStatusBar'
import { BulkActionsBar } from './file-manager/BulkActionsBar'
import { FileActionModal } from './file-manager/FileActionModal'
import { RootAccessModal } from './file-manager/RootAccessModal'
import { FileContextMenu } from './file-manager/FileContextMenu'

export function FileManagerWindow({ win, authenticated }: { win: WindowState, authenticated?: boolean }) {
  const fm = useFileManager({ win, authenticated })
  const {
    activeTab,
    setMenu,
    containerRef,
  } = fm

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-[var(--win-content-bg)] text-[var(--text-secondary)] relative select-none"
      style={{ background: 'var(--win-bg)' }}
      onClick={() => setMenu(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, targetPath: activeTab.currentPath })
      }}
    >
      <FileTabsStrip fm={fm} />
      <FileToolbar fm={fm} />
      <FileTableHeader fm={fm} />
      <FileList fm={fm} />
      <FileStatusBar fm={fm} />
      <BulkActionsBar fm={fm} />
      <FileActionModal fm={fm} />
      <RootAccessModal fm={fm} />
      <FileContextMenu fm={fm} />
    </div>
  )
}
