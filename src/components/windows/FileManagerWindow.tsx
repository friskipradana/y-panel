import type { WindowState } from '@/types'
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useFileManager } from './file-manager/useFileManager'
import { useFileUpload } from './file-manager/useFileUpload'
import { FileUploadBar } from './file-manager/FileUploadBar'
import { FileTabsStrip } from './file-manager/FileTabsStrip'
import { FileToolbar } from './file-manager/FileToolbar'
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
    t,
  } = fm
  const upload = useFileUpload(fm)
  // files dragged in from the computer (a drag inside the window moves files and is handled by the list)
  const [dropping, setDropping] = useState(false)
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  return (
    <div
      ref={containerRef}
      className="panel-window docker-window-root relative select-none"
      onClick={() => setMenu(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, targetPath: activeTab.currentPath })
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDropping(false)
        void upload.start(Array.from(e.dataTransfer.files))
      }}
    >
      <FileTabsStrip fm={fm} />
      <FileToolbar fm={fm} upload={upload} />
      <FileList fm={fm} />
      <FileUploadBar upload={upload} />
      <FileStatusBar fm={fm} />
      <BulkActionsBar fm={fm} />
      <FileActionModal fm={fm} />
      <RootAccessModal fm={fm} />
      <FileContextMenu fm={fm} />
      {dropping ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)]">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--panel-primary-text)]">
            <Upload className="h-4 w-4" strokeWidth={1.75} />
            {t('fileManager.dropHere', { path: activeTab.currentPath })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
