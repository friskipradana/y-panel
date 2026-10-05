import type { AppShortcut } from '@/types'
import { useWindowStore } from '@/store/windowStore'
import { useThemeStore } from '@/store/themeStore'
import { AppIcon } from '@/components/common/AppIcon'

interface Props {
  app: AppShortcut
}

export function DesktopIcon({ app }: Props) {
  const { openWindow } = useWindowStore()
  const desktopIconStyle = useThemeStore((s) => s.desktopIconStyle)
  const isPlain = desktopIconStyle === 'plain'

  const handleClick = () => {
    if (app.url) {
      window.open(app.url, '_blank')
    } else if (app.windowId) {
      openWindow(app.windowId)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex w-[76px] flex-col items-center gap-1.5 rounded-xl p-2 transition-all duration-200 hover:bg-white/10 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 select-none cursor-pointer"
    >
      <div
        className={`flex h-12 w-12 items-center justify-center transition-all duration-200 group-hover:scale-110 ${
          isPlain
            ? 'filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]'
            : 'rounded-2xl bg-black/20 backdrop-blur-md border border-white/10 shadow-lg shadow-black/20 group-hover:shadow-xl group-hover:border-white/20'
        }`}
      >
        <AppIcon kind={app.windowId || app.id} size={isPlain ? 34 : 28} />
      </div>
      <span className="max-w-[72px] truncate text-center text-[11px] font-medium tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {app.label}
      </span>
    </button>
  )
}
