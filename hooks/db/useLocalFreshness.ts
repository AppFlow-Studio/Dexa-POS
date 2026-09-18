/**
 * "Last synced 2 minutes ago" — the freshness contract for every screen that
 * reads from the local database.
 *
 * This is a requirement, not a nicety. Once a screen can render data the device
 * fetched an hour ago, it MUST say so. The alternative is a cashier looking at
 * a total that is confidently, silently wrong.
 *
 * Generalizes the pattern that already exists for the menu (PosSyncState in
 * types/menu.ts, MenuStaleBanner, MenuUnavailableState) rather than inventing a
 * second one — Phase 4 switches MenuStaleBanner over to read from here.
 *
 * The threshold is per-entity because the right answer varies by an order of
 * magnitude: inventory stock is stale after 60s, order history after 5 minutes,
 * the staff roster after an hour. It lives on the entity descriptor
 * (lib/db/entities.ts), not here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getEntity } from "@/lib/db/entities";
import { getDb, isLocalDbReady } from "@/lib/db/index";
import { dbWriteMutex } from "@/lib/db/mutex";

export type FreshnessState =
  | "live" // revalidated < 30s ago, online — say nothing
  | "fresh" // within staleAfterMs — a quiet muted line
  | "stale" // past staleAfterMs — amber strip, tap to sync
  | "offline" // no connectivity — amber strip with an absolute time
  | "never"; // no rows yet — skeleton + retry

export interface LocalFreshness {
  lastSuccessAt: string | null;
  ageMs: number | null;
  state: FreshnessState;
  isRevalidating: boolean;
  rowCount: number | null;
  /** Oldest row still held. Screens MUST state the window when a query reaches past it. */
  retentionFloor: string | null;
  lastError: string | null;
  refresh: () => Promise<void>;
}

const LIVE_WINDOW_MS = 30_000;
/** Relative labels drift as they age, so re-render on a timer while mounted. */
const TICK_MS = 30_000;

function isDeviceOnline(): boolean {
  // Lazily required for the same reason usePreviousOrdersStore does it:
  // offlineSyncService imports stores, so a static import here is a cycle.
  // Defaults to online so we never wrongly claim "offline" and suppress a sync.
  try {
    const { getRawIsOnline } = require("@/services/offlineSyncService");
    return getRawIsOnline();
  } catch {
    return true;
  }
}

interface SyncStateRow {
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  retention_floor: string | null;
  row_count: number | null;
}

export function useLocalFreshness(
  entityName: string,
  locationId: string | null,
): LocalFreshness {
  const [row, setRow] = useState<SyncStateRow | null>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [, forceTick] = useState(0);
  const mounted = useRef(true);

  const entity = getEntity(entityName);
  const staleAfterMs = entity?.staleAfterMs ?? 5 * 60_000;

  const read = useCallback(async () => {
    if (!locationId || !isLocalDbReady()) return;
    const db = getDb();
    if (!db) return;
    try {
      // Through the shared mutex: a freshness read stepping on the connection
      // during a mirror transaction throws "database is locked" on the write.
      const result = await dbWriteMutex.runExclusive(() =>
        db.getFirstAsync<SyncStateRow>(
          `SELECT last_success_at, last_attempt_at, last_error, retention_floor, row_count
             FROM sync_state WHERE entity = ? AND location_id = ?`,
          [entityName, locationId],
        ),
      );
      if (mounted.current) setRow(result ?? null);
    } catch {
      // A freshness read must never break a screen. No stamp is better than
      // no screen.
    }
  }, [entityName, locationId]);

  useEffect(() => {
    mounted.current = true;
    void read();
    return () => {
      mounted.current = false;
    };
  }, [read]);

  // Relative time goes stale on its own — "2 minutes ago" is wrong a minute
  // later even if nothing synced. Tick while mounted, and re-read sync_state at
  // the same cadence so a background sync landing is reflected without a
  // subscription mechanism this phase doesn't need yet.
  useEffect(() => {
    const id = setInterval(() => {
      forceTick((n) => n + 1);
      void read();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [read]);

  const refresh = useCallback(async () => {
    setIsRevalidating(true);
    try {
      await read();
    } finally {
      if (mounted.current) setIsRevalidating(false);
    }
  }, [read]);

  return useMemo(() => {
    const lastSuccessAt = row?.last_success_at ?? null;
    const online = isDeviceOnline();
    const ageMs = lastSuccessAt
      ? Date.now() - new Date(lastSuccessAt).getTime()
      : null;

    let state: FreshnessState;
    if (!lastSuccessAt || (row?.row_count ?? 0) === 0) {
      state = "never";
    } else if (!online) {
      // Offline outranks fresh/stale: the operator's question is "can this
      // update at all?", not "how old is it?".
      state = "offline";
    } else if (ageMs !== null && ageMs < LIVE_WINDOW_MS) {
      state = "live";
    } else if (ageMs !== null && ageMs < staleAfterMs) {
      state = "fresh";
    } else {
      state = "stale";
    }

    return {
      lastSuccessAt,
      ageMs,
      state,
      isRevalidating,
      rowCount: row?.row_count ?? null,
      retentionFloor: row?.retention_floor ?? null,
      lastError: row?.last_error ?? null,
      refresh,
    };
  }, [row, isRevalidating, staleAfterMs, refresh]);
}

/**
 * "just now" / "2 minutes ago" / "1 hour ago", falling back to an absolute
 * date past ~6h.
 *
 * The existing formatSyncedAt() in MenuStaleBanner renders absolute only
 * (" from 2:45 PM"). Relative is the right default here — "3 minutes ago" is
 * immediately actionable where "from 2:45 PM" needs the reader to know what
 * time it is now. Absolute stays correct for the `offline` state, where the
 * operator genuinely wants the wall-clock time, so both exist.
 */
export function formatRelativeAge(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours <= 6) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Absolute wall-clock, for the offline state. */
export function formatAbsoluteTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
