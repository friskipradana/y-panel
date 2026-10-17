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
