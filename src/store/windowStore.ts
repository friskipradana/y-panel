import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { withMutative } from "./middleware/mutative";
import type { WindowKind, WindowState } from "@/types";
import { soundManager } from "@/lib/sound";
import { Z } from "@/lib/zLayers";

const DEFAULTS: Record<
  WindowKind,
  { title: string; width: number; height: number; singleton?: boolean }
> = {
  // XL — Data & Grid Workstation (1040 x 528)
  apps: { title: "Docker", width: 1040, height: 528, singleton: true },
  database: { title: "Database", width: 1040, height: 528, singleton: true },
  tunnels: { title: "Cloudflare", width: 1040, height: 528, singleton: true },
  projects: { title: "Projects", width: 1040, height: 528, singleton: true },
  users: { title: "User Management", width: 1040, height: 528, singleton: true },
  "file-editor": { title: "Code Editor", width: 1040, height: 528, singleton: true },

  // L — Management & Monitoring (880 x 530)
  system: { title: "System Info", width: 880, height: 530, singleton: true },
  "system-logs": {
    title: "System Logs",
    width: 880,
    height: 530,
    singleton: true,
  },
  "file-manager": {
    title: "File Manager",
    width: 880,
    height: 530,
    singleton: true,
  },
  settings: { title: "Settings", width: 880, height: 530, singleton: true },
  hosting: { title: "Hosting", width: 880, height: 530, singleton: true },
  docs: { title: "Docs", width: 880, height: 530, singleton: true },

  // M — Terminal & 2-Column Gauge/Stats (840 x 540)
  speedtest: { title: "Speed Test", width: 840, height: 540, singleton: true },
  "host-terminal": {
    title: "Host Terminal",
    width: 840,
    height: 540,
    singleton: true,
  },
  terminal: { title: "Terminal", width: 640, height: 400, singleton: true },

  // S — Compact Utility & Dialogs (540 x 580)
  profile: {
    title: "Profile & Integrasi",
    width: 540,
    height: 580,
    singleton: true,
  },
  widgets: { title: "Widgets", width: 640, height: 530, singleton: true },
  changelog: { title: "Changelog", width: 580, height: 580, singleton: true },
  trash: { title: "Trash", width: 520, height: 360, singleton: true },
};

// Z-index tiers
const Z_NORMAL = Z.windowNormal;
const Z_MAXIMIZED = Z.windowMaximized;
const Z_FOCUS_BOOST = Z.windowFocused; // window terfokus non-fullscreen di atas window biasa
const Z_FULLSCREEN = Z.windowFullscreen; // fullscreen di atas window lain (palette dan alert tetap di atasnya)

function reorder(windows: WindowState[]) {
  const non = windows.filter((w) => !w.isFullscreen);
  const full = windows.filter((w) => w.isFullscreen);

  // non-fullscreen sorted: maximized gets slightly higher base
  non.forEach((w, i) => {
    w.zIndex = (w.isMaximized ? Z_MAXIMIZED : Z_NORMAL) + i;
  });

  // fullscreen: selalu di lapisan paling atas
  full.forEach((w, i) => {
    w.zIndex = Z_FULLSCREEN + i;
  });
}

function bringToFront(windows: WindowState[], id: string) {
  const index = windows.findIndex((w) => w.id === id);
  if (index === -1) return;

  const win = windows[index];
  const isFullscreen = win.isFullscreen;

  // Pisahkan bucket fullscreen dan non-fullscreen
  const nonFull = windows.filter((w) => !w.isFullscreen);
  const full = windows.filter((w) => w.isFullscreen);

  if (isFullscreen) {
    // Pindah ke akhir bucket fullscreen
    const fi = full.findIndex((w) => w.id === id);
    if (fi !== -1 && fi !== full.length - 1) {
      const [w] = full.splice(fi, 1);
      full.push(w);
    }
  } else {
    // Pindah ke akhir bucket non-fullscreen
    const ni = nonFull.findIndex((w) => w.id === id);
    if (ni !== -1 && ni !== nonFull.length - 1) {
      const [w] = nonFull.splice(ni, 1);
      nonFull.push(w);
    }
  }

  // Rebuild array: non-fullscreen dulu, fullscreen di belakang
  windows.length = 0;
  windows.push(...nonFull, ...full);
  reorder(windows);

  // Jika window yang di-focus BUKAN fullscreen, beri z-index boost
  // agar dia terlihat di atas semua window biasa/maksimasi,
  // tetapi tetap di bawah overlay taskbar dan mode fullscreen.
  if (!isFullscreen) {
    win.zIndex = Z_FOCUS_BOOST;
  }
}

function nextWindowTitle(kind: WindowKind, windows: WindowState[]) {
  const def = DEFAULTS[kind];
  if (def.singleton) return def.title;
  const count = windows.filter((w) => w.kind === kind).length + 1;
  return count === 1 ? def.title : `${def.title} ${count}`;
}

function createWindowId(kind: WindowKind) {
  return `${kind}:${Math.random().toString(36).slice(2, 8)}`;
}

interface WindowStore {
  windows: WindowState[];
  focusedId: string | null;
  autoHideDock: boolean;
  globalContentZoom: number;
  globalFontIndex: number;
  globalTerminalFontSize: number;

  openWindow: (kind: WindowKind, params?: Record<string, any>) => string;
  updateWindowParams: (id: string, params: Record<string, any>) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  toggleFullscreenWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  setGlobalContentZoom: (value: number) => void;
  setGlobalFontIndex: (value: number) => void;
  setGlobalTerminalFontSize: (value: number) => void;
  toggleDockAutoHide: () => void;
  closeWindowsByKind: (kind: WindowKind) => void;
  clampWindowsToViewport: () => void;
  resetWindows: () => void;
}

export const selectFocusedId = (s: WindowStore) => s.focusedId;
export const selectWindows = (s: WindowStore) => s.windows;
export const selectAutoHideDock = (s: WindowStore) => s.autoHideDock;
export const selectGlobalContentZoom = (s: WindowStore) => s.globalContentZoom;
export const selectGlobalFontIndex = (s: WindowStore) => s.globalFontIndex;
export const selectGlobalTerminalFontSize = (s: WindowStore) =>
  s.globalTerminalFontSize;
export const selectWindowCountByKind = (kind: WindowKind) => (s: WindowStore) =>
  s.windows.filter((w) => w.kind === kind).length;

// Terminal text size in px; Ctrl + wheel and Ctrl + / - / 0 move it inside this range
export const TERMINAL_FONT_DEFAULT = 15;
export const TERMINAL_FONT_MIN = 8;
export const TERMINAL_FONT_MAX = 32;

export const useWindowStore = create<WindowStore>()(
  persist(
    withMutative<WindowStore>((set) => ({
      windows: [],
      focusedId: null,
      autoHideDock: false,
      globalContentZoom: 1,
      globalFontIndex: 2,
      globalTerminalFontSize: TERMINAL_FONT_DEFAULT,

      openWindow: (kind, params) => {
        let openedId = "";
        soundManager.playWindowOpen();
        set((state) => {
          const def = DEFAULTS[kind];
          const existing = def.singleton
            ? state.windows.find((w) => w.kind === kind)
            : undefined;

          if (existing) {
            existing.isMinimized = false;
            existing.lastAction = "restore";
            if (params) {
              existing.params = { ...(existing.params || {}), ...params };
            }
            bringToFront(state.windows, existing.id);
            state.focusedId = existing.id;
            openedId = existing.id;
            return;
          }

          // Calculate maximum usable desktop area with breathing room
          const maxW = Math.max(340, Math.floor(window.innerWidth * 0.94));
          const maxH = Math.max(
            240,
            Math.floor((window.innerHeight - 64) * 0.92),
          );

          let width = def.width;
          let height = def.height;

          // Scale down proportionally if larger than maximum viewport bounds
          if (width > maxW || height > maxH) {
            const scale = Math.min(maxW / width, maxH / height);
            width = Math.max(320, Math.round(width * scale));
            height = Math.max(220, Math.round(height * scale));
          }

          // Cascade over every open window (not only the same kind) so new windows never
          // land exactly on top of another one.
          const openCount = state.windows.filter(
            (w) => !w.isMinimized && !w.isMaximized && !w.isFullscreen,
          ).length;
          const step = (openCount % 8) * 28;
          const baseX = Math.round((window.innerWidth - width) / 2);
          const baseY = Math.round((window.innerHeight - 56 - height) / 2);
          const x = Math.min(
            Math.max(16, baseX + step),
            Math.max(16, window.innerWidth - width - 16),
          );
          const y = Math.min(
            Math.max(48, baseY + step),
            Math.max(48, window.innerHeight - height - 72),
          );
          const id = createWindowId(kind);
          openedId = id;

          state.windows.push({
            id,
            kind,
            title: nextWindowTitle(kind, state.windows),
            x,
            y,
            width,
            height,
            zIndex: Z_FOCUS_BOOST,
            isMinimized: false,
            isMaximized: false,
            isFullscreen: false,
            lastAction: "open",
            params: params || {},
          });

          // the window that was in front gives up its place at the front: two at the focused level would be told apart by
          // their order in the page, and the new one would not be the one on top
          bringToFront(state.windows, id);
          state.focusedId = id;
        });
        return openedId;
      },

      updateWindowParams: (id, params) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (win) {
            win.params = { ...(win.params || {}), ...params };
          }
        }),

      closeWindow: (id) => {
        soundManager.playWindowClose();
        set((state) => {
          const index = state.windows.findIndex((w) => w.id === id);
          if (index !== -1) {
            state.windows.splice(index, 1);
            reorder(state.windows);
            const lastVisible = [...state.windows]
              .reverse()
              .find((w) => !w.isMinimized);
            state.focusedId = lastVisible?.id ?? null;
          }
        });
      },

      focusWindow: (id) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          if (win.isMinimized) {
            win.isMinimized = false;
            win.lastAction = "restore";
          }
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      minimizeWindow: (id) => {
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          win.isMinimized = !win.isMinimized;
          win.lastAction = win.isMinimized ? "minimize" : "restore";

          if (win.isMinimized) {
            soundManager.playWindowMinimize();
            const lastVisible = [...state.windows]
              .reverse()
              .find((w) => !w.isMinimized && w.id !== id);
            state.focusedId = lastVisible?.id ?? null;
            return;
          }

          soundManager.playWindowOpen();
          bringToFront(state.windows, id);
          state.focusedId = id;
        });
      },

      maximizeWindow: (id) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          if (win.isFullscreen) {
            win.isFullscreen = false;
            win.isMaximized = true;
          } else {
            win.isMaximized = !win.isMaximized;
          }
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      toggleFullscreenWindow: (id) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          win.isFullscreen = !win.isFullscreen;
          if (win.isFullscreen) {
            win.isMinimized = false;
            win.lastAction = "restore";
          }
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      moveWindow: (id, x, y) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (win) {
            win.x = x;
            win.y = y;
          }
        }),

      resizeWindow: (id, width, height) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (win) {
            win.width = width;
            win.height = height;
          }
        }),

      setGlobalContentZoom: (value) =>
        set((state) => {
          state.globalContentZoom = Math.min(
            2,
            Math.max(0.75, Number(value.toFixed(2))),
          );
        }),

      setGlobalFontIndex: (value) =>
        set((state) => {
          state.globalFontIndex = Math.max(0, Math.min(2, Math.round(value)));
        }),

      setGlobalTerminalFontSize: (value) =>
        set((state) => {
          state.globalTerminalFontSize = Math.min(
            TERMINAL_FONT_MAX,
            Math.max(TERMINAL_FONT_MIN, Math.round(value)),
          );
        }),

      toggleDockAutoHide: () =>
        set((state) => {
          state.autoHideDock = !state.autoHideDock;
        }),

      // Pull windows back on screen after the viewport shrank (resize, rotation, smaller display)
      clampWindowsToViewport: () =>
        set((state) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          for (const win of state.windows) {
            if (win.isMaximized || win.isFullscreen) continue;
            win.width = Math.min(win.width, Math.max(320, vw - 16));
            win.height = Math.min(win.height, Math.max(220, vh - 44 - 24));
            const minX = 8 - (win.width - 180);
            const maxX = vw - 180 - 8;
            win.x = Math.min(Math.max(win.x, minX), Math.max(minX, maxX));
            win.y = Math.min(Math.max(win.y, 44), Math.max(44, vh - 96));
          }
        }),

      closeWindowsByKind: (kind) =>
        set((state) => {
          state.windows = state.windows.filter(
            (windowItem) => windowItem.kind !== kind,
          );
          reorder(state.windows);
          const lastVisible = [...state.windows]
            .reverse()
            .find((w) => !w.isMinimized);
          state.focusedId = lastVisible?.id ?? null;
        }),

      resetWindows: () =>
        set((state) => {
          state.windows = [];
          state.focusedId = null;
        }),
    })),
    {
      name: "reneo-windows",
      storage: createJSONStorage(() => localStorage),
      version: 3,
      // the old defaults (9px, then 13px) were too small to read; anyone still on one gets the new default
      migrate: (persisted, version) => {
        const state = persisted as Partial<WindowStore>;
        if (
          version < 2 &&
          (state.globalTerminalFontSize === 9 ||
            state.globalTerminalFontSize === 13)
        )
          state.globalTerminalFontSize = TERMINAL_FONT_DEFAULT;
        // the Portainer window is gone: a saved layout must not try to open it
        if (version < 3 && Array.isArray(state.windows))
          state.windows = state.windows.filter(
            (w) => (w.kind as string) !== "portainer",
          );
        return state as WindowStore;
      },
    },
  ),
);
