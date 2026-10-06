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
  const desktopIconFontSize = useThemeStore((s) => s.desktopIconFontSize)
  const desktopIconFontWeight = useThemeStore((s) => s.desktopIconFontWeight)
  const desktopIconShadow = useThemeStore((s) => s.desktopIconShadow)
  const mode = useThemeStore((s) => s.mode)

  const isPlain = desktopIconStyle === 'plain'
  const isDark = mode === 'dark'

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
      iconSize: isPlain ? 28 : 22,
      maxTextWidth: 'max-w-[62px]',
    },
    medium: {
      btnWidth: 'w-[76px]',
      boxSize: 'h-12 w-12 rounded-2xl',
      iconSize: isPlain ? 34 : 28,
      maxTextWidth: 'max-w-[72px]',
    },
    large: {
      btnWidth: 'w-[88px]',
      boxSize: 'h-14 w-14 rounded-2xl',
      iconSize: isPlain ? 42 : 34,
      maxTextWidth: 'max-w-[82px]',
    },
  }[desktopIconSize] || {
    btnWidth: 'w-[66px]',
    boxSize: 'h-10 w-10 rounded-xl',
    iconSize: isPlain ? 28 : 22,
    maxTextWidth: 'max-w-[62px]',
  }

  const textSizeClass = {
    small: 'text-[10px]',
    medium: 'text-[11px]',
    large: 'text-[12.5px]',
  }[desktopIconFontSize] || 'text-[11px]'

  const fontWeightClass = {
    normal: 'font-normal',
    medium: 'font-medium',
    bold: 'font-bold',
  }[desktopIconFontWeight] || 'font-medium'

  const shadowClass = desktopIconShadow
    ? isDark
      ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
      : 'drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]'
    : ''

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group flex ${sizeConfig.btnWidth} flex-col items-center gap-1 rounded-xl p-1.5 active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--panel-primary-solid)] select-none cursor-pointer transition-colors duration-150`}
    >
      <div
        className={`flex ${sizeConfig.boxSize} items-center justify-center transition-all duration-150 ${
          isPlain
            ? 'group-hover:scale-105'
            : isDark
              ? 'bg-black/25 backdrop-blur-md border border-white/10 shadow-md shadow-black/20 group-hover:border-white/25 group-hover:shadow-lg'
              : 'bg-white/50 backdrop-blur-md border border-black/10 shadow-sm shadow-black/5 group-hover:border-black/20 group-hover:shadow-md'
        }`}
      >
        <AppIcon kind={app.windowId || app.id} size={sizeConfig.iconSize} />
      </div>
      <span
        className={`${sizeConfig.maxTextWidth} truncate text-center ${textSizeClass} ${fontWeightClass} ${shadowClass} tracking-wide ${
          isDark
            ? 'text-white/95'
            : 'text-slate-800'
        }`}
      >
        {app.label}
      </span>
    </button>
  )
}
