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

  const [historicalOrders, setHistoricalOrders] = useState<OrderProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  // Only spend a network round-trip when the user picks a non-Today window.
  // Today's live orders are already in the Zustand store via useOrdersQuery.
  const needsHistoricalFetch = filter.preset !== "today";

  const fetchHistorical = useCallback(async () => {
    if (!needsHistoricalFetch) {
      setHistoricalOrders([]);
      return;
    }
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

      // Query online_orders and join to orders via FK — catches ALL online
      // orders regardless of what value is in orders.order_source.
      let query = supabase
        .from("online_orders")
        .select(
          `order_id,
           orders!inner(
             *,
             order_items(*, order_item_modifiers(*)),
             order_payments(*),
             order_discounts(*),
             stations(station_name),
             created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)
           )`,
        )
        .eq("location_id", locationId)
        .limit(200);

      // Note: date-range filtering + ordering done client-side below.
      // PostgREST dot-notation is not reliable on embedded resources.

      const { data, error: fetchError } = await query;

      if (fetchId !== fetchIdRef.current) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      const orders = ((data ?? []) as unknown[])
        .map((row: any) => {
          // Unwrap: query from online_orders returns { order_id, orders: {...} }
          const normalized = normalizeFetchedOrder(
            row.orders as FetchedOrderData,
          );
          return transformBroadcastToOrder(normalized);
        })
        .filter(isVisible)
        // Client-side date window (dot-notation not reliable in PostgREST)
        .filter((o) => {
          if (!bounds) return true;
          const t = o.opened_at ? new Date(o.opened_at).getTime() : 0;
          if (bounds.start_ts && t < new Date(bounds.start_ts).getTime())
            return false;
          if (bounds.end_ts && t >= new Date(bounds.end_ts).getTime())
            return false;
          return true;
        }); // same gate as useOnlineOrders

      setHistoricalOrders(orders);
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
    needsHistoricalFetch,
    supabase,
    locationId,
    filter.startDate,
    filter.endDate,
  ]);

  useEffect(() => {
    fetchHistorical();
  }, [fetchHistorical]);

  // When viewing today, live orders ARE the full result.
  const merged = useMemo(() => {
    if (!needsHistoricalFetch) return liveOrders;
    return mergeOrders(liveOrders, historicalOrders);
  }, [needsHistoricalFetch, liveOrders, historicalOrders]);

  return { onlineOrders: merged, isLoading, error, refresh: fetchHistorical };
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
