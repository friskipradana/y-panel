// Central stacking scale of the desktop shell. Keep new overlays on this scale so
// "which layer wins" is decided here and not by scattered magic numbers.
export const Z = {
  widgets: 12,
  windowNormal: 100,
  windowMaximized: 500,
  windowFocused: 50_000,
  /** Picture-in-Picture floating windows stay always on top of normal/focused windows */
  windowPip: 58_000,
  /** Edge-snap preview: above windows, below the taskbar */
  snapPreview: 59_000,
  taskbar: 60_000,
  desktopContextMenu: 61_000,
  dock: 62_000,
  dockMenu: 62_250,
  windowFullscreen: 120_000,
  /** Portal menus (ActionMenu / Select) float above fullscreen & PiP windows */
  floatingMenu: 125_000,
  /** Quick command palette: above every window, including fullscreen */
  commandPalette: 130_000,
  /** Blocking dialogs and the lock screen sit above everything else */
  alert: 999_999,
} as const
