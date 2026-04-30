import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { DEADLINES } from "@/lib/network/deadlines";
import { withDeadline } from "@/lib/network/withDeadline";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { maybeFireTakeoverToast } from "@/lib/takeoverToast";
import { OrderProfile } from "@/lib/types";
import {
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useEffect, useRef } from "react";
import { queryClient } from "@/contexts/TanstackProvider";

// `active(locationId)` is intentionally a *prefix*. The full queryKey used by
// useOrdersQuery is [...active(locationId), stationId ?? ''], so a station
// switch refetches with the right server-side filter. Callers that only know
// locationId (useOrderSyncRecovery, PosSyncProvider) should use this prefix
// with prefix-matching APIs (invalidateQueries, isFetching, queryCache.find with
// exact:false) — never with getQueryState (exact match) directly.
export const orderQueryKeys = {
  all: ["orders"] as const,
  active: (locationId: string) => ["orders", "active", locationId] as const,
};

const STATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useOrdersQuery({
  locationId,
  stationId,
  enabled = true,
}: {
  locationId: string | null;
  stationId: string | null;
  enabled?: boolean;
}) {
  const supabase = useSupabaseClient();

  const query = useQuery({
    queryKey: [...orderQueryKeys.active(locationId ?? ""), stationId ?? ""],
    queryFn: async (): Promise<OrderProfile[]> => {
      if (!locationId) throw new Error("No location ID");
      // Deadline-wrapped: bad WiFi falls back to TanStack offlineFirst cache.
      const { data, error } = await withDeadline(
        async (signal) => {
          let q = supabase
            .from("orders")
            .select(
              `*, order_items(*, order_item_modifiers(*)), order_payments(*),
               order_discounts(*),
               stations(station_name),
               created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)`,
            )
            .eq("location_id", locationId)
            .in("status", ["draft", "pending", "sent_to_kitchen", "preparing", "ready"]);

          // Drop other-stations' drafts at the source. station_id IS NULL keeps
          // external/online drafts (no POS station). UUID guard: stationId is
          // string-interpolated into a PostgREST filter and supabase-js does not
          // sanitize .or() — fall back to unfiltered query if the value is not a
          // UUID. The selector + realtime guard still hide remote drafts client-side.
          if (stationId && STATION_ID_RE.test(stationId)) {
            q = q.or(
              `status.neq.draft,station_id.is.null,station_id.eq.${stationId}`,
            );
          }

          return await q
            .order("created_at", { ascending: false })
            .abortSignal(signal);
        },
        DEADLINES.read,
        "orders_query",
      );
      if (error) throw error;
      return (data ?? []).map((o) => {
        const normalized = normalizeFetchedOrder(o as FetchedOrderData);
        return transformBroadcastToOrder(normalized);
      });
    },
    enabled: enabled && !!locationId && !!supabase,
    staleTime: 1000 * 60 * 2, // 2 min (realtime fills the gap)
    gcTime: 1000 * 60 * 3, // 3 min — Zustand is source of truth, cache only bridges reconnections
    refetchOnWindowFocus: false,
    refetchOnReconnect: false, // useOrderSyncRecovery handles reconnection dedup
    networkMode: "offlineFirst",
  });

  // Hydrate workspace on success — skip if data fingerprint is unchanged to avoid
  // unnecessary Immer draft creation + MMKV serialization on identical refetches.
  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (query.data && query.isSuccess && locationId) {
      const fp = `${query.data.length}:${query.data[0]?.opened_at ?? ""}`;
      if (fp === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fp;
      hydrateWorkspace(locationId, query.data);
    }
  }, [query.data, query.isSuccess, locationId]);

  return query;
}

function hydrateWorkspace(
  locationId: string,
  serverOrders: OrderProfile[],
) {
  const state = useOrderStore.getState();

  // Wave 2.1.1: snapshot ownership BEFORE the merge so we can detect
  // flip-away on the polling-recovery / reconnect-refetch path. Wave 2.1's
  // detection lives in `_handleOrderBroadcast` and won't fire when the
  // realtime channel was down — this is the catch-up path. We skip cold
  // starts (location switch / initial load) by gating on the location
  // having been previously hydrated to the same id.
  const _myStationId =
    useStoreSettingsStore.getState().selectedStation?.id ?? null;
  const _isSameLocationRehydrate =
    state.currentLocationId === locationId && state.orderIds.length > 0;

  // Preserve unsynced + pending-item orders
  const preserved: Record<string, OrderProfile> = {};
  const preservedIds: string[] = [];
  for (const id of state.unsyncedOrderIds) {
    if (state.ordersById[id]) {
      preserved[id] = state.ordersById[id];
      preservedIds.push(id);
    }
  }
  for (const id of state.orderIds) {
    if (preserved[id]) continue;
    const order = state.ordersById[id];
    if (
      order?.items.some((item) => !item.db_order_item_id && !item.isDraft)
    ) {
      preserved[id] = order;
      preservedIds.push(id);
    }
  }

  // Build server map — preserve locally-advanced order status to prevent
  // stale re-fetches from reverting optimistic updates (e.g. draft overwriting preparing)
  const STATUS_RANK: Record<string, number> = {
    draft: 0,
    pending: 0,
    sent_to_kitchen: 1,
    preparing: 1,
    ready: 2,
    completed: 3,
    closed: 3,
    void: 4,
  };
  const serverMap: Record<string, OrderProfile> = {};
  const serverIds: string[] = [];
  for (const order of serverOrders) {
    const key = order.db_order_id || order.id;
    const existing = state.ordersById[key];
    if (existing) {
      const localRank = STATUS_RANK[existing.order_status ?? ""] ?? 0;
      const serverRank = STATUS_RANK[order.order_status ?? ""] ?? 0;
      if (localRank > serverRank) {
        // Local is ahead (optimistic update) — preserve local status + kitchen timestamps
        serverMap[key] = {
          ...order,
          order_status: existing.order_status,
          sent_to_kitchen_at: existing.sent_to_kitchen_at ?? order.sent_to_kitchen_at,
          items: existing.items.length > 0 ? existing.items : order.items,
        };
      } else {
        serverMap[key] = order;
      }
    } else {
      serverMap[key] = order;
    }
    serverIds.push(key);
  }

  let newOrdersById: Record<string, OrderProfile> = { ...preserved, ...serverMap };
  let newOrderIds = [...new Set([...preservedIds, ...serverIds])];

  // One-shot cleanup of MMKV-persisted remote drafts from before the
  // station-private-drafts change. Drafts owned by other stations have no
  // business in this device's ordersById; drop them on every hydrate. Drafts
  // with no station_id (external/online) pass through.
  const myStationId =
    useStoreSettingsStore.getState().selectedStation?.id ?? null;
  if (myStationId) {
    const filteredById: Record<string, OrderProfile> = {};
    let pruned = 0;
    for (const id of newOrderIds) {
      const o = newOrdersById[id];
      if (!o) continue;
      if (
        o.order_status === "draft" &&
        o.station_id != null &&
        o.station_id !== myStationId
      ) {
        pruned++;
        continue;
      }
      filteredById[id] = o;
    }
    if (pruned > 0) {
      newOrdersById = filteredById;
      newOrderIds = newOrderIds.filter((id) => filteredById[id]);
      if (__DEV__) {
        console.log(
          `[hydrateWorkspace] Pruned ${pruned} remote-station draft(s) from local store`,
        );
      }
    }
  }

  // Wave 2.1.1: detect ownership-flip-away across the hydrate. Two cases:
  //   (a) prev was mine, next exists with a different station_id → flip-away
  //   (b) prev was mine + draft, next absent → silently pruned at line 178-202
  //       above. Also a flip-away from the user's POV.
  const _flippedAwayOrders: Array<{ orderId: string; prior: OrderProfile }> =
    [];
  if (_isSameLocationRehydrate && _myStationId) {
    for (const id of state.orderIds) {
      const prev = state.ordersById[id];
      if (!prev) continue;
      const wasMine = prev.station_id === _myStationId;
      if (!wasMine) continue;
      const orderIsTerminal =
        prev.order_status === "void" ||
        prev.order_status === "completed" ||
        prev.check_status === "Closed";
      if (orderIsTerminal) continue;

      const next = newOrdersById[id];
      const flippedAway =
        !next || (next.station_id != null && next.station_id !== _myStationId);
      if (flippedAway) {
        _flippedAwayOrders.push({ orderId: id, prior: prev });
      }
    }
  }

  // Skip setState if nothing meaningful changed — avoids Immer draft + MMKV serialization.
  // Server orders are always new object instances (transformBroadcastToOrder creates fresh objects),
  // so we compare by order count + status + item count as a lightweight content check.
  // Wave 2.1.1: include `station_id` in the equality check — a pure ownership
  // change must NOT be skipped here, otherwise the read-only banner won't flip.
  if (
    state.currentLocationId === locationId &&
    state.orderIds.length === newOrderIds.length &&
    newOrderIds.every((id) => {
      const prev = state.ordersById[id];
      const next = newOrdersById[id];
      if (!prev || !next) return false;
      return (
        prev.order_status === next.order_status &&
        prev.station_id === next.station_id &&
        prev.items.length === next.items.length &&
        prev.payments?.length === next.payments?.length
      );
    })
  ) {
    return;
  }

  useOrderStore.setState({
    ordersById: newOrdersById,
    orderIds: newOrderIds,
    currentLocationId: locationId,
  });

  // Wave 2.1.1: fire flip-away side effects AFTER setState so consumers see
  // the read-only state when the toast lands. Reuses the same dedup helper
  // as `_handleOrderBroadcast` — if a fast realtime broadcast already
  // toasted, this hydrate path stays silent (and vice versa).
  if (_flippedAwayOrders.length > 0) {
    const _activeOrderId = state.activeOrderId;
    for (const { orderId, prior } of _flippedAwayOrders) {
      queueMicrotask(() => maybeFireTakeoverToast(orderId, prior));
    }
    if (
      _activeOrderId &&
      _flippedAwayOrders.some((f) => f.orderId === _activeOrderId)
    ) {
      queueMicrotask(() => {
        const sheet = usePaymentDetailSheetStore.getState();
        if (sheet.isOpen && sheet.orderId === _activeOrderId) {
          sheet.close();
        }
      });
    }
  }
}

export function useInvalidateOrders() {
  return (locationId?: string) => {
    if (locationId) {
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.active(locationId),
      });
    } else {
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
    }
  };
}
