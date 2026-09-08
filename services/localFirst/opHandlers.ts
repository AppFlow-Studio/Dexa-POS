/**
 * Drain handlers — the binding between the outbox and the v4/v5 RPCs.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §6, §7.2, §9.5
 *
 * ── Why these call the RPCs directly ───────────────────────────────────────
 *
 * `OrderService` methods go through `rpcWithIdempotency`, which owns a version
 * fallback chain (v1 → v2 → v3) and an origin-capable upgrade map
 * (`add_order_item_v3` → `add_order_item_v4`). That machinery exists to let a
 * client work against an environment where the newest RPC is not deployed.
 *
 * The drain has the opposite requirement. It is pushing a row that ALREADY
 * EXISTS locally under a client-minted id, so falling back to a version that
 * cannot accept that id would mint a second identity server-side — recreating
 * the exact divergence this whole project removes. A missing v4/v5 must be a
 * loud, retryable failure, never a silent downgrade.
 *
 * So these call one named function each, and `p_origin_id` is passed
 * explicitly rather than being injected by the upgrade map.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 *
 * The outbox op id IS the idempotency key, and it is also stable across
 * retries because the row is written before the op. Combined with each RPC
 * being idempotent on the row id itself, a retry is safe twice over: the call
 * dedupes, and so does the row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getDb } from "@/lib/db/index";
import { dbWriteMutex } from "@/lib/db/mutex";
import type { ClaimedOp } from "@/lib/db/outbox";
import { isTerminalKitchenMutationError } from "@/lib/kdsSendTraceability";
import { markSessionSynced } from "@/lib/localFirst/unsyncedSessions";
import {
  outcomeFromError,
  type DrainOutcome,
  type OpHandlers,
} from "@/services/localFirst/outboxDrain";

/**
 * Take the server's number after a collision renumber (§6.3).
 *
 * The id never moves, so this is a pure field update in both places that hold
 * the number: the local row and whatever the operator is looking at. Best
 * effort — a failure here leaves a stale number on one device, which the next
 * header sync corrects, and must never fail the op that already succeeded.
 */
async function adoptServerOrderNumber(
  orderId: string,
  orderNumber: string,
  displayNumber: string | null,
): Promise<void> {
  try {
    const db = getDb();
    if (db) {
      await dbWriteMutex.runExclusive(async () => {
        await db.runAsync(
          `UPDATE orders SET order_number = ?, display_number = ? WHERE id = ?`,
          [orderNumber, displayNumber, orderId],
        );
      });
    }
  } catch (err) {
    console.warn("[Drain] renumber: local row not updated:", err);
  }

  try {
    const { useOrderStore } =
      require("@/stores/useOrderStore") as typeof import("@/stores/useOrderStore");
    useOrderStore.setState((state: any) => {
      const key = state.dbOrderIdIndex?.[orderId] ?? orderId;
      const order = state.ordersById?.[key];
      if (!order) return;
      order.order_number = orderNumber;
      if (displayNumber) order.display_number = displayNumber;
    });
  } catch (err) {
    console.warn("[Drain] renumber: store not updated:", err);
  }
}

// ---------------------------------------------------------------------------
// Payload shapes — what commitLocalWrite() stored alongside each row.
// ---------------------------------------------------------------------------

export interface CreateOrderPayload {
  merchantId: string;
  locationId: string;
  orderType: string;
  orderNumber?: string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  specialInstructions?: string | null;
  deviceId?: string | null;
  staffId?: string | null;
  stationId?: string | null;
}

export interface AddItemPayload {
  orderId: string;
  menuItemId?: string | null;
  quantity: number;
  unitPrice: number;
  cashUnitPrice?: number | null;
  itemName?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  menuId?: string | null;
  menuName?: string | null;
  selectedSizeId?: string | null;
  selectedSizeName?: string | null;
  sizePriceModifier?: number | null;
  modifiers?: unknown;
  specialInstructions?: string | null;
  courseNumber?: number | null;
  seatNumber?: number | null;
  stationId?: string | null;
  /**
   * The CartItem's id — a composite merge key, not the row uuid.
   *
   * Needed to bind db_order_item_id back onto the right cart line once the
   * drain confirms the row. Matching on the row uuid alone found nothing,
   * because that is not what the cart line is keyed by.
   */
  cartItemId?: string;
}

/**
 * Every item-mutation payload addresses the row by `itemId` — the uuid minted
 * in `addLocalItem`, which exists from the first frame. It is deliberately NOT
 * the CartItem's id: that is a composite merge key, and it is what the legacy
 * queue tried (and permanently failed) to resolve.
 */
export interface UpdateItemQuantityPayload {
  orderId: string;
  itemId: string;
  quantity: number;
}

export interface VoidItemPayload {
  orderId: string;
  itemId: string;
  reason: string;
}

export interface RemoveItemPayload {
  orderId: string;
  itemId: string;
}

export interface SetItemSeatPayload {
  orderId: string;
  itemId: string;
  seatNumber: number | null;
}

export interface ReplaceModifiersPayload {
  orderId: string;
  itemId: string;
  modifiers: unknown[];
}

export interface SendToKitchenPayload {
  orderId: string;
  itemIds: string[];
  orderStatus: string;
  itemStatus: string;
  staffId?: string | null;
  stationId?: string | null;
  deviceId?: string | null;
  sendIdempotencyKey?: string | null;
  itemsIdempotencyKey?: string | null;
}

export interface SeatGuestsPayload {
  tableIds: string[];
  partySize: number;
  orderId?: string | null;
  orderNumber?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  guestNotes?: string | null;
  reservationId?: string | null;
  waitlistId?: string | null;
  createOrder: boolean;
  stationId?: string | null;
  deviceId?: string | null;
  staffId?: string | null;
}

/** Surfaced to the UI when two stations seated the same table offline (§9.5). */
export interface TableOccupiedConflict {
  kind: "table_occupied";
  occupiedBySessionId: string;
  occupiedByOrderId: string | null;
  occupiedTableId: string;
  requestedSessionId: string | null;
  requestedOrderId: string | null;
}

export type ConflictSink = (conflict: TableOccupiedConflict) => void;

// ---------------------------------------------------------------------------

function rpcError(rpc: string, error: unknown): DrainOutcome {
  const outcome = outcomeFromError(error);
  const text =
    outcome.kind === "rejected"
      ? outcome.reason
      : outcome.kind === "retry"
        ? outcome.error
        : "";

  // A MISSING function is the failure that looks most like "sync is just
  // broken": the RPC 404s, the error is unrecognised, so it classifies as
  // transient and retries forever — silently, with the op stuck in the queue.
  // Call it out by name, because the fix is a migration, not a retry.
  if (/does not exist|schema cache|PGRST202/i.test(text)) {
    console.error(
      `[LF] ✗ ${rpc} — FUNCTION NOT DEPLOYED. Apply the migration for ${rpc} ` +
        `before enabling local-first writes. Ops will retry forever until you do.`,
      text,
    );
  } else {
    console.error(`[LF] ✗ ${rpc} ${outcome.kind}:`, text);
  }
  return outcome;
}

/**
 * A destructive op whose target is already gone has SUCCEEDED.
 *
 * `remove_order_item` and `void_order_item` both raise
 * "Order item not found or access denied" for a row that is not there, and
 * `classifyError` correctly reads that as permanent. For a DELETE that
 * classification is right about the retry and wrong about the meaning: the
 * intent was "this item must not be on the check", and it is not. Parking the
 * op leaves a red conflict flag and a scary log line describing a state the
 * operator asked for.
 *
 * This happens legitimately: an add can fail server-side (a rejected op, a
 * lost response) and the remove that follows it then addresses a row that was
 * never created. The end state is identical either way.
 */
function absentIsDone(
  outcome: DrainOutcome,
  rpc: string,
  itemId: string,
): DrainOutcome {
  if (
    // Deliberately NOT matching "does not exist": that is what a MISSING RPC
    // reports, and swallowing it here would turn "the migration was never
    // applied" into a silent success on every void and remove.
    outcome.kind === "rejected" &&
    /not found|no rows/i.test(outcome.reason)
  ) {
    console.log(
      `[LF] ✓ ${rpc} item=${itemId} — already absent server-side, nothing to undo`,
    );
    return { kind: "synced" };
  }
  return outcome;
}

/**
 * Build the handler table.
 *
 * `onTableOccupied` is injected rather than imported so this module stays
 * testable without a UI, and so the escalation is an explicit dependency —
 * a conflict that nobody is listening for is a lost order.
 */
export function makeOpHandlers(
  client: SupabaseClient,
  deps: { onTableOccupied?: ConflictSink } = {},
): OpHandlers {
  return {
    create_order: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as CreateOrderPayload;
      console.log(`[LF] → create_order_v4 order=${op.entityId}`);
      try {
        const { data, error } = await client.rpc("create_order_v4", {
          p_merchant_id: p.merchantId,
          p_location_id: p.locationId,
          p_order_type: p.orderType,
          p_table_number: p.tableNumber ?? null,
          p_customer_name: p.customerName ?? null,
          p_customer_phone: p.customerPhone ?? null,
          p_special_instructions: p.specialInstructions ?? null,
          p_device_id: p.deviceId ?? null,
          p_created_by_staff_id: p.staffId ?? null,
          p_station_id: p.stationId ?? null,
          p_idempotency_key: op.id,
          // THE point of the whole exercise: the id the device already used.
          p_order_id: op.entityId,
          p_order_number: p.orderNumber ?? null,
        });

        if (error) return rpcError("create_order_v4", error);
        console.log(
          `[LF] ✓ create_order_v4 order=${op.entityId} number=${data?.order_number} existed=${!!data?.already_existed}`,
        );

        // §6.3 — the server renumbered us because our locally minted number
        // collided. The ID is unchanged (identity is sacred); only the number
        // moved, and the device must correct what it displays. Logging it and
        // leaving the old number on screen is how a guest ends up holding a
        // receipt for a number that belongs to somebody else's order.
        if (data?.order_number_reassigned && data?.order_number) {
          console.warn(
            `[Drain] order ${op.entityId} was renumbered by the server: ` +
              `${p.orderNumber} -> ${data.order_number}`,
          );
          await adoptServerOrderNumber(
            op.entityId,
            data.order_number as string,
            (data.display_number as string | null) ?? null,
          );
        }
        return { kind: "synced" };
      } catch (error) {
        return rpcError("create_order_v4", error);
      }
    },

    add_item: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as AddItemPayload;
      console.log(
        `[LF] → add_order_item_v5 item=${op.entityId} order=${p.orderId} name=${p.itemName} qty=${p.quantity}`,
      );
      try {
        const { data, error } = await client.rpc("add_order_item_v5", {
          p_order_id: p.orderId,
          p_menu_item_id: p.menuItemId ?? null,
          p_quantity: p.quantity,
          p_unit_price: p.unitPrice,
          p_cash_unit_price: p.cashUnitPrice ?? null,
          p_item_name: p.itemName ?? null,
          p_category_name: p.categoryName ?? null,
          p_selected_size_id: p.selectedSizeId ?? null,
          p_selected_size_name: p.selectedSizeName ?? null,
          p_size_price_modifier: p.sizePriceModifier ?? 0,
          p_modifiers: p.modifiers ?? null,
          p_special_instructions: p.specialInstructions ?? null,
          p_course_number: p.courseNumber ?? 1,
          p_seat_number: p.seatNumber ?? null,
          p_menu_id: p.menuId ?? null,
          p_menu_name: p.menuName ?? null,
          p_category_id: p.categoryId ?? null,
          p_idempotency_key: op.id,
          p_station_id: p.stationId ?? null,
          // Not routed through ORIGIN_CAPABLE_RPC: that map upgrades
          // add_order_item_v3 -> v4, and we are already on v5. Passed directly
          // so this write is still recognised as our own echo.
          p_origin_id: op.id,
          p_item_id: op.entityId,
        });

        if (error) return rpcError("add_order_item_v5", error);
        console.log(
          `[LF] ✓ add_order_item_v5 item=${op.entityId} order=${p.orderId} existed=${!!data?.already_existed}`,
        );

        // NOW the server has the row, so the cart line may advertise it.
        // Every downstream path (kitchen send, coursing, seat assignment)
        // reads db_order_item_id as "the server has this" and fails hard if it
        // lies — "Order item not found" (P0001) is what that looks like.
        //
        // Required lazily: stores/ imports services/, so a static import here
        // would close a cycle.
        try {
          const {
            markItemSyncedFromDrain,
          } = require("@/stores/useOrderStore") as typeof import("@/stores/useOrderStore");
          // (orderId, CART id, ROW uuid). The cart line is keyed by the
          // composite cart id; the row it now points at is op.entityId.
          markItemSyncedFromDrain(
            p.orderId,
            p.cartItemId ?? op.entityId,
            op.entityId,
          );
        } catch (e) {
          console.warn("[LF] could not bind synced item to cart:", e);
        }

        return { kind: "synced", syncVersion: data?.sync_version ?? null };
      } catch (error) {
        return rpcError("add_order_item_v5", error);
      }
    },

    update_item_quantity: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as UpdateItemQuantityPayload;
      console.log(
        `[LF] → update_order_item_quantity_v3 item=${p.itemId} qty=${p.quantity}`,
      );
      try {
        const { error } = await client.rpc("update_order_item_quantity_v3", {
          p_order_item_id: p.itemId,
          p_quantity: p.quantity,
          p_idempotency_key: op.id,
        });
        if (error) return rpcError("update_order_item_quantity_v3", error);
        return { kind: "synced" };
      } catch (error) {
        return rpcError("update_order_item_quantity_v3", error);
      }
    },

    replace_modifiers: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as ReplaceModifiersPayload;
      console.log(`[LF] → replace_order_item_modifiers_v2 item=${p.itemId}`);
      try {
        const { error } = await client.rpc("replace_order_item_modifiers_v2", {
          p_order_item_id: p.itemId,
          p_modifiers: p.modifiers,
          p_idempotency_key: op.id,
        });
        if (error) return rpcError("replace_order_item_modifiers_v2", error);
        return { kind: "synced" };
      } catch (error) {
        return rpcError("replace_order_item_modifiers_v2", error);
      }
    },

    void_item: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as VoidItemPayload;
      console.log(`[LF] → void_order_item item=${p.itemId}`);
      try {
        const { error } = await client.rpc("void_order_item", {
          p_order_item_id: p.itemId,
          p_void_reason: p.reason,
        });
        if (error) {
          const outcome = rpcError("void_order_item", error);
          return absentIsDone(outcome, "void_order_item", p.itemId);
        }
        return { kind: "synced" };
      } catch (error) {
        return absentIsDone(
          rpcError("void_order_item", error),
          "void_order_item",
          p.itemId,
        );
      }
    },

    remove_item: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as RemoveItemPayload;
      console.log(`[LF] → remove_order_item item=${p.itemId}`);
      try {
        const { error } = await client.rpc("remove_order_item", {
          p_order_item_id: p.itemId,
        });
        if (error) {
          const outcome = rpcError("remove_order_item", error);
          return absentIsDone(outcome, "remove_order_item", p.itemId);
        }
        return { kind: "synced" };
      } catch (error) {
        return absentIsDone(
          rpcError("remove_order_item", error),
          "remove_order_item",
          p.itemId,
        );
      }
    },

    set_item_seat: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as SetItemSeatPayload;
      console.log(`[LF] → set_item_seat item=${p.itemId} seat=${p.seatNumber}`);
      try {
        const { error } = await client.rpc("set_item_seat", {
          p_order_item_id: p.itemId,
          p_seat_number: p.seatNumber,
        });
        if (error) return rpcError("set_item_seat", error);
        return { kind: "synced" };
      } catch (error) {
        return rpcError("set_item_seat", error);
      }
    },

    send_to_kitchen: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as SendToKitchenPayload;
      console.log(
        `[LF] → send_order_to_kitchen_v1 order=${p.orderId} items=${p.itemIds.length}`,
      );
      if (p.itemIds.length === 0) return { kind: "synced" };
      try {
        // Via OrderService rather than a bare client.rpc: it owns
        // `validateKitchenMutationResult`, which is what turns a server that
        // routed 4 of 6 items into a NAMED failure instead of a success. That
        // check is the whole reason "sent to the kitchen, food never came" was
        // findable, and the drain needs it at least as much as the live path.
        const { OrderService } =
          require("@/services/orderService") as typeof import("@/services/orderService");
        const { error } = await OrderService.sendOrderToKitchen(
          client,
          p.orderId,
          p.itemIds,
          p.orderStatus as never,
          p.itemStatus as never,
          {
            staffId: p.staffId ?? null,
            stationId: p.stationId ?? null,
            deviceId: p.deviceId ?? null,
            // The op id is the send's identity. Reusing the caller's key when
            // it has one keeps a replay the SAME send rather than a second
            // one, which on the KDS is the difference between a re-fire and a
            // duplicate ticket.
            idempotencyKey: p.sendIdempotencyKey ?? op.id,
            itemsIdempotencyKey: p.itemsIdempotencyKey ?? op.id,
            replay: true,
          },
        );
        if (error) {
          // A traceability failure cannot be retried into correctness. Either
          // the server resolved fewer items than we asked for (the ones it
          // could not find are absent because an earlier op for them was
          // rejected — the same list will resolve the same subset), or it
          // answered without the row counts at all, which means the routing
          // migration is not applied and no amount of retrying will apply it.
          //
          // Both would otherwise classify as "unrecognised" and therefore
          // transient, and loop in the background forever. The live path
          // already treats this family as terminal; the drain must agree, or
          // the same send behaves differently depending on whether it went out
          // immediately or through the queue.
          if (isTerminalKitchenMutationError(error)) {
            console.error(
              `[LF] ✗ send_to_kitchen order=${p.orderId} not fully applied — ` +
                `${error.code}. ${error.hint ?? ""}`,
              error,
            );
            return {
              kind: "rejected",
              reason: `${error.code}: ${error.message} (order ${p.orderId})`,
            };
          }
          return rpcError("send_order_to_kitchen_v1", error);
        }
        console.log(
          `[LF] ✓ send_order_to_kitchen_v1 order=${p.orderId} items=${p.itemIds.length}`,
        );
        return { kind: "synced" };
      } catch (error) {
        return rpcError("send_order_to_kitchen_v1", error);
      }
    },

    seat_guests: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as SeatGuestsPayload;
      console.log(`[LF] → seat_guests_v4 session=${op.entityId}`);
      try {
        const { data, error } = await client.rpc("seat_guests_v4", {
          p_table_ids: p.tableIds,
          p_party_size: p.partySize,
          p_guest_name: p.guestName ?? null,
          p_guest_phone: p.guestPhone ?? null,
          p_guest_notes: p.guestNotes ?? null,
          p_reservation_id: p.reservationId ?? null,
          p_waitlist_id: p.waitlistId ?? null,
          p_create_order: p.createOrder,
          p_station_id: p.stationId ?? null,
          p_device_id: p.deviceId ?? null,
          p_staff_id: p.staffId ?? null,
          p_idempotency_key: op.id,
          p_session_id: op.entityId,
          p_order_id: p.orderId ?? null,
          p_order_number: p.orderNumber ?? null,
        });

        if (error) return rpcError("seat_guests_v4", error);

        // ── §9.5 — two stations seated the same table while partitioned.
        //
        // v4 reports this as DATA rather than raising, precisely so this
        // branch can exist. The table is lost, but the ORDER and its items are
        // not: they stay local, detached, and a manager is asked to merge or
        // move. Treating it as a retry would spin forever; treating it as a
        // plain rejection without escalating would strand a real check with
        // real food on it.
        if (data && data.success === false && data.error === "table_occupied") {
          // Release the floor-plan guard. Our session lost the table, so the
          // server's view of it is now the correct one and must be allowed
          // through — continuing to protect a session that does not own the
          // table would hide the check that does.
          markSessionSynced(op.entityId);
          deps.onTableOccupied?.({
            kind: "table_occupied",
            occupiedBySessionId: data.occupied_by_session_id,
            occupiedByOrderId: data.occupied_by_order_id ?? null,
            occupiedTableId: data.occupied_table_id,
            requestedSessionId: data.requested_session_id ?? null,
            requestedOrderId: data.requested_order_id ?? null,
          });
          return {
            kind: "rejected",
            reason:
              `table_occupied: table ${data.occupied_table_id} is held by ` +
              `session ${data.occupied_by_session_id}. Local order preserved.`,
          };
        }

        console.log(
          `[LF] ✓ seat_guests_v4 session=${op.entityId} order=${data?.order_id}`,
        );
        // The server has it now, so a floor-plan snapshot that omits this
        // table is real information rather than a stale read.
        markSessionSynced(op.entityId);
        return { kind: "synced" };
      } catch (error) {
        return rpcError("seat_guests_v4", error);
      }
    },
  };
}
