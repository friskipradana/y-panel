import { create } from "zustand";
import { withMutative } from "./middleware/mutative";
import type { WindowId, WindowState } from "@/types";

// ========================
// DEFAULT CONFIG
// ========================

const BASE_Z = 100;
const DEFAULTS: Record<
  WindowId,
  { title: string; icon: string; width: number; height: number }
> = {
  apps: { title: "My Apps", icon: "📁", width: 460, height: 380 },
  terminal: { title: "Terminal", icon: "💻", width: 500, height: 320 },
  system: { title: "System Info", icon: "⚙️", width: 360, height: 320 },
  docs: { title: "Docs", icon: "📚", width: 380, height: 340 },
  changelog: { title: "Changelog", icon: "🔔", width: 340, height: 300 },
  portainer: { title: "Portainer", icon: "🐋", width: 500, height: 420 },
  settings: { title: "Settings", icon: "🔧", width: 360, height: 300 },
  trash: { title: "Trash", icon: "🗑️", width: 300, height: 180 },
};

// ========================
// HELPER — recalculate semua zIndex dari posisi array
// ========================
function reorder(windows: WindowState[]) {
  windows.forEach((w, i) => {
    w.zIndex = BASE_Z + i;
  });
}

// ========================
// HELPER — angkat window ke posisi terakhir (paling depan)
// ========================
function bringToFront(windows: WindowState[], id: WindowId) {
  const index = windows.findIndex((w) => w.id === id);
  if (index === -1) return;
  if (index === windows.length - 1) return; // ✅ skip kalau sudah paling depan
  const [win] = windows.splice(index, 1);
  windows.push(win);
  reorder(windows);
}

interface WindowStore {
  windows: WindowState[];
  focusedId: WindowId | null; // ✅ track focused window secara eksplisit

  openWindow: (id: WindowId) => void;
  closeWindow: (id: WindowId) => void;
  focusWindow: (id: WindowId) => void;
  minimizeWindow: (id: WindowId) => void;
  maximizeWindow: (id: WindowId) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  resizeWindow: (id: WindowId, width: number, height: number) => void;
  resetWindows: () => void;
}

// ========================
// SELECTORS
// ========================
export const selectFocusedId = (s: WindowStore) => s.focusedId;
export const selectWindows = (s: WindowStore) => s.windows;
export const selectTopZ = (s: WindowStore) =>
  s.windows.length > 0 ? BASE_Z + s.windows.length - 1 : BASE_Z;

// ========================
// STORE
// ========================
export const useWindowStore = create<WindowStore>()(
  withMutative<WindowStore>((set) => ({
    windows: [],
    focusedId: null,

    openWindow: (id) =>
      set((state) => {
        const existing = state.windows.find((w) => w.id === id);

        if (existing) {
          existing.isMinimized = false;
          bringToFront(state.windows, id);
          state.focusedId = id; // ✅
          console.log("[ACTION] focus existing window:", id);
          return;
        }

        const def = DEFAULTS[id];
        const pad = 16;
        const width = Math.min(def.width, window.innerWidth - pad * 2);
        const height = Math.min(def.height, window.innerHeight - pad * 2);
        const x = Math.max(pad, (window.innerWidth - width) / 2);
        const y = Math.max(pad, (window.innerHeight - height) / 2);

        state.windows.push({
          id,
          title: def.title,
          icon: def.icon,
          x,
          y,
          width,
          height,
          zIndex: BASE_Z + state.windows.length,
          isMinimized: false,
          isMaximized: false,
        });

        state.focusedId = id; // ✅
        console.log("[ACTION] open new window:", id);
      }),

    closeWindow: (id) =>
      set((state) => {
        const index = state.windows.findIndex((w) => w.id === id);
        if (index !== -1) {
          state.windows.splice(index, 1);
          reorder(state.windows);
          // ✅ auto-focus ke window terakhir setelah close
          state.focusedId =
            state.windows.length > 0
              ? state.windows[state.windows.length - 1].id
              : null;
          console.log("[ACTION] close window:", id);
        }
      }),

    focusWindow: (id) =>
      set((state) => {
        if (state.focusedId === id) return; // ✅ skip kalau sudah fokus
        bringToFront(state.windows, id);
        state.focusedId = id;
        console.log("[ACTION] focus window:", id);
      }),

    minimizeWindow: (id) =>
      set((state) => {
        const win = state.windows.find((w) => w.id === id);
        if (win) {
          win.isMinimized = !win.isMinimized;
          // ✅ auto-focus ke window visible berikutnya saat minimize
          if (win.isMinimized) {
            const lastVisible = [...state.windows]
              .reverse()
              .find((w) => !w.isMinimized && w.id !== id);
            state.focusedId = lastVisible?.id ?? null;
          } else {
            state.focusedId = id;
          }
          console.log("[ACTION] toggle minimize:", id);
        }
      }),

    maximizeWindow: (id) =>
      set((state) => {
        const win = state.windows.find((w) => w.id === id);
        if (win) {
          win.isMaximized = !win.isMaximized;
          console.log("[ACTION] toggle maximize:", id);
        }
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

    resetWindows: () =>
      set((state) => {
        state.windows = [];
        state.focusedId = null;
        console.log("[ACTION] reset windows");
      }),
  })),
);

// ========================
// GLOBAL LOGGER
// ========================
const DEBUG = true;

useWindowStore.subscribe((state) => {
  if (!DEBUG) return;

  console.log("🧠 [STATE UPDATE]", {
    total: state.windows.length,
    focusedId: state.focusedId,
    windows: state.windows.map((w) => ({
      id: w.id,
      z: w.zIndex,
      x: Math.round(w.x),
      y: Math.round(w.y),
      minimized: w.isMinimized,
    })),
  });
});
