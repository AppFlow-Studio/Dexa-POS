import { WallEdgeFlags } from "@/lib/wallCornerSnap";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { SharedValue } from "react-native-reanimated";

export interface DraggableTableProps {
  table: FloorPlanObject;
  layoutId: string; // Kept for prop compatibility, though unused
  isEditMode: boolean;
  isSelected: boolean;
  interactionMode: "normal" | "selection" | "merge";
  // Callbacks receive the table so the parent can pass a single stable
  // useCallback ref instead of allocating a fresh closure per table per render.
  onSelect: (table: FloorPlanObject) => void;
  canvasScale: SharedValue<number>;
  onPress?: (table: FloorPlanObject) => void;
  index?: number; // For staggered entry animation
  enableEntryAnimation?: boolean;
  disableEntryAnimation?: boolean;
  sectionColor?: string;
  wallEdgeFlags?: WallEdgeFlags;

  onLongPress?: (table: FloorPlanObject) => void;
  disableLongPress?: boolean;
}

export type NextReservationLike = {
  date?: string;
  time: string;
};

export const compactTableName = (rawName: string): string => {
  const name = rawName.trim();
  if (!name) return "";

  const digits = name.match(/\d+/)?.[0] ?? "";
  const alphaToken = name.match(/[A-Za-z]+/)?.[0] ?? "";
  if (digits && alphaToken) {
    return `${alphaToken[0].toUpperCase()}${digits}`;
  }

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 3);
  }

  return name.slice(0, 4).toUpperCase();
};

// Per-orderId throttle so the prefetch-subscriber and per-table fallback
// don't double up, and so a transient failure can be retried.
export const missingOrderSyncInFlight = new Set<string>();
export const missingOrderLastAttemptAt: Record<string, number> = {};
export const MISSING_ORDER_SYNC_THROTTLE_MS = 8000;
const MISSING_ORDER_MAX_AGE_MS = 300_000; // 5 min — prevent unbounded growth

/** Prune stale entries from missingOrderLastAttemptAt to prevent memory leak. */
export function pruneMissingOrderAttempts(): void {
  const now = Date.now();
  for (const key of Object.keys(missingOrderLastAttemptAt)) {
    if (now - missingOrderLastAttemptAt[key] > MISSING_ORDER_MAX_AGE_MS) {
      delete missingOrderLastAttemptAt[key];
    }
  }
}
export const EMPTY_MERGED_TABLE_NAMES: (string | null)[] = [];

const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const getReservationTimeMs = (
  reservation: NextReservationLike,
): number | null => {
  const direct = new Date(reservation.time).getTime();
  if (Number.isFinite(direct)) return direct;

  const dateKey = reservation.date || toLocalDateKey(new Date());
  const combined = new Date(`${dateKey}T${reservation.time}`).getTime();
  if (Number.isFinite(combined)) return combined;

  return null;
};
