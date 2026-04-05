import { create } from "zustand";
import { withMutative } from "./middleware/mutative";
import type { WindowKind, WindowState } from "@/types";

const DEFAULTS: Record<
  WindowKind,
  { title: string; icon: string; width: number; height: number; singleton?: boolean }
> = {
  apps: { title: "My Apps", icon: "📁", width: 460, height: 380, singleton: true },
  terminal: { title: "Terminal", icon: "💻", width: 500, height: 320, singleton: true },
  "host-terminal": { title: "Host Terminal", icon: "🖥️", width: 860, height: 620 },
  system: { title: "System Info", icon: "⚙️", width: 420, height: 520, singleton: true },
  "system-logs": { title: "System Logs", icon: "📜", width: 920, height: 620, singleton: true },
  docs: { title: "Docs", icon: "📚", width: 380, height: 340, singleton: true },
  changelog: { title: "Changelog", icon: "🔔", width: 360, height: 320, singleton: true },
  portainer: { title: "Portainer", icon: "🐋", width: 500, height: 420, singleton: true },
  settings: { title: "Settings", icon: "🔧", width: 920, height: 640, singleton: true },
  database: { title: "Database", icon: "🗄️", width: 980, height: 680, singleton: true },
  trash: { title: "Trash", icon: "🗑️", width: 300, height: 180, singleton: true },
};

// Z-index tiers
const Z_NORMAL      = 100;
const Z_MAXIMIZED   = 500;
const Z_FULLSCREEN  = 12000;
const Z_FOCUS_BOOST = 50000; // window terfokus selalu di atas semua

function reorder(windows: WindowState[]) {
  const non = windows.filter((w) => !w.isFullscreen);
  const full = windows.filter((w) => w.isFullscreen);

  // non-fullscreen sorted: maximized gets slightly higher base
  non.forEach((w, i) => {
    w.zIndex = (w.isMaximized ? Z_MAXIMIZED : Z_NORMAL) + i;
  });

  // fullscreen: 12000+ (always above normal windows)
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
  // agar dia terlihat di atas semua fullscreen
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

  openWindow: (kind: WindowKind) => string;
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
  resetWindows: () => void;
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
  withMutative<WindowStore>((set) => ({
    windows: [],
    focusedId: null,
    autoHideDock: false,
    globalContentZoom: 1,
    globalFontIndex: 2,
    globalTerminalFontSize: 9,

    openWindow: (kind) => {
      let openedId = '';
      set((state) => {
        const def = DEFAULTS[kind];
        const existing = def.singleton
          ? state.windows.find((w) => w.kind === kind)
          : undefined;

        if (existing) {
          existing.isMinimized = false;
          existing.lastAction = 'restore';
          bringToFront(state.windows, existing.id);
          state.focusedId = existing.id;
          openedId = existing.id;
          return;
        }

        const pad = 16;
        const width = Math.min(def.width, window.innerWidth - pad * 2);
        const height = Math.min(def.height, window.innerHeight - 72);
        const offset = state.windows.filter((w) => w.kind === kind).length * 26;
        const x = Math.max(pad, (window.innerWidth - width) / 2 + offset);
        const y = Math.max(54, (window.innerHeight - height) / 2 + Math.min(offset, 64));
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
        });

        state.focusedId = id;
      });
      return openedId;
    },

    closeWindow: (id) =>
      set((state) => {
        const index = state.windows.findIndex((w) => w.id === id);
        if (index !== -1) {
          state.windows.splice(index, 1);
          reorder(state.windows);
          const lastVisible = [...state.windows].reverse().find((w) => !w.isMinimized);
          state.focusedId = lastVisible?.id ?? null;
        }
      }),

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

    minimizeWindow: (id) =>
      set((state) => {
        const win = state.windows.find((w) => w.id === id);
        if (!win) return;
        win.isMinimized = !win.isMinimized;
        win.lastAction = win.isMinimized ? 'minimize' : 'restore';

        if (win.isMinimized) {
          const lastVisible = [...state.windows]
            .reverse()
            .find((w) => !w.isMinimized && w.id !== id);
          state.focusedId = lastVisible?.id ?? null;
          return;
        }

        bringToFront(state.windows, id);
        state.focusedId = id;
      }),

    maximizeWindow: (id) =>
      set((state) => {
        const win = state.windows.find((w) => w.id === id);
        if (!win) return;
        win.isMaximized = !win.isMaximized;
        if (win.isMaximized) {
          win.isFullscreen = false;
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
          win.isMaximized = false;
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
  })),
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
    })),
  });
});
