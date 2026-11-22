import { FilePlus, FolderPlus, Edit2, Key, Trash, Archive, PackageOpen } from 'lucide-react'
import type { ListQuery } from '@/lib/listQuery'

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  mode: string
}

export interface DirResponse {
  path: string
  parent?: string
  contents: FileNode[]
  /** Rows that pass the search and every filter; All is how many the folder holds */
  total?: number
  all?: number
  /** column -> value -> count, over the rows the other columns' filters leave */
  facets?: Record<string, Record<string, number>>
}

export const formatSize = (size: number) => {
  if (size < 1024) return size + ' B'
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return (size / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]
}

// What kind of thing it is: its extension, or just "folder" / "file"
export function fileKind(item: FileNode, folderLabel: string, fileLabel: string) {
  if (item.isDir) return folderLabel
  const dot = item.name.lastIndexOf('.')
  return dot > 0 ? item.name.slice(dot).toLowerCase() : fileLabel
}

export const formatDate = (dateString: string) => {
  const d = new Date(dateString)
  return d.toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export type ModalType =
  | { type: 'delete'; item: FileNode }
  | { type: 'rename'; item: FileNode }
  | { type: 'chmod'; item: FileNode }
  | { type: 'compress'; item: FileNode }
  | { type: 'extract'; item: FileNode }
  | { type: 'mkdir' }
  | { type: 'touch' }

export interface FileManagerTab {
  id: string
  currentPath: string
  inputPath: string
  data: DirResponse | null
  loading: boolean
  /** The last read of this folder failed */
  failed: boolean
  /** The search, order and column filters the agent applies to the folder */
  query: ListQuery
  /** What is typed in the search box; the query follows it after a pause */
  searchText: string
}

// The icon of each dialog
export const MODAL_ICONS: Record<string, React.ReactNode> = {
  delete: <Trash />,
  rename: <Edit2 />,
  compress: <Archive />,
  extract: <PackageOpen />,
  mkdir: <FolderPlus />,
  touch: <FilePlus />,
  chmod: <Key />,
}

export const joinPath = (parent: string, child: string) => (parent === '/' ? `/${child}` : `${parent}/${child}`)

export function extractFileError(err: unknown, fallback: string): { status?: number; message: string } {
  const ax = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
  return {
    status: ax?.response?.status,
    message: ax?.response?.data?.error || ax?.message || fallback,
  }
}

export function downloadFileNode(item: FileNode) {
  // without an agent base (the panel serves its own page) the address starts at the root
  const base = (import.meta.env.VITE_AGENT_BASE as string | undefined) ?? ''
  const link = document.createElement('a')
  link.href = base + '/api/v1/files/read?path=' + encodeURIComponent(item.path)
  link.download = item.name
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function computeSafeMenuStyles(
  menu: { x: number; y: number; item?: FileNode; targetPath: string } | null,
  container: HTMLDivElement | null,
  hasClipboard: boolean,
): { top?: number; left?: number } {
  if (!menu || !container) return {}
  const getMenuHeight = () => {
    if (!menu.item) return 100
    let count = 0
    if (!menu.item.isDir) count += 1
    count += 2
    if (hasClipboard) count += 1
    count += 3
    if (/\.(zip|tar\.gz|tgz|tar)$/i.test(menu.item.name) && !menu.item.isDir) count += 1
    if (!menu.item.isDir) count += 1
    count += 1
    return 30 + 10 + 12 + count * 32
  }
  const rect = container.getBoundingClientRect()
  const menuWidth = 180
  const menuHeight = getMenuHeight()
  let top = menu.y - rect.top
  let left = menu.x - rect.left
  if (top + menuHeight > rect.height) top -= menuHeight
  if (left + menuWidth > rect.width) left -= menuWidth
  return { top: Math.max(0, top), left: Math.max(0, left) }
}

export function buildModalRequest(
  modal: ModalType,
  currentPath: string,
  modalInput: string,
  modalPathInput: string,
  chmodMode: string,
  chmodRecursive: boolean,
  t: (key: string) => string,
): { reqUrl: string; payload: Record<string, unknown> } {
  if (modal.type === 'delete') return { reqUrl: '/api/v1/files/delete', payload: { path: modal.item.path } }
  if (modal.type === 'rename') {
    if (!modalInput) throw new Error(t('fileManager.errorTargetNameRequired'))
    return { reqUrl: '/api/v1/files/rename', payload: { oldPath: modal.item.path, newPath: joinPath(currentPath, modalInput) } }
  }
  if (modal.type === 'mkdir') {
    if (!modalInput) throw new Error(t('fileManager.errorFolderNameRequired'))
    return { reqUrl: '/api/v1/files/mkdir', payload: { path: joinPath(currentPath, modalInput) } }
  }
  if (modal.type === 'touch') {
    if (!modalInput) throw new Error(t('fileManager.errorFileNameRequired'))
    return { reqUrl: '/api/v1/files/touch', payload: { path: joinPath(currentPath, modalInput) } }
  }
  if (modal.type === 'compress') {
    if (!modalInput) throw new Error(t('fileManager.errorArchiveNameRequired'))
    return { reqUrl: '/api/v1/files/compress', payload: { target: modal.item.path, destName: joinPath(currentPath, modalInput) } }
  }
  if (modal.type === 'extract') {
    if (!modalPathInput) throw new Error(t('fileManager.errorExtractDirectoryRequired'))
    if (!modalInput) throw new Error(t('fileManager.errorExtractFolderRequired'))
    return { reqUrl: '/api/v1/files/extract', payload: { source: modal.item.path, dest: joinPath(modalPathInput, modalInput) } }
  }
  const numericMode = parseInt(chmodMode, 8)
  if (isNaN(numericMode)) throw new Error(t('fileManager.errorInvalidOctal'))
  return { reqUrl: '/api/v1/files/chmod', payload: { path: modal.item.path, mode: numericMode, recursive: chmodRecursive } }
}
