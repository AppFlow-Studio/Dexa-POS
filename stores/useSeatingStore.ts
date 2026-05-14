import { DEADLINES } from "@/lib/network/deadlines";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import { isValidUUID } from "@/utils/orderIdHelpers";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

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
  lastSyncAt?: Date;
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
  rekeyEntry: (oldOrderId: string, newOrderId: string) => void;
};

// ============================================================================
// STORE
// ============================================================================

export const useSeatingStore = create<SeatingState>()(
  immer((set, get) => ({
    byOrderId: {},

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    initializeForOrder: (
      orderId: string,
      seatCount: number,
      dbOrderId?: string,
    ) => {
      const existed = !!get().byOrderId[orderId];

      set((state) => {
        const existing = state.byOrderId[orderId];
        if (existing) {
          if (dbOrderId && !existing.dbOrderId) existing.dbOrderId = dbOrderId;
          if (seatCount !== existing.seatCount) existing.seatCount = seatCount;
          return;
        }
        state.byOrderId[orderId] = {
          activeSeat: null,
          itemSeatMap: {},
          dbIdToSeatMap: {},
          seatCount,
          syncing: false,
          dbOrderId,
        };
      });

      // Only auto-load on fresh inits; useTableSeating handles re-fetch via lastSyncAt gate.
      if (!existed && _supabaseClient && dbOrderId) {
        get().loadFromServer(orderId).catch(console.error);
      }
    },

    setDbOrderId: (orderId: string, dbOrderId: string) => {
      set((state) => {
        const existing = state.byOrderId[orderId];
        if (existing) {
          existing.dbOrderId = dbOrderId;
          return;
        }
        state.byOrderId[orderId] = {
          activeSeat: null,
          itemSeatMap: {},
          dbIdToSeatMap: {},
          seatCount: 2,
          syncing: false,
          dbOrderId,
        };
      });
    },

    loadFromServer: async (orderId: string) => {
      const supabase = _supabaseClient;
      const orderData = get().byOrderId[orderId];
      const dbOrderId = orderData?.dbOrderId;

      if (!supabase || !dbOrderId) {
        return;
      }

      set((state) => {
        const o = state.byOrderId[orderId];
        if (o) o.syncing = true;
      });

      try {
        const { data, error } = await supabase
          .from("order_items")
          .select("id, seat_number")
          .eq("order_id", dbOrderId)
          .not("seat_number", "is", null);

        if (error) throw error;

        set((state) => {
          const o = state.byOrderId[orderId];
          if (!o) return;
          // Server is base; local overrides win
          const merged: Record<string, number | null> = {};
          if (data) {
            for (const item of data) {
              merged[item.id] = item.seat_number;
            }
          }
          for (const [k, v] of Object.entries(o.dbIdToSeatMap)) {
            merged[k] = v;
          }
          o.dbIdToSeatMap = merged;
          o.syncing = false;
          o.lastSyncAt = new Date();
        });
      } catch (error) {
        console.error("Failed to load seat assignments:", error);
        set((state) => {
          const o = state.byOrderId[orderId];
          if (o) o.syncing = false;
        });
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

      if (orderData.itemSeatMap[itemId] !== undefined) {
        return orderData.itemSeatMap[itemId];
      }

      if (dbItemId && orderData.dbIdToSeatMap?.[dbItemId] !== undefined) {
        return orderData.dbIdToSeatMap[dbItemId];
      }

      return orderData.activeSeat;
    },

    getSeatCount: (orderId: string) =>
      get().byOrderId[orderId]?.seatCount ?? 2,

    // ========================================================================
    // LOCAL ACTIONS
    // ========================================================================

    setActiveSeat: (orderId: string, seatNumber: number | null) => {
      set((state) => {
        const o = state.byOrderId[orderId];
        if (!o) return;
        o.activeSeat = seatNumber;
      });
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

      set((state) => {
        const o = state.byOrderId[orderId];
        if (!o) return;
        o.itemSeatMap[itemId] = seatNumber;
        if (dbItemId) o.dbIdToSeatMap[dbItemId] = seatNumber;
      });

      if (skipBackendSync) return;

      const dbOrderId = orderData.dbOrderId;

      if (!dbItemId || !isValidUUID(dbItemId)) {
        queueOperation({
          type: "set_item_seat",
          params: { dbItemId: dbItemId ?? null, seatNumber, localOrderId: orderId, localItemId: itemId },
          localOrderId: orderId,
        });
        return;
      }

      if (!getIsOnline()) {
        queueOperation({
          type: "set_item_seat",
          params: { dbItemId, seatNumber },
          localOrderId: orderId,
        });
        return;
      }

      if (_supabaseClient && dbOrderId) {
        const client = _supabaseClient;
        runWithDeadline(
          "set_item_seat",
          DEADLINES.hotMutation,
          async (signal) => {
            const { data, error } = await client
              .rpc("set_item_seat", {
                p_order_item_id: dbItemId,
                p_seat_number: seatNumber,
              })
              .abortSignal(signal);
            return { data, error };
          },
        ).then(({ error }) => {
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
      set((state) => {
        const o = state.byOrderId[orderId];
        if (!o) return;
        o.seatCount = seatCount;
      });
    },

    assignItemsToActiveSeat: (orderId: string, itemIds: string[]) => {
      set((state) => {
        const o = state.byOrderId[orderId];
        if (!o) return;
        for (const id of itemIds) {
          if (o.itemSeatMap[id] === undefined) {
            o.itemSeatMap[id] = o.activeSeat;
          }
        }
      });
    },

    addSeat: (orderId: string): number => {
      const orderData = get().byOrderId[orderId];
      if (!orderData) return 1;

      const newCount = orderData.seatCount + 1;
      set((state) => {
        const o = state.byOrderId[orderId];
        if (o) o.seatCount = newCount;
      });
      return newCount;
    },

    removeSeat: (orderId: string): { removedSeat: number; reassignedItemCount: number } => {
      const orderData = get().byOrderId[orderId];
      if (!orderData || orderData.seatCount <= 1) {
        return { removedSeat: 0, reassignedItemCount: 0 };
      }

      const removedSeat = orderData.seatCount;
      let reassignedItemCount = 0;
      const dbItemIdsToSync: string[] = [];

      set((state) => {
        const o = state.byOrderId[orderId];
        if (!o) return;

        for (const [itemId, seat] of Object.entries(o.itemSeatMap)) {
          if (seat === removedSeat) {
            o.itemSeatMap[itemId] = null;
            reassignedItemCount++;
          }
        }

        for (const [dbItemId, seat] of Object.entries(o.dbIdToSeatMap)) {
          if (seat === removedSeat) {
            o.dbIdToSeatMap[dbItemId] = null;
            if (isValidUUID(dbItemId)) {
              dbItemIdsToSync.push(dbItemId);
            }
          }
        }

        o.seatCount = removedSeat - 1;
        if (o.activeSeat === removedSeat) o.activeSeat = null;
      });

      if (_supabaseClient && dbItemIdsToSync.length > 0) {
        const client = _supabaseClient;
        for (const dbItemId of dbItemIdsToSync) {
          runWithDeadline(
            "set_item_seat",
            DEADLINES.hotMutation,
            async (signal) => {
              const { data, error } = await client
                .rpc("set_item_seat", {
                  p_order_item_id: dbItemId,
                  p_seat_number: null,
                })
                .abortSignal(signal);
              return { data, error };
            },
          ).then(({ error }) => {
            if (error) {
              console.error("Failed to sync item seat on remove, queuing:", error);
              queueOperation({
                type: "set_item_seat",
                params: { dbItemId, seatNumber: null },
                localOrderId: orderId,
              });
            }
          });
        }
      }

      return { removedSeat, reassignedItemCount };
    },

    // ========================================================================
    // CLEANUP
    // ========================================================================

    clearOrder: (orderId: string) => {
      set((state) => {
        delete state.byOrderId[orderId];
      });
    },

    rekeyEntry: (oldOrderId: string, newOrderId: string) => {
      if (oldOrderId === newOrderId) return;
      set((state) => {
        const entry = state.byOrderId[oldOrderId];
        if (!entry) return;
        delete state.byOrderId[oldOrderId];
        state.byOrderId[newOrderId] = { ...entry, dbOrderId: newOrderId };
      });
    },
  })),
);

// ============================================================================
// SELECTORS
// ============================================================================

export const selectActiveSeat =
  (orderId: string) => (state: SeatingState) =>
    state.getActiveSeat(orderId);

export const selectSeatCount =
  (orderId: string) => (state: SeatingState) =>
    state.getSeatCount(orderId);
