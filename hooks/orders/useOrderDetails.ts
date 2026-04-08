import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { orderHistoryKeys } from "./useOrderHistory";

export interface OrderDetailData {
  order: Record<string, unknown>;
  items: Array<{
    item: Record<string, unknown>;
    modifiers: Array<Record<string, unknown>>;
  }>;
  payments: Array<Record<string, unknown>>;
  reversals: Array<Record<string, unknown>>;
  order_refund_items: Array<Record<string, unknown>>;
  order_discounts: Array<Record<string, unknown>>;
  station_name: string | null;
  status_history?: Array<{
    id: string;
    status: string;
    changed_at: string;
    changed_by?: string;
    notes?: string;
  }>;
}

export function useOrderDetails(dbOrderId: string | undefined | null) {
  const supabase = useSupabaseClient();

  return useQuery<OrderDetailData | null>({
    queryKey: orderHistoryKeys.detail(dbOrderId ?? ""),
    queryFn: async () => {
      if (!dbOrderId) return null;

      const { data, error } = await supabase.rpc("get_order_details", {
        p_order_id: dbOrderId,
      });

      if (error) throw error;
      return data as OrderDetailData;
    },
    enabled: !!dbOrderId,
    staleTime: 1000 * 60 * 1, // 1 min
    gcTime: 1000 * 60 * 10,
  });
}
