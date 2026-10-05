import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { withMutative } from "./middleware/mutative";
import type { WindowKind, WindowState } from "@/types";
import { soundManager } from "@/lib/sound";

const DEFAULTS: Record<
  WindowKind,
  { title: string; icon: string; width: number; height: number; singleton?: boolean }
> = {
  apps: { title: "Docker", icon: "🐋", width: 960, height: 600, singleton: true },
  terminal: { title: "Terminal", icon: "💻", width: 580, height: 360, singleton: true },
  "host-terminal": { title: "Host Terminal", icon: "🖥️", width: 840, height: 520, singleton: true },
  system: { title: "System Info", icon: "⚙️", width: 900, height: 560, singleton: true },
  "system-logs": { title: "System Logs", icon: "📜", width: 860, height: 540, singleton: true },
  docs: { title: "Docs", icon: "📚", width: 840, height: 530, singleton: true },
  changelog: { title: "Changelog", icon: "🔔", width: 780, height: 490, singleton: true },
  portainer: { title: "Portainer", icon: "🐋", width: 720, height: 460, singleton: true },
  settings: { title: "Settings", icon: "🔧", width: 900, height: 570, singleton: true },
  database: { title: "Database", icon: "🗄️", width: 960, height: 600, singleton: true },
  "file-manager": { title: "File Manager", icon: "📁", width: 900, height: 560, singleton: true },
  "file-editor": { title: "Code Editor", icon: "📝", width: 960, height: 600, singleton: true },
  trash: { title: "Trash", icon: "🗑️", width: 520, height: 340, singleton: true },
  users: { title: "User Management", icon: "👥", width: 860, height: 560, singleton: true },
  projects: { title: "Projects", icon: "🗂️", width: 880, height: 560, singleton: true },
  tunnels: { title: "Cloudflare", icon: "🌐", width: 960, height: 600, singleton: true },
  profile: { title: "Profile & Integrasi", icon: "👤", width: 500, height: 560, singleton: true },
};

// Z-index tiers
const Z_NORMAL = 100;
const Z_MAXIMIZED = 500;
const Z_FOCUS_BOOST = 50000; // window terfokus non-fullscreen di atas window biasa
const Z_FULLSCREEN = 120000; // fullscreen tetap layer tertinggi

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
  setShowSystemStats: (v: boolean) => void;
  setSystemStatsConfig: (config: { cpu: boolean; ram: boolean; temp: boolean }) => void;
  resetWindows: () => void;

  showSystemStats: boolean;
  systemStatsConfig: { cpu: boolean; ram: boolean; temp: boolean };
}

export const selectFocusedId = (s: WindowStore) => s.focusedId;
export const selectWindows = (s: WindowStore) => s.windows;
export const selectAutoHideDock = (s: WindowStore) => s.autoHideDock;
export const selectGlobalContentZoom = (s: WindowStore) => s.globalContentZoom;
export const selectGlobalFontIndex = (s: WindowStore) => s.globalFontIndex;
export const selectGlobalTerminalFontSize = (s: WindowStore) => s.globalTerminalFontSize;
export const selectWindowCountByKind = (kind: WindowKind) => (s: WindowStore) =>
  s.windows.filter((w) => w.kind === kind).length;

export const useWindowStore = create<WindowStore>()(
  persist(
    withMutative<WindowStore>((set) => ({
      windows: [],
      focusedId: null,
      autoHideDock: false,
      globalContentZoom: 1,
      globalFontIndex: 2,
      globalTerminalFontSize: 9,

      openWindow: (kind, params) => {
        let openedId = '';
        soundManager.playWindowOpen();
        set((state) => {
          const def = DEFAULTS[kind];
          const existing = def.singleton
            ? state.windows.find((w) => w.kind === kind)
            : undefined;

          if (existing) {
            existing.isMinimized = false;
            existing.lastAction = 'restore';
            if (params) {
              existing.params = { ...(existing.params || {}), ...params };
            }
            bringToFront(state.windows, existing.id);
            state.focusedId = existing.id;
            openedId = existing.id;
            return;
          }

          // Calculate maximum usable desktop area with breathing room
          const maxW = Math.max(340, Math.floor(window.innerWidth * 0.82));
          const maxH = Math.max(240, Math.floor((window.innerHeight - 64) * 0.82));

          let width = def.width;
          let height = def.height;

          // Scale down proportionally if larger than maximum viewport bounds
          if (width > maxW || height > maxH) {
            const scale = Math.min(maxW / width, maxH / height);
            width = Math.max(320, Math.round(width * scale));
            height = Math.max(220, Math.round(height * scale));
          }

          const offset = state.windows.filter((w) => w.kind === kind).length * 24;
          const x = Math.max(16, Math.round((window.innerWidth - width) / 2 + offset));
          const y = Math.max(48, Math.round((window.innerHeight - 56 - height) / 2 + Math.min(offset, 48)));
          const id = createWindowId(kind);
          openedId = id;

          state.windows.push({
            id,
            kind,
            title: nextWindowTitle(kind, state.windows),
            icon: def.icon,
            x,
            y,
            width,
            height,
            zIndex: Z_FOCUS_BOOST,
            isMinimized: false,
            isMaximized: false,
            isFullscreen: false,
            lastAction: 'open',
            params: params || {},
          });

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
            const lastVisible = [...state.windows].reverse().find((w) => !w.isMinimized);
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
            win.lastAction = 'restore';
          }
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      minimizeWindow: (id) => {
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          win.isMinimized = !win.isMinimized;
          win.lastAction = win.isMinimized ? 'minimize' : 'restore';

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
            win.lastAction = 'restore';
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
          state.globalContentZoom = Math.min(2, Math.max(0.75, Number(value.toFixed(2))));
        }),

      setGlobalFontIndex: (value) =>
        set((state) => {
          state.globalFontIndex = Math.max(0, Math.min(2, Math.round(value)));
        }),

      setGlobalTerminalFontSize: (value) =>
        set((state) => {
          state.globalTerminalFontSize = Math.min(18, Math.max(7, Math.round(value)));
        }),

      toggleDockAutoHide: () =>
        set((state) => {
          state.autoHideDock = !state.autoHideDock;
        }),

      closeWindowsByKind: (kind) =>
        set((state) => {
          state.windows = state.windows.filter((windowItem) => windowItem.kind !== kind);
          reorder(state.windows);
          const lastVisible = [...state.windows].reverse().find((w) => !w.isMinimized);
          state.focusedId = lastVisible?.id ?? null;
        }),

      resetWindows: () =>
        set((state) => {
          state.windows = [];
          state.focusedId = null;
        }),

      showSystemStats: false,
      systemStatsConfig: { cpu: true, ram: true, temp: true },
      setShowSystemStats: (v) =>
        set((state) => {
          state.showSystemStats = v;
        }),

      setSystemStatsConfig: (config) =>
        set((state) => {
          state.systemStatsConfig = config;
        }),
    })),
    {
      name: "ui-panel-windows",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

const DEBUG = true;

useWindowStore.subscribe((state) => {
  if (!DEBUG) return;

  console.log("🧠 [STATE UPDATE]", {
    total: state.windows.length,
    focusedId: state.focusedId,
    autoHideDock: state.autoHideDock,
    windows: state.windows.map((w) => ({
      id: w.id,
      kind: w.kind,
      z: w.zIndex,
      x: Math.round(w.x),
      y: Math.round(w.y),
      minimized: w.isMinimized,
      maximized: w.isMaximized,
      fullscreen: w.isFullscreen,
      action: w.lastAction,
      params: w.params,
    })),
  });
});
