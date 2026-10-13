import { FilePlus, FolderPlus, Edit2, Key, Trash, Archive, PackageOpen } from 'lucide-react'

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
}

export const formatSize = (size: number) => {
  if (size < 1024) return size + ' B'
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return (size / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]
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
}

// Constants for Modal Configuration
export const MODAL_CONFIGS: Record<string, { icon: React.ReactNode; confirmBtn: string }> = {
  delete: {
    icon: <Trash className="text-[var(--panel-danger-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-danger-bg)] shadow-[var(--file-manager-confirm-danger-shadow)] hover:bg-[var(--file-manager-confirm-danger-hover)]',
  },
  rename: {
    icon: <Edit2 className="text-[var(--panel-primary-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  compress: {
    icon: <Archive className="text-[var(--panel-warning-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  extract: {
    icon: <PackageOpen className="text-[var(--panel-primary-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  mkdir: {
    icon: <FolderPlus className="text-[var(--panel-success-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  touch: {
    icon: <FilePlus className="text-[var(--panel-success-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  },
  chmod: {
    icon: <Key className="text-[var(--panel-warning-text)]" size={32} />,
    confirmBtn: 'bg-[var(--file-manager-confirm-primary-bg)] shadow-[var(--file-manager-confirm-primary-shadow)] hover:bg-[var(--file-manager-confirm-primary-hover)]',
  }
}
