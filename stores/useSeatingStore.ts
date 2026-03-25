import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import { isValidUUID } from "@/utils/orderIdHelpers";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

// ============================================================================
// SUPABASE CLIENT (Global pattern like useCoursingStore)
// ============================================================================

let _supabaseClient: SupabaseClient | null = null;

export function setSeatingSupabaseClient(client: SupabaseClient | null) {
  _supabaseClient = client;
}

// ============================================================================
// TYPES
// ============================================================================

type OrderSeating = {
  activeSeat: number | null; // null = "Shared" mode
  itemSeatMap: Record<string, number | null>; // localItemId → seat
  dbIdToSeatMap: Record<string, number | null>; // dbItemId → seat (backend sync)
  seatCount: number; // from party_size
  syncing: boolean;
  dbOrderId?: string;
};

type SeatingState = {
  byOrderId: Record<string, OrderSeating>;

  // Initialization
  initializeForOrder: (
    orderId: string,
    seatCount: number,
    dbOrderId?: string,
  ) => void;
  setDbOrderId: (orderId: string, dbOrderId: string) => void;
  loadFromServer: (orderId: string) => Promise<void>;

  // Getters
  getForOrder: (orderId: string) => OrderSeating | undefined;
  getActiveSeat: (orderId: string) => number | null;
  getItemSeat: (
    orderId: string,
    itemId: string,
    dbItemId?: string,
  ) => number | null;
  getSeatCount: (orderId: string) => number;

  // Local actions
  setActiveSeat: (orderId: string, seatNumber: number | null) => void;
  setItemSeat: (
    orderId: string,
    itemId: string,
    seatNumber: number | null,
    dbItemId?: string,
    skipBackendSync?: boolean,
  ) => void;
  setSeatCount: (orderId: string, seatCount: number) => void;
  assignItemsToActiveSeat: (orderId: string, itemIds: string[]) => void;
  addSeat: (orderId: string) => number;
  removeSeat: (orderId: string) => { removedSeat: number; reassignedItemCount: number };

  // Cleanup
  clearOrder: (orderId: string) => void;
};

// ============================================================================
// STORE
// ============================================================================

export const useSeatingStore = create<SeatingState>((set, get) => ({
  byOrderId: {},

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  initializeForOrder: (
    orderId: string,
    seatCount: number,
    dbOrderId?: string,
  ) => {
    const state = get();
    if (state.byOrderId[orderId]) {
      // Update dbOrderId/seatCount if we now have them
      const existing = state.byOrderId[orderId];
      const needsUpdate =
        (dbOrderId && !existing.dbOrderId) ||
        (seatCount !== existing.seatCount);
      if (needsUpdate) {
        set((prev) => ({
          byOrderId: {
            ...prev.byOrderId,
            [orderId]: {
              ...prev.byOrderId[orderId],
              ...(dbOrderId ? { dbOrderId } : {}),
              ...(seatCount !== existing.seatCount ? { seatCount } : {}),
            },
          },
        }));
      }
      return;
    }

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          activeSeat: null,
          itemSeatMap: {},
          dbIdToSeatMap: {},
          seatCount,
          syncing: false,
          dbOrderId,
        },
      },
    }));

    // Load from server if we have dbOrderId
    if (_supabaseClient && dbOrderId) {
      get().loadFromServer(orderId).catch(console.error);
    }
  },

  setDbOrderId: (orderId: string, dbOrderId: string) => {
    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...(prev.byOrderId[orderId] ?? {
            activeSeat: null,
            itemSeatMap: {},
            dbIdToSeatMap: {},
            seatCount: 2,
            syncing: false,
          }),
          dbOrderId,
        },
      },
    }));
  },

  loadFromServer: async (orderId: string) => {
    const supabase = _supabaseClient;
    const orderData = get().byOrderId[orderId];
    const dbOrderId = orderData?.dbOrderId;

    if (!supabase || !dbOrderId) {
      return;
    }

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: { ...prev.byOrderId[orderId], syncing: true },
      },
    }));

    try {
      // Query order_items to build dbIdToSeatMap
      const { data, error } = await supabase
        .from("order_items")
        .select("id, seat_number")
        .eq("order_id", dbOrderId)
        .not("seat_number", "is", null);

      if (error) throw error;

      const dbIdToSeatMap: Record<string, number | null> = {};
      if (data) {
        for (const item of data) {
          dbIdToSeatMap[item.id] = item.seat_number;
        }
      }

      set((prev) => ({
        byOrderId: {
          ...prev.byOrderId,
          [orderId]: {
            ...prev.byOrderId[orderId],
            dbIdToSeatMap: {
              ...dbIdToSeatMap,
              ...(prev.byOrderId[orderId]?.dbIdToSeatMap || {}),
            },
            syncing: false,
          },
        },
      }));
    } catch (error) {
      console.error("Failed to load seat assignments:", error);
      set((prev) => ({
        byOrderId: {
          ...prev.byOrderId,
          [orderId]: { ...prev.byOrderId[orderId], syncing: false },
        },
      }));
    }
  },

  // ========================================================================
  // GETTERS
  // ========================================================================

  getForOrder: (orderId: string) => get().byOrderId[orderId],

  getActiveSeat: (orderId: string) =>
    get().byOrderId[orderId]?.activeSeat ?? null,

  getItemSeat: (
    orderId: string,
    itemId: string,
    dbItemId?: string,
  ): number | null => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return null;

    // Check local itemSeatMap by local ID
    if (orderData.itemSeatMap[itemId] !== undefined) {
      return orderData.itemSeatMap[itemId];
    }

    // Check dbIdToSeatMap by db_order_item_id
    if (dbItemId && orderData.dbIdToSeatMap?.[dbItemId] !== undefined) {
      return orderData.dbIdToSeatMap[dbItemId];
    }

    // Fall back to active seat (null = shared)
    return orderData.activeSeat;
  },

  getSeatCount: (orderId: string) =>
    get().byOrderId[orderId]?.seatCount ?? 2,

  // ========================================================================
  // LOCAL ACTIONS
  // ========================================================================

  setActiveSeat: (orderId: string, seatNumber: number | null) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          activeSeat: seatNumber,
        },
      },
    }));
  },

  setItemSeat: (
    orderId: string,
    itemId: string,
    seatNumber: number | null,
    dbItemId?: string,
    skipBackendSync?: boolean,
  ) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    // Update local state
    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          itemSeatMap: {
            ...prev.byOrderId[orderId].itemSeatMap,
            [itemId]: seatNumber,
          },
          dbIdToSeatMap: dbItemId
            ? {
                ...prev.byOrderId[orderId].dbIdToSeatMap,
                [dbItemId]: seatNumber,
              }
            : prev.byOrderId[orderId].dbIdToSeatMap,
        },
      },
    }));

    // Sync to backend — queue for offline if needed
    if (skipBackendSync) return;

    const dbOrderId = orderData.dbOrderId;

    // If we don't have a valid DB item ID yet, queue immediately
    if (!dbItemId || !isValidUUID(dbItemId)) {
      queueOperation({
        type: "set_item_seat",
        params: { dbItemId: dbItemId ?? null, seatNumber, localOrderId: orderId, localItemId: itemId },
        localOrderId: orderId,
      });
      return;
    }

    // If offline, queue directly
    if (!getIsOnline()) {
      queueOperation({
        type: "set_item_seat",
        params: { dbItemId, seatNumber },
        localOrderId: orderId,
      });
      return;
    }

    // Online with valid IDs — try RPC, queue on failure
    if (_supabaseClient && dbOrderId) {
      _supabaseClient
        .rpc("set_item_seat", {
          p_order_item_id: dbItemId,
          p_seat_number: seatNumber,
        })
        .then(({ error }: { error: any }) => {
          if (error) {
            console.error("Failed to sync item seat, queuing:", error);
            queueOperation({
              type: "set_item_seat",
              params: { dbItemId, seatNumber },
              localOrderId: orderId,
            });
          }
        });
    }
  },

  setSeatCount: (orderId: string, seatCount: number) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          seatCount,
        },
      },
    }));
  },

  assignItemsToActiveSeat: (orderId: string, itemIds: string[]) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    set((prev) => {
      const newMap = { ...prev.byOrderId[orderId].itemSeatMap };
      itemIds.forEach((id) => {
        if (newMap[id] === undefined) newMap[id] = orderData.activeSeat;
      });
      return {
        byOrderId: {
          ...prev.byOrderId,
          [orderId]: { ...prev.byOrderId[orderId], itemSeatMap: newMap },
        },
      };
    });
  },

  addSeat: (orderId: string): number => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return 1;

    const newCount = orderData.seatCount + 1;
    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          seatCount: newCount,
        },
      },
    }));
    return newCount;
  },

  removeSeat: (orderId: string): { removedSeat: number; reassignedItemCount: number } => {
    const orderData = get().byOrderId[orderId];
    if (!orderData || orderData.seatCount <= 1) {
      return { removedSeat: 0, reassignedItemCount: 0 };
    }

    const removedSeat = orderData.seatCount;
    let reassignedItemCount = 0;

    // Collect db item IDs that need backend sync (items on the removed seat)
    const dbItemIdsToSync: string[] = [];

    const newItemSeatMap = { ...orderData.itemSeatMap };
    for (const [itemId, seat] of Object.entries(newItemSeatMap)) {
      if (seat === removedSeat) {
        newItemSeatMap[itemId] = null;
        reassignedItemCount++;
      }
    }

    const newDbIdToSeatMap = { ...orderData.dbIdToSeatMap };
    for (const [dbItemId, seat] of Object.entries(newDbIdToSeatMap)) {
      if (seat === removedSeat) {
        newDbIdToSeatMap[dbItemId] = null;
        if (isValidUUID(dbItemId)) {
          dbItemIdsToSync.push(dbItemId);
        }
      }
    }

    const newActiveSeat = orderData.activeSeat === removedSeat ? null : orderData.activeSeat;

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          seatCount: removedSeat - 1,
          itemSeatMap: newItemSeatMap,
          dbIdToSeatMap: newDbIdToSeatMap,
          activeSeat: newActiveSeat,
        },
      },
    }));

    // Backend sync: update reassigned items
    if (_supabaseClient && dbItemIdsToSync.length > 0) {
      for (const dbItemId of dbItemIdsToSync) {
        _supabaseClient
          .rpc("set_item_seat", {
            p_order_item_id: dbItemId,
            p_seat_number: null,
          })
          .then(({ error }) => {
            if (error) console.error("Failed to sync item seat on remove:", error);
          });
      }
    }

    return { removedSeat, reassignedItemCount };
  },

  // ========================================================================
  // CLEANUP
  // ========================================================================

  clearOrder: (orderId: string) => {
    set((prev) => {
      const { [orderId]: _, ...remaining } = prev.byOrderId;
      return { byOrderId: remaining };
    });
  },
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectActiveSeat =
  (orderId: string) => (state: SeatingState) =>
    state.getActiveSeat(orderId);

export const selectSeatCount =
  (orderId: string) => (state: SeatingState) =>
    state.getSeatCount(orderId);
