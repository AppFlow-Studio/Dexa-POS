import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import type { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useOnlineOrders } from "@/stores/selectors/orderSelectors";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
    normalizeFetchedOrder,
    transformBroadcastToOrder,
    type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DatePreset = "today" | "yesterday" | "last_7_days" | "custom";

export interface OnlineOrderDateFilter {
  preset: DatePreset;
  startDate: string | null; // ISO date string (YYYY-MM-DD)
  endDate: string | null; // ISO date string (YYYY-MM-DD)
}

/**
 * Rows per window. The server now applies the date window, so this bounds one
 * business day (or one chosen range) rather than slicing an arbitrary subset.
 */
const PAGE_LIMIT = 200;

/** Terminal online-order statuses we never show on the Kanban. */
const EXCLUDED_STATUSES = new Set([
  "declined",
  "cancelled",
  "void",
  "voided",
  "refunded",
]);

function isVisible(o: OrderProfile): boolean {
  return !EXCLUDED_STATUSES.has(o.order_status ?? "");
}

/**
 * Fetches online orders for a given date window by joining the
 * `online_orders` table — the authoritative source for online-order
 * identification — to `orders`. Does NOT rely on `orders.order_source`
 * which may carry arbitrary platform-specific values.
 */
export function useOnlineOrdersByDate(filter: OnlineOrderDateFilter): {
  onlineOrders: OrderProfile[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const supabase = useSupabaseClient();
  const locationId = useStoreSettingsStore.getState().selectedStore?.id ?? null;

  // Proven selector — already excludes terminal statuses + non-online orders.
  // Stable reference via useStableOrderList inside.
  const liveOrders = useOnlineOrders();

  const [fetchedOrders, setFetchedOrders] = useState<OrderProfile[]>([]);
  const [windowMs, setWindowMs] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  // Every window is fetched from the server — Today included.
  //
  // Today used to read the Zustand store alone, on the assumption that
  // `useOrdersQuery` had already put today's online orders there. It hasn't:
  // `get_active_orders_v1` returns only draft/pending/sent_to_kitchen/preparing/
  // ready, so a *completed* online order is in no refetch result, and
  // `hydrateWorkspace` rebuilds `ordersById` from that result — evicting it.
  // The order then survived only under Yesterday (whose query has no status
  // filter), which is exactly the "we had to go to yesterday to see today's
  // orders" report.
  const fetchOrders = useCallback(async () => {
    if (!supabase || !locationId) return;

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const bounds = await OrderService.getBusinessDayBounds(
        supabase,
        locationId,
        filter.startDate,
        filter.endDate,
      );

      if (!bounds || fetchId !== fetchIdRef.current) return;

      // Query `orders` — not `online_orders` — so the date window, ordering and
      // limit all apply to the row that actually carries `created_at`. The inner
      // embed keeps the authoritative online-order identification (a row in
      // `online_orders`) without trusting `orders.order_source`.
      //
      // The previous shape selected FROM `online_orders` with an unordered
      // `.limit(200)` and applied the window client-side, so once a location
      // passed 200 online orders the page was an arbitrary subset of them.
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(
          `*,
           order_items(*, order_item_modifiers(*)),
           order_payments(*),
           order_discounts(*),
           stations(station_name),
           created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name),
           online_orders!online_orders_order_id_fkey!inner(order_id, provider, delivery_company)`,
        )
        .eq("location_id", locationId)
        .gte("created_at", bounds.start_ts)
        .lt("created_at", bounds.end_ts)
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);

      if (fetchId !== fetchIdRef.current) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      // Rows are already the order — the server applied the window, so the only
      // gate left is the terminal-status one shared with `useOnlineOrders`.
      const orders = ((data ?? []) as unknown[])
        .map((row) =>
          transformBroadcastToOrder(
            normalizeFetchedOrder(row as FetchedOrderData),
          ),
        )
        .filter(isVisible);

      setWindowMs({
        start: new Date(bounds.start_ts).getTime(),
        end: new Date(bounds.end_ts).getTime(),
      });
      setFetchedOrders(orders);
    } catch (e: any) {
      if (fetchId === fetchIdRef.current) {
        setError(e?.message ?? "Failed to fetch online orders");
      }
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    supabase,
    locationId,
    filter.preset,
    filter.startDate,
    filter.endDate,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Live orders carry realtime state the fetch can't have yet (a brand-new
  // order, a status the server hasn't been re-read for), so they win on
  // conflict — but only inside the selected window. They used to be merged in
  // unfiltered, which leaked the entire store into Yesterday / Last 7 / custom
  // ranges: the same live orders showed up under every date the user picked.
  const merged = useMemo(() => {
    if (!windowMs) {
      // Pre-first-fetch. Today falls back to the store rather than flashing
      // empty; a past window has nothing to show until its rows land.
      return filter.preset === "today" ? liveOrders : fetchedOrders;
    }
    const inWindow = (o: OrderProfile) => {
      const t = o.opened_at ? new Date(o.opened_at).getTime() : 0;
      return t >= windowMs.start && t < windowMs.end;
    };
    return mergeOrders(liveOrders.filter(inWindow), fetchedOrders);
  }, [liveOrders, fetchedOrders, windowMs, filter.preset]);

  return { onlineOrders: merged, isLoading, error, refresh: fetchOrders };
}

/**
 * Merge live (realtime) orders with historical (server-fetched) orders.
 * Live orders take precedence; historical fill in orders not already present.
 */
function mergeOrders(
  live: OrderProfile[],
  historical: OrderProfile[],
): OrderProfile[] {
  const seen = new Set<string>();
  const result: OrderProfile[] = [];

  for (const o of live) {
    const key = o.db_order_id ?? o.id;
    seen.add(key);
    result.push(o);
  }

  for (const o of historical) {
    const key = o.db_order_id ?? o.id;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(o);
    }
  }

  result.sort(
    (a, b) =>
      new Date(b.opened_at ?? 0).getTime() -
      new Date(a.opened_at ?? 0).getTime(),
  );

  return result;
}
