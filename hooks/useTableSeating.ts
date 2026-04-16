import { OrderProfile } from "@/lib/types";
import { useSeatingStore } from "@/stores/useSeatingStore";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Encapsulates all seating logic for a table order:
 * - Server initialization + loading
 * - New item -> seat assignment
 * - DB item sync
 *
 * Seat data (item -> seat mapping, activeSeat) is always tracked and persisted,
 * regardless of the `enablePerSeatOrdering` dining toggle. That toggle now only
 * controls bill-view grouping (DenseSeatView vs flat/coursing view) — it does
 * not gate seat-number assignment, which is a first-class per-item tag shown
 * by BillItem whenever `seatNumber > 0`.
 */
export function useTableSeating(
  activeOrder: OrderProfile | undefined,
  partySize: number,
) {
  const orderId = activeOrder?.id;

  // Granular selectors
  const orderSeating = useSeatingStore(
    (s) => s.byOrderId[orderId || ""],
  );
  const initializeForOrder = useSeatingStore((s) => s.initializeForOrder);
  const loadFromServer = useSeatingStore((s) => s.loadFromServer);
  const getForOrder = useSeatingStore((s) => s.getForOrder);
  const storeSetItemSeat = useSeatingStore((s) => s.setItemSeat);
  const storeSetActiveSeat = useSeatingStore((s) => s.setActiveSeat);
  const storeAddSeat = useSeatingStore((s) => s.addSeat);
  const storeRemoveSeat = useSeatingStore((s) => s.removeSeat);

  const [seatingInitialized, setSeatingInitialized] = useState(false);
  const prevItemIdsRef = useRef<string[]>([]);
  const syncedDbItemsRef = useRef<Set<string>>(new Set());

  const itemIds = useMemo(
    () => activeOrder?.items?.map((i) => i.id).join(",") ?? "",
    [activeOrder?.items],
  );

  const dbItemIdsHash = useMemo(
    () =>
      activeOrder?.items
        ?.map((i) => i.db_order_item_id)
        .filter(Boolean)
        .join(",") ?? "",
    [activeOrder?.items],
  );

  // Init effect
  useEffect(() => {
    if (!orderId) {
      setSeatingInitialized(false);
      return;
    }

    syncedDbItemsRef.current = new Set();
    prevItemIdsRef.current = [];

    initializeForOrder(orderId, partySize, activeOrder?.db_order_id);

    if (!activeOrder?.db_order_id) {
      setSeatingInitialized(true);
      return;
    }

    loadFromServer(orderId)
      .then(() => setSeatingInitialized(true))
      .catch((error) => {
        console.error("[Seating] Failed to load from server:", error);
        setSeatingInitialized(true);
      });

    return () => {
      setSeatingInitialized(false);
    };
  }, [orderId, activeOrder?.db_order_id, partySize]);

  // New items effect — auto-assign to activeSeat
  useEffect(() => {
    if (!orderId || !seatingInitialized) return;

    const currentIds = itemIds.split(",").filter(Boolean);
    const prevIds = prevItemIdsRef.current;
    const prevSet = new Set(prevIds);

    // Build O(1) lookup map — avoids O(n²) .find() inside loops
    const itemMap = new Map<string, typeof activeOrder extends { items: (infer T)[] } ? T : never>();
    if (activeOrder?.items) {
      for (const item of activeOrder.items) {
        itemMap.set(item.id, item);
      }
    }

    if (prevIds.length === 0) {
      // First render — assign existing items from backend data
      const state = getForOrder(orderId);
      currentIds.forEach((id) => {
        if (id.startsWith('draft_')) return;
        if (state?.itemSeatMap?.[id] !== undefined) return;
        const item = itemMap.get(id);
        if (!item) return;
        const dbSeat = item.db_order_item_id
          ? state?.dbIdToSeatMap?.[item.db_order_item_id]
          : undefined;
        const seat =
          dbSeat !== undefined
            ? dbSeat
            : item.seatNumber !== undefined
              ? item.seatNumber
              : state?.activeSeat ?? null;
        storeSetItemSeat(orderId, id, seat, item.db_order_item_id, true);
      });
      prevItemIdsRef.current = currentIds;
      return;
    }

    const newIds = currentIds.filter((id) => !prevSet.has(id) && !id.startsWith('draft_'));
    if (newIds.length > 0) {
      const state = getForOrder(orderId);
      const useSeat = state?.activeSeat ?? null;
      newIds.forEach((id) => {
        const item = itemMap.get(id);
        const dbSeat = item?.db_order_item_id
          ? state?.dbIdToSeatMap?.[item.db_order_item_id]
          : undefined;

        if (dbSeat !== undefined) {
          storeSetItemSeat(orderId, id, dbSeat, item?.db_order_item_id, true);
        } else if (item?.seatNumber !== undefined && item.seatNumber !== null) {
          storeSetItemSeat(
            orderId,
            id,
            item.seatNumber,
            item?.db_order_item_id,
            true,
          );
        } else if (state?.itemSeatMap?.[id] === undefined) {
          storeSetItemSeat(orderId, id, useSeat, item?.db_order_item_id, true);
        }
      });
    }
    prevItemIdsRef.current = currentIds;
  }, [orderId, itemIds, seatingInitialized, activeOrder?.items]);

  // DB item sync effect
  useEffect(() => {
    if (!orderId || !activeOrder?.items || !seatingInitialized) return;

    activeOrder.items.forEach((item) => {
      if (item.isDraft) return;
      if (
        item.db_order_item_id &&
        !syncedDbItemsRef.current.has(item.db_order_item_id)
      ) {
        const state = getForOrder(orderId);

        let seat: number | null;
        if (item.seatNumber !== undefined && item.seatNumber !== null) {
          seat = item.seatNumber;
        } else if (
          state?.dbIdToSeatMap?.[item.db_order_item_id] !== undefined
        ) {
          seat = state.dbIdToSeatMap[item.db_order_item_id];
        } else if (state?.itemSeatMap?.[item.id] !== undefined) {
          seat = state.itemSeatMap[item.id];
        } else {
          seat = state?.activeSeat ?? null;
        }

        storeSetItemSeat(orderId, item.id, seat, item.db_order_item_id, false);
        syncedDbItemsRef.current.add(item.db_order_item_id);
      }
    });
  }, [orderId, dbItemIdsHash, seatingInitialized]);

  const activeSeat = orderSeating?.activeSeat ?? null;
  const itemSeatMap = orderSeating?.itemSeatMap;
  const seatCount = orderSeating?.seatCount ?? partySize;

  return {
    activeSeat,
    itemSeatMap,
    seatCount,
    seatingInitialized,
    setActiveSeat: (seat: number | null) => {
      if (orderId) storeSetActiveSeat(orderId, seat);
    },
    setItemSeat: (
      itemId: string,
      seat: number | null,
      dbItemId?: string,
    ) => {
      if (orderId) storeSetItemSeat(orderId, itemId, seat, dbItemId);
    },
    addSeat: (): number => {
      if (orderId) return storeAddSeat(orderId);
      return seatCount;
    },
    removeSeat: (): { removedSeat: number; reassignedItemCount: number } => {
      if (orderId) return storeRemoveSeat(orderId);
      return { removedSeat: 0, reassignedItemCount: 0 };
    },
  };
}
