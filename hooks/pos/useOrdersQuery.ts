import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useOrderStore } from "@/stores/useOrderStore";
import { OrderProfile } from "@/lib/types";
import {
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useEffect, useRef } from "react";
import { queryClient } from "@/contexts/TanstackProvider";

export const orderQueryKeys = {
  all: ["orders"] as const,
  active: (locationId: string) => ["orders", "active", locationId] as const,
};

export function useOrdersQuery({
  locationId,
  enabled = true,
}: {
  locationId: string | null;
  enabled?: boolean;
}) {
  const supabase = useSupabaseClient();

  const query = useQuery({
    queryKey: orderQueryKeys.active(locationId ?? ""),
    queryFn: async (): Promise<OrderProfile[]> => {
      if (!locationId) throw new Error("No location ID");
      const { data, error } = await supabase
        .from("orders")
        .select(
          `*, order_items(*, order_item_modifiers(*)), order_payments(*),
           stations(station_name),
           created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)`,
        )
        .eq("location_id", locationId)
        .in("status", ["draft", "pending", "sent_to_kitchen", "preparing", "ready"])
        .order("created_at", { ascending: false });
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

  const newOrdersById = { ...preserved, ...serverMap };
  const newOrderIds = [...new Set([...preservedIds, ...serverIds])];

  // Skip setState if nothing meaningful changed — avoids Immer draft + MMKV serialization.
  // Server orders are always new object instances (transformBroadcastToOrder creates fresh objects),
  // so we compare by order count + status + item count as a lightweight content check.
  if (
    state.currentLocationId === locationId &&
    state.orderIds.length === newOrderIds.length &&
    newOrderIds.every((id) => {
      const prev = state.ordersById[id];
      const next = newOrdersById[id];
      if (!prev || !next) return false;
      return (
        prev.order_status === next.order_status &&
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
