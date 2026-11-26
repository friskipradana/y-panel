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
  togglePipWindow: (id: string, aspectRatio?: number) => void;
  fitWindowToContent: (id: string, width: number, height: number) => void;
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
          const isSharedCrmParam = kind === 'installed-app' && params?.sharedCrm === true;
          const sharedAppKeyParam = typeof params?.sharedAppKey === 'string' ? params.sharedAppKey : 'reneo-crm';
          const existing = appIdParam
            ? state.windows.find(
                (w) => w.kind === 'installed-app' && Number(w.params?.appId) === appIdParam,
              )
            : isSharedCrmParam
              ? state.windows.find(
                  (w) =>
                    w.kind === 'installed-app' &&
                    w.params?.sharedCrm === true &&
                    (typeof w.params?.sharedAppKey === 'string' ? w.params.sharedAppKey : 'reneo-crm') === sharedAppKeyParam,
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
          if (win.isPip) {
            win.isPip = false;
            delete win.prePipRect;
          }
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
          if (win.isPip) {
            win.isPip = false;
            delete win.prePipRect;
          }
          win.isFullscreen = !win.isFullscreen;
          if (win.isFullscreen) {
            win.isMinimized = false;
            win.lastAction = "restore";
          }
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      togglePipWindow: (id, aspectRatio) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          if (win.isPip) {
            win.isPip = false;
            if (win.prePipRect) {
              win.x = win.prePipRect.x;
              win.y = win.prePipRect.y;
              win.width = win.prePipRect.width;
              win.height = win.prePipRect.height;
              win.isMaximized = win.prePipRect.isMaximized;
              delete win.prePipRect;
            }
            bringToFront(state.windows, id);
            state.focusedId = id;
            return;
          }
          win.prePipRect = {
            x: win.x,
            y: win.y,
            width: win.width,
            height: win.height,
            isMaximized: win.isMaximized,
          };
          win.isMaximized = false;
          win.isFullscreen = false;
          win.isMinimized = false;
          win.isPip = true;
          const ratio = aspectRatio && Number.isFinite(aspectRatio) ? Math.min(2.4, Math.max(0.75, aspectRatio)) : 16 / 9;
          const pipW = Math.min(464, Math.max(280, Math.round(window.innerWidth * 0.34)));
          const pipH = Math.min(Math.max(180, Math.round(pipW / ratio)), Math.max(200, window.innerHeight - 140));
          win.width = pipW;
          win.height = pipH;
          win.x = Math.max(12, window.innerWidth - pipW - 20);
          win.y = Math.max(52, window.innerHeight - pipH - 88);
          delete win.prefWidth;
          delete win.prefHeight;
          delete win.prefX;
          delete win.prefY;
          delete win.prefViewportW;
          delete win.prefViewportH;
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      fitWindowToContent: (id, targetWidth, targetHeight) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (!win) return;
          const maxW = Math.max(320, window.innerWidth - 24);
          const maxH = Math.max(220, window.innerHeight - 44 - 24);
          const width = Math.min(maxW, Math.max(300, Math.round(targetWidth)));
          const height = Math.min(maxH, Math.max(220, Math.round(targetHeight)));
          win.isMaximized = false;
          win.isFullscreen = false;
          win.width = width;
          win.height = height;
          if (!win.isPip) {
            win.x = Math.max(12, Math.min(win.x, window.innerWidth - width - 12));
            win.y = Math.max(48, Math.min(win.y, window.innerHeight - height - 16));
          } else {
            win.x = Math.max(12, Math.min(win.x, window.innerWidth - width - 12));
            win.y = Math.max(48, Math.min(win.y, window.innerHeight - height - 20));
          }
          delete win.prefWidth;
          delete win.prefHeight;
          delete win.prefX;
          delete win.prefY;
          delete win.prefViewportW;
          delete win.prefViewportH;
          bringToFront(state.windows, id);
          state.focusedId = id;
        }),

      moveWindow: (id, x, y) =>
        set((state) => {
          const win = state.windows.find((w) => w.id === id);
          if (win) {
            win.x = x;
            win.y = y;
            delete win.prefX;
            delete win.prefY;
            delete win.prefViewportW;
            delete win.prefViewportH;
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
            delete win.prefX;
            delete win.prefY;
            delete win.prefViewportW;
            delete win.prefViewportH;
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
            const wantX = win.prefX ?? win.x;
            const wantY = win.prefY ?? win.y;
            const refW = win.prefViewportW ?? Math.max(vw, wantX + wantW + 12);
            const refH = win.prefViewportH ?? Math.max(vh, wantY + wantH + 20);

            win.width = Math.min(wantW, Math.max(320, vw - 16));
            win.height = Math.min(wantH, Math.max(220, vh - 44 - 24));

            const maxFullX = Math.max(8, vw - win.width - 8);
            const maxFullY = Math.max(44, vh - win.height - 16);
            let nextX = wantX;
            let nextY = wantY;

            if (win.isPip) {
              const distRight = Math.max(12, refW - (wantX + wantW));
              const distBottom = Math.max(20, refH - (wantY + wantH));
              nextX = Math.max(8, Math.min(maxFullX, Math.round(vw - win.width - distRight)));
              nextY = Math.max(44, Math.min(maxFullY, Math.round(vh - win.height - distBottom)));
            } else {
              if (wantX + win.width + 8 > vw || wantX < 8) {
                const ratioX = refW > 0 ? vw / refW : 1;
                nextX = Math.max(8, Math.min(maxFullX, Math.round(wantX * ratioX)));
              }
              if (wantY + win.height + 16 > vh || wantY < 44) {
                const ratioY = refH > 44 ? (vh - 44) / (refH - 44) : 1;
                nextY = Math.max(44, Math.min(maxFullY, Math.round(44 + Math.max(0, wantY - 44) * ratioY)));
              }
            }

            win.x = nextX;
            win.y = nextY;

            const altered = win.width < wantW || win.height < wantH || nextX !== wantX || nextY !== wantY;
            if (altered) {
              win.prefWidth = wantW;
              win.prefHeight = wantH;
              win.prefX = wantX;
              win.prefY = wantY;
              win.prefViewportW = refW;
              win.prefViewportH = refH;
            } else {
              delete win.prefWidth;
              delete win.prefHeight;
              delete win.prefX;
              delete win.prefY;
              delete win.prefViewportW;
              delete win.prefViewportH;
            }
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
