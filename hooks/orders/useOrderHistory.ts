import { useInfiniteQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { OrderProfile } from "@/lib/types";
import {
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useMemo, useRef, useEffect, useState } from "react";

const PAGE_SIZE = 50;

export const orderHistoryKeys = {
  all: ["orderHistory"] as const,
  list: (locationId: string, filters: Record<string, unknown>) =>
    ["orderHistory", "list", locationId, filters] as const,
  detail: (orderId: string) => ["orderHistory", "detail", orderId] as const,
};

interface OrderHistoryFilters {
  searchText: string;
  statusFilter: string[];
  orderTypeFilter: string[];
  sortBy: "date" | "total" | "status";
  sortOrder: "asc" | "desc";
  needsAttention?: boolean;
  refundedOnly?: boolean;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useOrderHistory(filters: OrderHistoryFilters) {
  const supabase = useSupabaseClient();
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? "");

  const debouncedSearch = useDebouncedValue(filters.searchText, 300);

  const queryFilters = useMemo(
    () => ({
      searchText: debouncedSearch,
      statusFilter: filters.statusFilter,
      orderTypeFilter: filters.orderTypeFilter,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      needsAttention: filters.needsAttention,
      refundedOnly: filters.refundedOnly,
    }),
    [
      debouncedSearch,
      filters.statusFilter,
      filters.orderTypeFilter,
      filters.sortBy,
      filters.sortOrder,
      filters.needsAttention,
      filters.refundedOnly,
    ],
  );

  const query = useInfiniteQuery({
    queryKey: orderHistoryKeys.list(locationId, queryFilters),
    queryFn: async ({ pageParam = 0 }) => {
      if (!locationId) throw new Error("No location ID");

      // Build sorting
      const sortColumn =
        queryFilters.sortBy === "total"
          ? "total_amount"
          : queryFilters.sortBy === "status"
            ? "payment_status"
            : "created_at";
      const ascending = queryFilters.sortOrder === "asc";

      let q = supabase
        .from("orders")
        .select(
          `*,
          order_items(*, order_item_modifiers(*)),
          order_payments(*),
          stations(station_name),
          created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)`,
        )
        .eq("location_id", locationId)
        .neq("status", "draft")
        .order(sortColumn, { ascending })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      // Apply status filters
      if (queryFilters.statusFilter.length > 0) {
        const statusMap: Record<string, string> = {
          Paid: "paid",
          Partial: "partial",
          Pending: "pending",
          Unpaid: "pending",
          Refunded: "refunded",
          "Partially Refunded": "partially_refunded",
        };
        const dbStatuses = queryFilters.statusFilter
          .map((s) => statusMap[s] || s.toLowerCase())
          .filter(Boolean);
        if (dbStatuses.length > 0) {
          q = q.in("payment_status", dbStatuses);
        }
      }

      // Apply order type filters
      if (queryFilters.orderTypeFilter.length > 0) {
        const typeMap: Record<string, string> = {
          "Dine In": "dine_in",
          Takeaway: "takeout",
          Delivery: "delivery",
        };
        const dbTypes = queryFilters.orderTypeFilter
          .map((t) => typeMap[t] || t.toLowerCase())
          .filter(Boolean);
        if (dbTypes.length > 0) {
          q = q.in("order_type", dbTypes);
        }
      }

      // Apply search filter (server-side)
      if (queryFilters.searchText.trim()) {
        q = q.or(
          `display_number.ilike.%${queryFilters.searchText}%,order_number.ilike.%${queryFilters.searchText}%`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;

      // Transform to OrderProfile
      const orders: OrderProfile[] = (data ?? []).map((o) => {
        const normalized = normalizeFetchedOrder(o as FetchedOrderData);
        return transformBroadcastToOrder(normalized);
      });

      // Client-side filter: needs attention
      let filtered = orders;
      if (queryFilters.needsAttention) {
        filtered = filtered.filter(
          (o) => o.paid_status === "Paid" && o.check_status !== "Closed",
        );
      }

      // Client-side filter: refunded only
      if (queryFilters.refundedOnly) {
        filtered = filtered.filter((o) => {
          const totalRefunded = (o.payments || []).reduce(
            (sum, p) => sum + (p.refundedAmount ?? 0),
            0,
          );
          return totalRefunded > 0 || o.order_status === "refunded";
        });
      }

      return filtered;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    initialPageParam: 0,
    enabled: !!locationId && !!supabase,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // Flatten all pages into a single array
  const orders = useMemo(
    () => query.data?.pages.flat() ?? [],
    [query.data?.pages],
  );

  // Count needs-attention orders for the pill badge
  const needsAttentionCount = useMemo(() => {
    return orders.filter(
      (o) => o.paid_status === "Paid" && o.check_status !== "Closed",
    ).length;
  }, [orders]);

  return {
    orders,
    needsAttentionCount,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
