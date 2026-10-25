import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

/** Panes beside the routed thread, so five threads at most. */
export const MAX_SPLIT_PANES = 4;
const MIN_PANE_WIDTH = 360;

/** How many split panes fit beside the routed thread; one pane's width is left for the sidebar. */
export function splitPaneCapacity(viewportWidth: number): number {
  return Math.max(1, Math.min(MAX_SPLIT_PANES, Math.floor(viewportWidth / MIN_PANE_WIDTH) - 1));
}

/** Adds a pane while there is room, otherwise replaces the last one. */
export function withSplitThread(
  refs: ReadonlyArray<ScopedThreadRef>,
  ref: ScopedThreadRef,
  capacity: number,
): ReadonlyArray<ScopedThreadRef> {
  const key = scopedThreadKey(ref);
  if (refs.some((open) => scopedThreadKey(open) === key)) return refs;
  return refs.length < capacity ? [...refs, ref] : [...refs.slice(0, capacity - 1), ref];
}

interface SplitViewStore {
  /** Threads shown beside the routed thread, left to right; the route stays the primary pane. */
  readonly splitThreadRefs: ReadonlyArray<ScopedThreadRef>;
  readonly openSplit: (threadRef: ScopedThreadRef) => void;
  readonly replaceSplit: (threadKey: string, threadRef: ScopedThreadRef) => void;
  readonly closeSplit: (threadKey: string) => void;
}

export const useSplitViewStore = create<SplitViewStore>((set) => ({
  splitThreadRefs: [],
  openSplit: (threadRef) =>
    set((state) => ({
      splitThreadRefs: withSplitThread(
        state.splitThreadRefs,
        threadRef,
        splitPaneCapacity(window.innerWidth),
      ),
    })),
  replaceSplit: (threadKey, threadRef) =>
    set((state) => {
      const nextKey = scopedThreadKey(threadRef);
      return {
        splitThreadRefs: state.splitThreadRefs.flatMap((open) => {
          const key = scopedThreadKey(open);
          if (key === threadKey) return [threadRef];
          return key === nextKey ? [] : [open];
        }),
      };
    }),
  closeSplit: (threadKey) =>
    set((state) => ({
      splitThreadRefs: state.splitThreadRefs.filter((open) => scopedThreadKey(open) !== threadKey),
    })),
}));
