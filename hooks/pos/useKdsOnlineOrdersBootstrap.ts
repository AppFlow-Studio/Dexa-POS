import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { DEADLINES } from "@/lib/network/deadlines";
import { ONLINE_ORDER_SOURCES } from "@/lib/orderSource";
import { withDeadline } from "@/lib/network/withDeadline";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  normalizeFetchedOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useEffect } from "react";

// Slow safety-net refresh; realtime broadcasts are the primary feed (mirrors
// the KDS ticket board's own polling-fallback approach).
const REFRESH_INTERVAL_MS = 120_000;
const ONLINE_ORDERS_LIMIT = 100;

const ACTIVE_ONLINE_STATUSES = [
  "pending",
  "accepted",
  "sent_to_kitchen",
  "preparing",
  "ready",
];

/**
 * KDS-only bootstrap for the online-orders edge tab/drawer.
 *
 * KDS stations skip `useOrdersQuery` (the full POS workspace hydration), so
 * `useOrderStore.ordersById` would stay empty and the drawer selectors would
 * see nothing. This hook loads JUST the active online orders into the shared
 * order store via `upsertOrder` (reusing its rekey/merge/index maintenance),
 * then realtime order broadcasts (fanned into the store by
 * `handleOrderChangeKDS` in app/(main)/_layout.tsx) keep them live.
 */
export function useKdsOnlineOrdersBootstrap({
  locationId,
  enabled,
}: {
  locationId: string | null | undefined;
  enabled: boolean;
}) {
  const supabase = useSupabaseClient();

  useEffect(() => {
    if (!enabled || !locationId || !supabase) return;

    let cancelled = false;

    const fetchOnlineOrders = async () => {
      try {
        const { data, error } = await withDeadline(
          async (signal) =>
            await supabase
              .from("orders")
              .select(`*, order_items(*, order_item_modifiers(*))`)
              .eq("location_id", locationId)
              .in("order_source", [...ONLINE_ORDER_SOURCES])
              .eq("order_items.is_voided", false)
              .in("status", ACTIVE_ONLINE_STATUSES)
              .order("created_at", { ascending: false })
              .limit(ONLINE_ORDERS_LIMIT)
              .abortSignal(signal),
          DEADLINES.read,
          "kds_online_orders_bootstrap",
        );
        if (cancelled || error || !data) {
          if (error && __DEV__) {
            console.warn(
              "[KdsOnlineOrdersBootstrap] fetch failed:",
              (error as { message?: string }).message,
            );
          }
          return;
        }
        const store = useOrderStore.getState();
        for (const row of data as unknown[]) {
          store.upsertOrder(normalizeFetchedOrder(row as FetchedOrderData));
        }
      } catch (err) {
        if (__DEV__) {
          console.warn("[KdsOnlineOrdersBootstrap] fetch threw:", err);
        }
      }
    };

    fetchOnlineOrders();
    const interval = setInterval(fetchOnlineOrders, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, locationId, supabase]);
}
