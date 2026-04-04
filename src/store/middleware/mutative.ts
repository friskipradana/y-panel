import { create as mutate } from "mutative";

// middleware / enhancer
export const withMutative =
  <T extends object>(
    fn: (
      set: (fn: (draft: T) => void) => void,
      get: () => T
    ) => T
  ) =>
  (set: (fn: (state: T) => T) => void, get: () => T) =>
    fn(
      (updater) =>
        set((state) => mutate(state, updater)),
      get
    );