import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  boardWindowIsCovered,
  queryLocalOnlineBoard,
  resolveBoardWindow,
  type BoardWindow,
} from "@/lib/db/boardQuery";
import { isLocalDbReady } from "@/lib/db/index";
import {
  assembleOnlineOrderBoard,
  getMissingActiveOnlineOrderIds,
  reconcileOnlineOrderSnapshot,
  type OnlineOrderBoardSelection,
} from "@/lib/onlineOrderBoard";
import type { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useOnlineOrders } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DatePreset = "today" | "yesterday" | "last_7_days" | "custom";

const EMPTY_ORDERS: OrderProfile[] = [];
const EMPTY_SELECTIONS: OnlineOrderBoardSelection[] = [];

/**
 * Phase 5 — when set, the board paints from the SQLite mirror before the RPC
 * answers, and keeps painting from it when the RPC cannot answer at all. Off:
 * today's refetch-on-entry path, unchanged.
 */
const LOCAL_BOARDS_ENABLED = process.env.EXPO_PUBLIC_LOCAL_BOARDS === "1";

export interface OnlineOrderDateFilter {
  preset: DatePreset;
  startDate: string | null;
  endDate: string | null;
}

/** Where the rows currently on screen came from. */
export type OnlineBoardSource = "server" | "local" | "none";

/**
 * Whether the selected range reaches today — i.e. a tab that can still receive
 * brand-new orders. Only those tabs watch realtime to pull a just-arrived order
 * in through an RPC refresh; historical ranges never expect new arrivals, so
 * they stay quiet. The board itself is always strictly scoped by the RPC.
 */
function rangeIncludesToday(filter: OnlineOrderDateFilter): boolean {
  if (filter.preset === "today" || filter.preset === "last_7_days") return true;
  if (filter.preset === "yesterday") return false;
  // custom
  if (!filter.endDate) return false;
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return filter.endDate >= localToday;
}

/**
 * Resolve one board window from the local mirror, through the SAME transform
 * pair the server path runs — so a card rendered from disk cannot differ from
 * the same card rendered from the RPC.
 *
 * Returns null when the mirror cannot answer (DB unavailable, never synced, or
 * the window reaches past the retention floor), which is a different thing
 * from "answered, and the answer is no orders". An empty ARRAY is a real
 * result and paints an empty board; null falls through to the server.
 */
async function resolveLocalBoard(
  locationId: string,
  window: BoardWindow,
): Promise<{
  selections: OnlineOrderBoardSelection[];
  orders: OrderProfile[];
} | null> {
  if (!isLocalDbReady()) return null;
  if (!(await boardWindowIsCovered(locationId, window))) return null;

  const rows = await queryLocalOnlineBoard({ locationId, window });
  if (!rows) return null;

  const selections: OnlineOrderBoardSelection[] = [];
  const orders: OrderProfile[] = [];

  for (const row of rows) {
    const fetched = {
      ...safeJsonObject(row.order.payload),
      order_items: row.items.map((it) => safeJsonObject(it.payload)),
      order_payments: row.payments.map((p) => safeJsonObject(p.payload)),
    } as unknown as FetchedOrderData;

    const normalized = normalizeFetchedOrder(fetched);
    const order = transformBroadcastToOrder(normalized, normalized.station_name);
    order._broadcastItemCount = row.itemCount;
    orders.push(order);

    selections.push({
      orderId: row.order.id as string,
      placedAt: row.placedAt,
      // The RPC is strictly scoped and returns `true` for every row it
      // returns; the local query filters on the same bounds, so it does too.
      isInRange: true,
      itemCount: row.itemCount,
      orderData: fetched,
    });
  }

  return { selections, orders };
}

function safeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Merge board orders into the store the same way both paths always have. */
function mergeOrdersIntoStore(orders: OrderProfile[]): void {
  if (orders.length === 0) return;
  useOrderStore.setState((state) => {
    const nextOrdersById = { ...state.ordersById };
    for (const order of orders) {
      const key = order.db_order_id ?? order.id;
      nextOrdersById[key] = reconcileOnlineOrderSnapshot(
        nextOrdersById[key],
        order,
      );
    }
    return { ordersById: nextOrdersById };
  });
}

/**
 * Loads every Online Orders preset through the same server-authoritative
 * location-local date contract, then reconciles those rows with realtime state.
 *
 * ---------------------------------------------------------------------------
 * The resolution rule, when EXPO_PUBLIC_LOCAL_BOARDS is set
 * ---------------------------------------------------------------------------
 * LOCAL FIRST, SERVER-CORRECTED — the same rule Phase 3 settled on for a
 * filtered Previous Orders query, and for the same reason: the mirror is fast
 * and complete enough to paint, and the server is the only thing that can be
 * authoritative.
 *
 *   - The mirror paints immediately, so the board is on screen before the RPC
 *     round trip finishes instead of after it.
 *   - The RPC then REPLACES that result whenever it answers. The board is
 *     never left on local data while a connection exists.
 *   - When the RPC cannot answer, the local board stays and the hook reports
 *     `source: "local"` so the screen can say so.
 *
 * The server pass is deliberately NOT skipped on a fresh mirror, unlike
 * Previous Orders. `online_orders.placed_at` can be updated by a provider
 * WITHOUT touching `orders.updated_at`, and the delta only re-pulls an order
 * when that watermark moves — so a re-placed order's window could go stale in
 * the mirror with nothing to correct it. Losing one round trip is cheaper than
 * a card sitting on the wrong day's tab.
 */
export function useOnlineOrdersByDate(filter: OnlineOrderDateFilter): {
  onlineOrders: OrderProfile[];
  isLoading: boolean;
  error: string | null;
  source: OnlineBoardSource;
  refresh: () => void;
} {
  const supabase = useSupabaseClient();
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  const timezone = useStoreSettingsStore(
    (s) => s.selectedStore?.timezone ?? null,
  );
  const rolloverHour = useStoreSettingsStore(
    (s) => s.selectedStore?.business_day_start_hour ?? 0,
  );
  const liveOrders = useOnlineOrders();
  const ordersById = useOrderStore((s) => s.ordersById);
  const currentLocationId = useOrderStore((s) => s.currentLocationId);
  const filterKey = `${locationId ?? ""}:${filter.preset}:${filter.startDate ?? ""}:${filter.endDate ?? ""}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    rows: OnlineOrderBoardSelection[];
    source: OnlineBoardSource;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const fetchIdRef = useRef(0);
  /**
   * The filter the RPC has already answered for.
   *
   * Without it, every refresh of the SAME tab — and the missing-active refresh
   * fires one on its own — would repaint from the mirror first, flipping the
   * scope line on and off between two results the operator cannot tell apart.
   * The local pass is a FIRST paint, so it runs when there is nothing better
   * on screen, and again only when the RPC has stopped answering.
   */
  const serverAnsweredKeyRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!locationId) {
      setSelectionState(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchId = ++fetchIdRef.current;
    const isCurrent = () => !cancelled && fetchId === fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    /**
     * Paint the window from the mirror. Returns true when it painted.
     *
     * `sourceLabel` is what the painted board should be labelled with:
     *   - "local" only when the SERVER could not answer — the screen's
     *     "Offline" scope line is keyed on exactly that.
     *   - "none" for the FIRST paint while the RPC is still in flight. The
     *     mirror is fast and the RPC is authoritative; labelling the first
     *     paint "local" flashed the Offline banner for a split second on
     *     every entry, before the online response landed.
     *
     * The mirror is an accelerator, never a dependency: a failure here costs a
     * paint and nothing else, so everything is swallowed.
     */
    const paintFromMirror = async (
      sourceLabel: OnlineBoardSource = "local",
    ): Promise<boolean> => {
      if (!LOCAL_BOARDS_ENABLED || !timezone) return false;
      try {
        const window = resolveBoardWindow(
          filter.preset,
          filter.startDate,
          filter.endDate,
          { timezone, rolloverHour },
        );
        if (!window) return false;
        const local = await resolveLocalBoard(locationId, window);
        if (!local || !isCurrent()) return false;
        mergeOrdersIntoStore(local.orders);
        setSelectionState({
          key: filterKey,
          rows: local.selections,
          source: sourceLabel,
        });
        return true;
      } catch (caught) {
        console.warn("[online-orders][local] board read failed:", caught);
        return false;
      }
    };

    /**
     * The RPC could not answer.
     *
     * If the mirror has not already painted, try it NOW — this is the case
     * where a tab that was showing server rows goes offline on a refresh, and
     * leaving the stale rows up with no scope line would tell the operator the
     * board is current when it is not. Only when there is nothing on disk
     * either does this become an error.
     */
    const handleServerFailure = async (
      paintedLocally: boolean,
      message: string,
    ): Promise<void> => {
      serverAnsweredKeyRef.current = null;
      if (paintedLocally) {
        // The board on screen came from the mirror as a neutral first paint;
        // the server could not answer, so it is genuinely stuck on local data.
        // Re-label it "local" so the Offline scope line appears — otherwise it
        // would silently look current.
        if (isCurrent()) {
          setSelectionState((prev) =>
            prev && prev.key === filterKey
              ? { ...prev, source: "local" }
              : prev,
          );
        }
        return;
      }
      if (await paintFromMirror()) return;
      if (isCurrent()) setError(message);
    };

    (async () => {
      // ── Local first paint ────────────────────────────────────────
      // Skipped when the RPC has already answered for this exact filter: the
      // rows on screen are then the authoritative ones and repainting from
      // disk would only downgrade them.
      // First paint from the mirror stays neutral ("none"): the Offline scope
      // line only belongs on screen once the server has actually failed, not
      // while the RPC is still answering.
      const paintedLocally =
        serverAnsweredKeyRef.current === filterKey
          ? false
          : await paintFromMirror("none");

      // ── Server correction ────────────────────────────────────────
      try {
        const boardResult = await OrderService.getOnlineOrdersBoard(
          supabase,
          locationId,
          {
            preset: filter.preset,
            startDate: filter.startDate,
            endDate: filter.endDate,
          },
        );

        if (!isCurrent()) return;
        if (boardResult.error) {
          await handleServerFailure(
            paintedLocally,
            boardResult.error.message ?? "Failed to load online orders",
          );
          return;
        }

        const nextSelections = boardResult.data ?? [];
        const fetchedOrders = nextSelections.flatMap((row) => {
          if (!row.orderData) return [];
          const normalized = normalizeFetchedOrder(
            row.orderData as FetchedOrderData,
          );
          const order = transformBroadcastToOrder(
            normalized,
            normalized.station_name,
          );
          order._broadcastItemCount = row.itemCount;
          return [order];
        });

        mergeOrdersIntoStore(fetchedOrders);
        serverAnsweredKeyRef.current = filterKey;
        setSelectionState({
          key: filterKey,
          rows: nextSelections,
          source: "server",
        });
      } catch (caught: any) {
        if (isCurrent()) {
          await handleServerFailure(
            paintedLocally,
            caught?.message ?? "Failed to load online orders",
          );
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    locationId,
    timezone,
    rolloverHour,
    filter.preset,
    filter.startDate,
    filter.endDate,
    filterKey,
    refreshVersion,
  ]);

  const hasSelection = selectionState?.key === filterKey;
  const selections = hasSelection
    ? selectionState.rows
    : EMPTY_SELECTIONS;
  const source: OnlineBoardSource = hasSelection
    ? selectionState.source
    : "none";
  const locationLiveOrders =
    currentLocationId === locationId ? liveOrders : EMPTY_ORDERS;
  // Only tabs whose window reaches today expect brand-new orders to arrive, so
  // only they watch realtime to pull a fresh order in via an RPC refresh.
  const tracksLiveArrivals = useMemo(
    () => rangeIncludesToday(filter),
    [filter.preset, filter.endDate],
  );
  const missingActiveOrderKey = useMemo(() => {
    // Historical ranges don't track live orders, so don't force a refresh to
    // pull a newly-active order the board wouldn't show anyway.
    if (!hasSelection || !tracksLiveArrivals) return "";
    // A LOCAL selection is not grounds for a refresh loop. The mirror can
    // legitimately lack an order realtime has already delivered — a broadcast
    // carries no online_orders embed, so a brand-new order has no mirrored
    // placement until the next delta cycle. Refreshing on that would spin the
    // RPC every render for as long as the device is offline, which is exactly
    // when it cannot succeed.
    if (selectionState?.source !== "server") return "";
    return getMissingActiveOnlineOrderIds(selections, locationLiveOrders).join(
      ":",
    );
  }, [
    hasSelection,
    tracksLiveArrivals,
    selections,
    locationLiveOrders,
    selectionState?.source,
  ]);

  // A realtime insert can land after the RPC snapshot. Refresh once while the
  // order is active so its authoritative placed_at remains available after it
  // transitions to completed.
  useEffect(() => {
    if (!missingActiveOrderKey) return;
    setRefreshVersion((version) => version + 1);
  }, [missingActiveOrderKey]);

  const onlineOrders = useMemo(
    () =>
      assembleOnlineOrderBoard(selections, ordersById, locationLiveOrders, {
        // Keyed on the SERVER selection, not on having any selection at all:
        // until the RPC has answered, a just-completed order that realtime
        // delivered may not be in the mirror yet (the mirror learns about it
        // on the next delta cycle), and dropping it from the Today board in
        // the meantime would be a card disappearing mid-service.
        includeLiveCompleted: filter.preset === "today" && source !== "server",
      }),
    [selections, ordersById, locationLiveOrders, filter.preset, source],
  );

  return { onlineOrders, isLoading, error, source, refresh };
}
