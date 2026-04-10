import { useState, useCallback, useEffect } from 'react'
import { Folder, File, ChevronRight, CornerLeftUp, Loader2 } from 'lucide-react'
import axios from 'axios'
import { alertLib } from '@/lib/alert'
import { useWindowStore } from '@/store/windowStore'

interface FileNode {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  mode: string
}

interface DirResponse {
  path: string
  parent?: string
  contents: FileNode[]
}

const formatSize = (size: number) => {
  if (size < 1024) return size + ' B'
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return (size / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]
}

const formatDate = (dateString: string) => {
  const d = new Date(dateString)
  return d.toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function FileManagerWindow() {
  const { openWindow } = useWindowStore()
  const [currentPath, setCurrentPath] = useState('/')
  const [data, setData] = useState<DirResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // Context Menu State
  const [menu, setMenu] = useState<{ x: number; y: number; item: FileNode } | null>(null)

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true)
    setMenu(null)
    try {
      const res = await axios.get<DirResponse>('/api/v1/files?path=' + encodeURIComponent(path), {
        baseURL: import.meta.env.VITE_AGENT_BASE,
        withCredentials: true
      })
      setData({ ...res.data, contents: res.data.contents || [] })
      setCurrentPath(res.data.path)
    } catch (err: any) {
      alertLib.fire('Akses Ditolak', err?.response?.data?.error || 'Gagal membaca direktori.', 'error', 'file-manager')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDirectory(currentPath)
  }, [loadDirectory, currentPath])

  // Context Menu Actions
  const handleEdit = (item: FileNode) => {
    setMenu(null)
    openWindow('file-editor')
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('panel:open-file', { detail: { path: item.path, name: item.name } }))
    }, 150)
  }

  const handleDownload = (item: FileNode) => {
    setMenu(null)
    const url = import.meta.env.VITE_AGENT_BASE + '/api/v1/files/read?path=' + encodeURIComponent(item.path)
    window.open(url, '_blank')
  }

  const handleDelete = (item: FileNode) => {
    setMenu(null)
    alertLib.confirm(
      'Hapus?',
      `Yakin ingin menghapus <strong>${item.name}</strong> secara permanen?`,
      'Hapus', 'Batal', 'warning', 'file-manager'
    ).then(async (confirmed) => {
      if (!confirmed) return
      try {
        await axios.post('/api/v1/files/delete', { path: item.path }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
        loadDirectory(currentPath)
      } catch (err: any) {
        alertLib.fire('Gagal Menghapus', err?.response?.data?.error || 'Terjadi kesalahan.', 'error', 'file-manager')
      }
    })
  }

  const handleRename = (item: FileNode) => {
    setMenu(null)
    const newName = prompt(`Ubah nama untuk ${item.name}:`, item.name)
    if (!newName || newName === item.name) return
    const newPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`
    axios.post('/api/v1/files/rename', { oldPath: item.path, newPath }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
      .then(() => loadDirectory(currentPath))
      .catch((err: any) => alertLib.fire('Gagal Edit', err?.response?.data?.error || 'Terjadi kesalahan.', 'error', 'file-manager'))
  }

  const handleMkdir = () => {
    const newName = prompt('Nama Folder Baru:')
    if (!newName) return
    const newPath = currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`
    axios.post('/api/v1/files/mkdir', { path: newPath }, { baseURL: import.meta.env.VITE_AGENT_BASE, withCredentials: true })
      .then(() => loadDirectory(currentPath))
      .catch((err: any) => alertLib.fire('Gagal Buat', err?.response?.data?.error || 'Terjadi kesalahan.', 'error', 'file-manager'))
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 relative" style={{ background: 'var(--win-bg)' }} onClick={() => setMenu(null)}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 p-2 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border-b border-white/5 bg-slate-100/5 backdrop-blur-md">
        <button
          disabled={!data?.parent}
          onClick={() => { if (data?.parent) setCurrentPath(data.parent) }}
          className="p-1.5 rounded-md hover:bg-slate-200/50 disabled:opacity-30 transition text-slate-600"
          title="Ke direktori induk"
        >
          <CornerLeftUp size={16} />
        </button>
        <div className="flex-1 bg-white/60 border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-inner overflow-hidden">
          <span className="text-sm text-slate-500 hidden sm:inline">Path:</span>
          <input
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-700"
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void loadDirectory(currentPath)
              }
            }}
          />
        </div>
        <button
          onClick={handleMkdir}
          className="p-1.5 rounded-md hover:bg-slate-200/50 transition text-sky-600 font-medium text-xs flex items-center gap-1"
          title="New Folder"
        >
          + Folder
        </button>
        <button
          onClick={() => loadDirectory(currentPath)}
          className="p-1.5 rounded-md hover:bg-slate-200/50 transition text-slate-600"
          title="Refresh"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* ── Table Header ── */}
      <div className="grid grid-cols-[1fr_100px_160px] gap-4 px-6 py-2 border-b border-white/5 bg-slate-50/50 text-xs font-semibold text-slate-500 sticky top-0">
        <div>Nama</div>
        <div>Ukuran</div>
        <div>Terakhir Diubah</div>
      </div>

      {/* ── File List ── */}
      <div className="flex-1 overflow-y-auto p-2" onContextMenu={(e) => e.preventDefault()}>
        {loading && !data && (
          <div className="flex justify-center p-8 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
        {data && (data.contents || []).length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <Folder size={48} className="mb-2 opacity-30" />
            <p className="text-sm font-medium">Folder ini kosong</p>
          </div>
        )}
        {data && (data.contents || []).map((item) => (
          <div
            key={item.path}
            draggable={!item.isDir}
            onDragStart={(e) => {
              if (item.isDir) return
              e.dataTransfer.setData('application/x-ui-panel-file', JSON.stringify({ path: item.path, name: item.name }))
              e.dataTransfer.effectAllowed = 'copyMove'
            }}
            className="grid grid-cols-[1fr_100px_160px] gap-4 px-4 py-2 hover:bg-black/5 rounded-lg cursor-pointer transition items-center group relative select-none"
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.pageX, y: e.pageY, item })
            }}
            onDoubleClick={() => {
              if (item.isDir) {
                setCurrentPath(item.path)
              } else {
                handleEdit(item)
              }
            }}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              {item.isDir ? <Folder size={18} className="text-sky-500 fill-sky-500/20" /> : <File size={18} className="text-slate-400" />}
              <span className="text-sm font-medium text-slate-700 truncate group-hover:text-sky-600">{item.name}</span>
            </div>
            <div className="text-xs text-slate-500 p-1">
              {item.isDir ? '--' : formatSize(item.size)}
            </div>
            <div className="text-xs text-slate-400 p-1">
              {formatDate(item.modified)}
            </div>
          </div>
        ))}
      </div>
      
      {/* ── Status Bar ── */}
      <div className="px-4 py-2 bg-slate-100/50 border-t border-white/5 text-[11px] text-slate-500 flex justify-between">
        <span>{data ? `${(data.contents || []).length} item(s)` : 'Memuat...'}</span>
        <span>Administrator Access</span>
      </div>

      {/* ── Context Menu ── */}
      {menu && (
        <div
          className="fixed bg-white border border-slate-200 shadow-xl rounded-lg py-1 z-50 text-sm font-medium min-w-[140px]"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-100 mb-1 truncate">{menu.item.name}</div>
          {!menu.item.isDir && (
            <button className="w-full text-left px-4 py-1.5 hover:bg-sky-50 text-slate-700 font-medium" onClick={() => handleEdit(menu.item)}>
              Edit Code
            </button>
          )}
          <button className="w-full text-left px-4 py-1.5 hover:bg-sky-50 text-slate-700 font-medium" onClick={() => handleRename(menu.item)}>
            Rename
          </button>
          {!menu.item.isDir && (
            <button className="w-full text-left px-4 py-1.5 hover:bg-sky-50 text-slate-700 font-medium" onClick={() => handleDownload(menu.item)}>
              Download (Open)
            </button>
          )}
          <div className="border-t border-slate-100 my-1"></div>
          <button className="w-full text-left px-4 py-1.5 hover:bg-red-50 text-red-600 font-medium" onClick={() => handleDelete(menu.item)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
