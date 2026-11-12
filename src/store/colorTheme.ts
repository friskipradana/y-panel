export type ColorTheme = 'white' | 'black' | 'pink' | 'blue' | 'custom'
export type ThemePolarity = 'light' | 'dark'

export const DEFAULT_CUSTOM_THEME_COLOR = '#6366f1'

const CUSTOM_CSS_VAR_KEYS = [
  '--tb-bg',
  '--tb-border',
  '--tb-hover',
  '--win-bg',
  '--win-border',
  '--win-border-focus',
  '--win-bar',
  '--win-bar-focus',
  '--win-bar-border',
  '--win-content-bg',
  '--widget-bg',
  '--widget-border',
  '--panel-surface',
  '--panel-surface-strong',
  '--panel-surface-hover',
  '--panel-field-bg',
  '--panel-field-focus',
  '--panel-card-icon-bg',
  '--panel-primary-bg',
  '--panel-primary-hover',
  '--panel-primary-text',
  '--panel-primary-solid',
  '--panel-primary-solid-shadow',
  '--panel-primary-soft',
  '--dock-bg',
  '--dock-border',
  '--dock-item-open-border',
  '--dock-preview-active-border',
  '--menu-bg',
  '--menu-border',
  '--menu-divider',
  '--focus-ring',
  '--adw-preview-light-active',
  '--adw-preview-dark-active',
] as const

interface Rgb {
  r: number
  g: number
  b: number
}

export function normalizeHexColor(value: string): string | null {
  const cleaned = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()
    return `#${expanded}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`
  }
  return null
}

function parseHex(hex: string): Rgb {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_CUSTOM_THEME_COLOR
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function toHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function mix(a: Rgb, b: Rgb, weightB: number): Rgb {
  const w = Math.max(0, Math.min(1, weightB))
  return {
    r: a.r * (1 - w) + b.r * w,
    g: a.g * (1 - w) + b.g * w,
    b: a.b * (1 - w) + b.b * w,
  }
}

function rgba(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`
}

function luminance({ r, g, b }: Rgb): number {
  const ch = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function darkenUntilMaxLuminance(c: Rgb, maxLum: number): Rgb {
  const ink: Rgb = { r: 15, g: 23, b: 42 }
  let current = c
  for (let i = 0; i <= 10; i++) {
    if (luminance(current) <= maxLum) return current
    current = mix(c, ink, (i + 1) * 0.08)
  }
  return current
}

function lightenUntilMinLuminance(c: Rgb, minLum: number): Rgb {
  const white: Rgb = { r: 248, g: 250, b: 252 }
  let current = c
  for (let i = 0; i <= 10; i++) {
    if (luminance(current) >= minLum) return current
    current = mix(c, white, (i + 1) * 0.08)
  }
  return current
}

export function clearCustomColorVars() {
  const style = document.documentElement.style
  for (const key of CUSTOM_CSS_VAR_KEYS) {
    style.removeProperty(key)
  }
}

export function applyCustomColorVars(rawHex: string, mode: ThemePolarity) {
  const base = parseHex(rawHex)
  const style = document.documentElement.style
  // Ensure white text over solid primary buttons/badges stays legible (>= 4.5:1)
  const solidRgb = darkenUntilMaxLuminance(base, 0.19)

  if (mode === 'dark') {
    const textRgb = lightenUntilMinLuminance(base, 0.42)
    const darkBase: Rgb = { r: 15, g: 23, b: 42 }
    const surfaceBg = mix(darkBase, base, 0.12)
    const barBg = mix(darkBase, base, 0.18)
    const barFocusBg = mix(darkBase, base, 0.22)

    style.setProperty('--tb-bg', rgba(surfaceBg, 0.92))
    style.setProperty('--tb-border', rgba(textRgb, 0.14))
    style.setProperty('--tb-hover', rgba(textRgb, 0.14))
    style.setProperty('--win-bg', rgba(surfaceBg, 0.96))
    style.setProperty('--win-border', rgba(textRgb, 0.22))
    style.setProperty('--win-border-focus', rgba(textRgb, 0.34))
    style.setProperty('--win-bar', rgba(barBg, 0.98))
    style.setProperty('--win-bar-focus', rgba(barFocusBg, 0.98))
    style.setProperty('--win-bar-border', rgba(textRgb, 0.2))
    style.setProperty('--win-content-bg', toHex(surfaceBg))
    style.setProperty('--widget-bg', rgba(surfaceBg, 0.92))
    style.setProperty('--widget-border', rgba(textRgb, 0.18))
    style.setProperty('--panel-surface', rgba(textRgb, 0.05))
    style.setProperty('--panel-surface-strong', rgba(textRgb, 0.08))
    style.setProperty('--panel-surface-hover', rgba(textRgb, 0.12))
    style.setProperty('--panel-field-bg', rgba(textRgb, 0.06))
    style.setProperty('--panel-field-focus', rgba(textRgb, 0.11))
    style.setProperty('--panel-card-icon-bg', rgba(textRgb, 0.14))
    style.setProperty('--panel-primary-bg', rgba(textRgb, 0.16))
    style.setProperty('--panel-primary-hover', rgba(textRgb, 0.24))
    style.setProperty('--panel-primary-text', toHex(textRgb))
    style.setProperty('--panel-primary-solid', toHex(solidRgb))
    style.setProperty('--panel-primary-solid-shadow', `0 8px 16px ${rgba(solidRgb, 0.24)}`)
    style.setProperty('--panel-primary-soft', rgba(textRgb, 0.16))
    style.setProperty('--dock-bg', rgba(surfaceBg, 0.92))
    style.setProperty('--dock-border', rgba(textRgb, 0.14))
    style.setProperty('--dock-item-open-border', rgba(textRgb, 0.2))
    style.setProperty('--dock-preview-active-border', rgba(textRgb, 0.45))
    style.setProperty('--menu-bg', rgba(surfaceBg, 0.97))
    style.setProperty('--menu-border', rgba(textRgb, 0.15))
    style.setProperty('--menu-divider', rgba(textRgb, 0.12))
    style.setProperty('--focus-ring', toHex(textRgb))
    style.setProperty('--adw-preview-light-active', toHex(textRgb))
    style.setProperty('--adw-preview-dark-active', toHex(textRgb))
    return
  }

  const textRgb = darkenUntilMaxLuminance(base, 0.17)
  const whiteBase: Rgb = { r: 255, g: 255, b: 255 }
  const winSurface = mix(whiteBase, base, 0.04)
  const barSurface = mix(whiteBase, base, 0.07)
  const focusSurface = mix(whiteBase, base, 0.03)
  const borderMix = mix({ r: 203, g: 213, b: 225 }, base, 0.24)

  style.setProperty('--tb-bg', rgba(winSurface, 0.96))
  style.setProperty('--tb-border', rgba(borderMix, 0.9))
  style.setProperty('--tb-hover', rgba(textRgb, 0.08))
  style.setProperty('--win-bg', rgba(winSurface, 0.96))
  style.setProperty('--win-border', rgba(borderMix, 0.9))
  style.setProperty('--win-border-focus', rgba(textRgb, 0.35))
  style.setProperty('--win-bar', rgba(barSurface, 0.95))
  style.setProperty('--win-bar-focus', rgba(focusSurface, 1))
  style.setProperty('--win-bar-border', rgba(borderMix, 0.88))
  style.setProperty('--win-content-bg', toHex(winSurface))
  style.setProperty('--widget-bg', rgba(winSurface, 0.94))
  style.setProperty('--widget-border', rgba(borderMix, 0.85))
  style.setProperty('--panel-surface', rgba(textRgb, 0.035))
  style.setProperty('--panel-surface-strong', rgba(textRgb, 0.06))
  style.setProperty('--panel-surface-hover', rgba(textRgb, 0.09))
  style.setProperty('--panel-field-bg', rgba(textRgb, 0.04))
  style.setProperty('--panel-field-focus', rgba(textRgb, 0.07))
  style.setProperty('--panel-card-icon-bg', rgba(textRgb, 0.1))
  style.setProperty('--panel-primary-bg', rgba(textRgb, 0.12))
  style.setProperty('--panel-primary-hover', rgba(textRgb, 0.18))
  style.setProperty('--panel-primary-text', toHex(textRgb))
  style.setProperty('--panel-primary-solid', toHex(solidRgb))
  style.setProperty('--panel-primary-solid-shadow', `0 8px 16px ${rgba(solidRgb, 0.18)}`)
  style.setProperty('--panel-primary-soft', rgba(textRgb, 0.12))
  style.setProperty('--dock-bg', rgba(winSurface, 0.92))
  style.setProperty('--dock-border', rgba(borderMix, 0.85))
  style.setProperty('--dock-item-open-border', rgba(borderMix, 0.85))
  style.setProperty('--dock-preview-active-border', rgba(textRgb, 0.45))
  style.setProperty('--menu-bg', rgba(winSurface, 0.98))
  style.setProperty('--menu-border', rgba(borderMix, 0.9))
  style.setProperty('--menu-divider', rgba(borderMix, 0.8))
  style.setProperty('--focus-ring', toHex(textRgb))
  style.setProperty('--adw-preview-light-active', toHex(textRgb))
  style.setProperty('--adw-preview-dark-active', toHex(textRgb))
}

