import { useSupabaseClient } from "@/hooks/useSupabaseClient";
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

export interface OnlineOrderDateFilter {
  preset: DatePreset;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Loads every Online Orders preset through the same server-authoritative
 * location-local date contract, then reconciles those rows with realtime state.
 */
export function useOnlineOrdersByDate(filter: OnlineOrderDateFilter): {
  onlineOrders: OrderProfile[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const supabase = useSupabaseClient();
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  const liveOrders = useOnlineOrders();
  const ordersById = useOrderStore((s) => s.ordersById);
  const currentLocationId = useOrderStore((s) => s.currentLocationId);
  const filterKey = `${locationId ?? ""}:${filter.preset}:${filter.startDate ?? ""}:${filter.endDate ?? ""}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    rows: OnlineOrderBoardSelection[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const fetchIdRef = useRef(0);

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
    setIsLoading(true);
    setError(null);

    (async () => {
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

        if (cancelled || fetchId !== fetchIdRef.current) return;
        if (boardResult.error) {
          setError(boardResult.error.message ?? "Failed to load online orders");
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

        useOrderStore.setState((state) => {
          const nextOrdersById = { ...state.ordersById };
          for (const order of fetchedOrders) {
            const key = order.db_order_id ?? order.id;
            nextOrdersById[key] = reconcileOnlineOrderSnapshot(
              nextOrdersById[key],
              order,
            );
          }
          return { ordersById: nextOrdersById };
        });
        setSelectionState({ key: filterKey, rows: nextSelections });
      } catch (caught: any) {
        if (!cancelled && fetchId === fetchIdRef.current) {
          setError(caught?.message ?? "Failed to load online orders");
        }
      } finally {
        if (!cancelled && fetchId === fetchIdRef.current) {
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
    filter.preset,
    filter.startDate,
    filter.endDate,
    filterKey,
    refreshVersion,
  ]);

  const hasServerSelection = selectionState?.key === filterKey;
  const selections = hasServerSelection
    ? selectionState.rows
    : EMPTY_SELECTIONS;
  const locationLiveOrders =
    currentLocationId === locationId ? liveOrders : EMPTY_ORDERS;
  const missingActiveOrderKey = useMemo(() => {
    if (!hasServerSelection) return "";
    return getMissingActiveOnlineOrderIds(selections, locationLiveOrders).join(
      ":",
    );
  }, [hasServerSelection, selections, locationLiveOrders]);

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
        includeLiveCompleted: filter.preset === "today" && !hasServerSelection,
      }),
    [
      selections,
      ordersById,
      locationLiveOrders,
      filter.preset,
      hasServerSelection,
    ],
  );

  return { onlineOrders, isLoading, error, refresh };
}
