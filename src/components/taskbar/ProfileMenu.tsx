import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, LogOut, Moon, Palette, Sun, User } from 'lucide-react'
import { useThemeStore, WALLPAPERS, type WallpaperKey } from '@/store/themeStore'

interface ProfileMenuProps {
  username?: string
  onLogout: () => void
  loading?: boolean
}

export function ProfileMenu({ username, onLogout, loading }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { mode, wallpaper, toggleMode, setWallpaper, setCustomImage } = useThemeStore()
  const isDark = mode === 'dark'

  const handleDocMouseDown = (e: MouseEvent) => {
    const target = e.target as Node
    if (btnRef.current?.contains(target)) return
    if (menuRef.current?.contains(target)) return
    setOpen(false)
    window.removeEventListener('mousedown', handleDocMouseDown, true)
  }

  const openMenu = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    window.addEventListener('mousedown', handleDocMouseDown, true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (dataUrl) setCustomImage(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const dropdown = open ? createPortal(
    <div ref={menuRef} className="profile-menu">
      <div className="profile-menu-section flex items-center gap-3">
        <div className="profile-avatar">{(username ?? 'A').charAt(0).toUpperCase()}</div>
        <div>
          <div className="profile-name">{username ?? 'Admin'}</div>
          <div className="profile-role">Administrator</div>
        </div>
      </div>

      <div className="profile-menu-section">
        <button className="profile-menu-btn" onClick={toggleMode}>
          {isDark ? <Sun size={14} color="#fbbf24" /> : <Moon size={14} color="#6366f1" />}
          <span>{isDark ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}</span>
        </button>
      </div>

      <div className="profile-menu-section">
        <div className="profile-section-label">
          <Palette size={11} />
          Wallpaper
        </div>

        <div className="wallpaper-grid">
          {(Object.entries(WALLPAPERS) as [Exclude<WallpaperKey, 'custom'>, typeof WALLPAPERS[Exclude<WallpaperKey, 'custom'>]][]).map(([key, val]) => {
            const background = isDark ? (val.dark ?? val.light) : val.light
            return (
              <button
                key={key}
                title={val.label}
                className={`wallpaper-swatch ${wallpaper === key ? 'active' : ''}`}
                onClick={() => setWallpaper(key)}
                style={{ ['--swatch-bg' as string]: background } as React.CSSProperties}
              >
                <span className="wallpaper-swatch-label">{val.label}</span>
              </button>
            )
          })}

          {wallpaper === 'custom' ? (
            <button
              title="Ganti gambar"
              className="wallpaper-swatch active bg-[image:var(--custom-preview,none)] bg-cover bg-center"
              onClick={() => fileRef.current?.click()}
            >
              <span className="wallpaper-swatch-label">Custom</span>
            </button>
          ) : (
            <button
              title="Upload gambar"
              className="wallpaper-upload-btn"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={14} />
              <span>Upload</span>
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="profile-menu-section">
        <button
          className="profile-menu-btn profile-menu-btn-danger"
          onClick={() => {
            setOpen(false)
            onLogout()
          }}
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        id="taskbar-profile"
        className="profile-btn"
        onClick={openMenu}
        disabled={loading}
      >
        <User size={13} />
        <span>{username ?? 'Profile'}</span>
      </button>

      {dropdown}
    </>
  )
}
