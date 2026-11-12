import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { withMutative } from "./middleware/mutative";
import type { WindowKind, WindowState } from "@/types";
import { soundManager } from "@/lib/sound";
import { Z } from "@/lib/zLayers";
import {
  DEFAULTS,
  bringToFront,
  createWindowId,
  nextWindowTitle,
  reorder,
} from "./windowDefaults";

const Z_FOCUS_BOOST = Z.windowFocused;

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
          const appIdParam = kind === 'installed-app' && params?.appId ? Number(params.appId) : null;
          const existing = appIdParam
            ? state.windows.find(
                (w) => w.kind === 'installed-app' && Number(w.params?.appId) === appIdParam,
              )
            : def.singleton
              ? state.windows.find((w) => w.kind === kind)
              : undefined;

          if (existing) {
            existing.isMinimized = false;
            existing.lastAction = "restore";
            if (params) {
              existing.params = { ...(existing.params || {}), ...params };
              if (kind === 'installed-app' && typeof params.appName === 'string' && params.appName.trim()) {
                existing.title = params.appName.trim();
              }
            }
            bringToFront(state.windows, existing.id);
            state.focusedId = existing.id;
            openedId = existing.id;
            return;
          }

          const maxW = Math.max(340, Math.floor(window.innerWidth * 0.94));
          const maxH = Math.max(
            240,
            Math.floor((window.innerHeight - 64) * 0.92),
          );

          let width = def.width;
          let height = def.height;

          let squeezed = false;
          if (width > maxW || height > maxH) {
            const scale = Math.min(maxW / width, maxH / height);
            width = Math.max(320, Math.round(width * scale));
            height = Math.max(220, Math.round(height * scale));
            squeezed = true;
          }

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
            title:
              kind === 'installed-app' && typeof params?.appName === 'string' && params.appName.trim()
                ? params.appName.trim()
                : nextWindowTitle(kind, state.windows),
            x,
            y,
            width,
            height,
            ...(squeezed ? { prefWidth: def.width, prefHeight: def.height } : {}),
            zIndex: Z_FOCUS_BOOST,
            isMinimized: false,
            isMaximized: false,
            isFullscreen: false,
            lastAction: "open",
            params: params || {},
          });

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
            delete win.prefWidth;
            delete win.prefHeight;
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

      clampWindowsToViewport: () =>
        set((state) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          for (const win of state.windows) {
            if (win.isMaximized || win.isFullscreen) continue;
            const wantW = win.prefWidth ?? win.width;
            const wantH = win.prefHeight ?? win.height;
            win.width = Math.min(wantW, Math.max(320, vw - 16));
            win.height = Math.min(wantH, Math.max(220, vh - 44 - 24));
            if (win.width < wantW || win.height < wantH) {
              win.prefWidth = wantW;
              win.prefHeight = wantH;
            } else {
              delete win.prefWidth;
              delete win.prefHeight;
            }
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
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as Partial<WindowStore>;
        if (
          version < 2 &&
          (state.globalTerminalFontSize === 9 ||
            state.globalTerminalFontSize === 13)
        )
          state.globalTerminalFontSize = TERMINAL_FONT_DEFAULT;
        if (version < 3 && Array.isArray(state.windows))
          state.windows = state.windows.filter(
            (w) => (w.kind as string) !== "portainer",
          );
        if (version < 4 && Array.isArray(state.windows))
          for (const w of state.windows) {
            const def = DEFAULTS[w.kind];
            if (def && !w.isMaximized && !w.isFullscreen && (w.width <= 360 || w.height <= 240)) {
              w.width = Math.min(def.width, Math.max(320, window.innerWidth - 16));
              w.height = Math.min(def.height, Math.max(220, window.innerHeight - 68));
            }
          }
        return state as WindowStore;
      },
    },
  ),
);
