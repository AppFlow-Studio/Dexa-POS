import { useEffect, useMemo } from "react";
import { useOrderDetails } from "./useOrderDetails";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import type { ReversalRecord, OrderRefundItemRecord } from "@/types/refunds";

interface UseOrderDetailsFetchParams {
  dbOrderId: string | undefined | null;
  localOrderId: string | undefined | null;
  isActiveOrder: boolean;
  hasExistingReversals: boolean;
  enabled: boolean;
}

export function useOrderDetailsFetch({
  dbOrderId,
  localOrderId,
  isActiveOrder,
  hasExistingReversals,
  enabled,
}: UseOrderDetailsFetchParams) {
  // Skip query if reversals are already loaded
  const shouldFetch = enabled && !!dbOrderId && !hasExistingReversals;

  const { data, isLoading, error } = useOrderDetails(
    shouldFetch ? dbOrderId : null
  );

  const reversals = useMemo(
    () => (data?.reversals as ReversalRecord[] | undefined) ?? [],
    [data?.reversals]
  );

  const orderRefundItems = useMemo(
    () =>
      (data?.order_refund_items as OrderRefundItemRecord[] | undefined) ?? [],
    [data?.order_refund_items]
  );

  // Side-effect: write fetched data into the appropriate store
  useEffect(() => {
    if (!data || !localOrderId || !dbOrderId) return;
    if (reversals.length === 0 && orderRefundItems.length === 0) return;

    if (isActiveOrder) {
      useOrderStore.getState().patchOrder(localOrderId, {
        reversals,
        order_refund_items: orderRefundItems,
      });
    } else {
      usePreviousOrdersStore.setState((state) => ({
        previousOrders: state.previousOrders.map((po) =>
          po.orderId === localOrderId || po.db_order_id === dbOrderId
            ? { ...po, reversals, order_refund_items: orderRefundItems }
            : po
        ),
      }));
    }
  }, [data, localOrderId, dbOrderId, isActiveOrder, reversals, orderRefundItems]);

  return {
    reversals,
    orderRefundItems,
    isLoading: shouldFetch ? isLoading : false,
    error,
  };
}
