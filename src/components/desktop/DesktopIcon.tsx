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
  const desktopIconSize = useThemeStore((s) => s.desktopIconSize)

  const isPlain = desktopIconStyle === 'plain'

  const handleClick = () => {
    if (app.url) {
      window.open(app.url, '_blank')
    } else if (app.windowId) {
      openWindow(app.windowId)
    }
  }

  const sizeConfig = {
    small: {
      btnWidth: 'w-[66px]',
      boxSize: 'h-10 w-10 rounded-xl',
      iconSize: isPlain ? 26 : 22,
      textSize: 'text-[10.5px]',
      maxTextWidth: 'max-w-[62px]',
    },
    medium: {
      btnWidth: 'w-[76px]',
      boxSize: 'h-12 w-12 rounded-2xl',
      iconSize: isPlain ? 34 : 28,
      textSize: 'text-[11px]',
      maxTextWidth: 'max-w-[72px]',
    },
    large: {
      btnWidth: 'w-[88px]',
      boxSize: 'h-14 w-14 rounded-2xl',
      iconSize: isPlain ? 42 : 34,
      textSize: 'text-[12px]',
      maxTextWidth: 'max-w-[82px]',
    },
  }[desktopIconSize] || {
    btnWidth: 'w-[66px]',
    boxSize: 'h-10 w-10 rounded-xl',
    iconSize: isPlain ? 26 : 22,
    textSize: 'text-[10.5px]',
    maxTextWidth: 'max-w-[62px]',
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group flex ${sizeConfig.btnWidth} flex-col items-center gap-1.5 rounded-xl p-1.5 active:scale-95 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 select-none cursor-pointer`}
    >
      <div
        className={`flex ${sizeConfig.boxSize} items-center justify-center ${
          isPlain
            ? 'filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]'
            : 'bg-black/20 backdrop-blur-md border border-white/10 shadow-lg shadow-black/20 group-hover:border-white/20 group-hover:shadow-xl'
        }`}
      >
        <AppIcon kind={app.windowId || app.id} size={sizeConfig.iconSize} />
      </div>
      <span className={`${sizeConfig.maxTextWidth} truncate text-center ${sizeConfig.textSize} font-medium tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
        {app.label}
      </span>
    </button>
  )
}
