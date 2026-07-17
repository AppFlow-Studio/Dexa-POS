import { create } from "zustand";

/**
 * Bridge between per-table React data (computed by `useTableCardData` in normal RN
 * components) and the single Skia surface that draws the tables.
 *
 * WHY THIS EXISTS: react-native-skia renders `<Canvas>` children through its OWN
 * React renderer. Hooks, Zustand store subscriptions, and React context do NOT
 * propagate/re-render inside a Canvas child the way they do in the RN tree
 * (https://shopify.github.io/react-native-skia/docs/canvas/contexts/). So all live
 * data MUST be prepared OUTSIDE the Canvas and passed in as plain values. Each table
 * gets a tiny zero-size RN publisher component that runs the hook and writes its
 * resolved draw-data here; SkiaTableLayer subscribes ONCE (at the top, outside the
 * Canvas children) and draws from these plain objects.
 */

export interface TableTextLine {
  text: string;
  size: number;
  weight: "400" | "600" | "700" | "800";
  color: string;
}

export interface TableBadge {
  kind: "server" | "reservation" | "tab";
  text: string;
  /** fill / stroke / text colors already resolved */
  bg: string;
  border: string;
  fg: string;
}

export interface TableDrawData {
  // geometry / shape
  shapeId: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  color: string;
  darkMode: boolean;
  attention: boolean;
  // content
  lines: TableTextLine[];
  badges: TableBadge[];
}

interface TableDrawState {
  data: Record<string, TableDrawData>;
  setData: (id: string, d: TableDrawData) => void;
  clearData: (id: string) => void;
  /**
   * Drop every entry whose id is NOT in `keepIds`. Publishers intentionally
   * don't clearData on unmount (avoids a pan/viewport-window flicker), so this
   * is the authoritative GC: callers pass the full set of table ids that still
   * exist on the current floor, and everything else (tables from other floors,
   * deleted tables) is released. Without it, `data` grew one entry per distinct
   * table ever windowed for the app's lifetime and the single store subscriber
   * (SkiaTableLayer) shallow-compared an ever-growing map on every update.
   */
  pruneData: (keepIds: Set<string>) => void;
}

const shallowEqualData = (a: TableDrawData, b: TableDrawData): boolean => {
  if (
    a.color !== b.color ||
    a.width !== b.width ||
    a.height !== b.height ||
    a.x !== b.x ||
    a.y !== b.y ||
    a.rotation !== b.rotation ||
    a.darkMode !== b.darkMode ||
    a.attention !== b.attention ||
    a.shapeId !== b.shapeId ||
    a.lines.length !== b.lines.length ||
    a.badges.length !== b.badges.length
  ) {
    return false;
  }
  for (let i = 0; i < a.lines.length; i++) {
    const la = a.lines[i];
    const lb = b.lines[i];
    if (
      la.text !== lb.text ||
      la.size !== lb.size ||
      la.weight !== lb.weight ||
      la.color !== lb.color
    )
      return false;
  }
  for (let i = 0; i < a.badges.length; i++) {
    const ba = a.badges[i];
    const bb = b.badges[i];
    if (
      ba.kind !== bb.kind ||
      ba.text !== bb.text ||
      ba.bg !== bb.bg ||
      ba.border !== bb.border ||
      ba.fg !== bb.fg
    )
      return false;
  }
  return true;
};

export const useTableDrawStore = create<TableDrawState>((set) => ({
  data: {},
  setData: (id, d) =>
    set((state) => {
      const prev = state.data[id];
      if (prev && shallowEqualData(prev, d)) return state; // no-op → no notify
      return { data: { ...state.data, [id]: d } };
    }),
  clearData: (id) =>
    set((state) => {
      if (!(id in state.data)) return state;
      const next = { ...state.data };
      delete next[id];
      return { data: next };
    }),
  pruneData: (keepIds) =>
    set((state) => {
      let removed = false;
      const next: Record<string, TableDrawData> = {};
      for (const id in state.data) {
        if (keepIds.has(id)) {
          next[id] = state.data[id];
        } else {
          removed = true;
        }
      }
      if (!removed) return state; // no-op → no notify
      return { data: next };
    }),
}));

/** Non-reactive read for callers that already have their own subscription cadence. */
export const getTableDraw = (id: string): TableDrawData | undefined =>
  useTableDrawStore.getState().data[id];
