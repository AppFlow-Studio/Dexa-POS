import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useOrderStore } from "@/stores/useOrderStore";
import { OrderProfile } from "@/lib/types";
import {
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useEffect } from "react";
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
    gcTime: 1000 * 60 * 10, // 10 min auto-GC
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    networkMode: "offlineFirst",
  });

  // Hydrate workspace on success
  useEffect(() => {
    if (query.data && query.isSuccess && locationId) {
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

  // Build server map
  const serverMap: Record<string, OrderProfile> = {};
  const serverIds: string[] = [];
  for (const order of serverOrders) {
    const key = order.db_order_id || order.id;
    serverMap[key] = order;
    serverIds.push(key);
  }

  useOrderStore.setState({
    ordersById: { ...preserved, ...serverMap },
    orderIds: [...new Set([...preservedIds, ...serverIds])],
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
