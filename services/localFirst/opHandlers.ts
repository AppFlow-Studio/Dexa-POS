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

import type { ClaimedOp } from "@/lib/db/outbox";
import {
  outcomeFromError,
  type DrainOutcome,
  type OpHandlers,
} from "@/services/localFirst/outboxDrain";

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

function rpcError(error: unknown): DrainOutcome {
  return outcomeFromError(error);
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

        if (error) return rpcError(error);

        // §6.3 — the server renumbered us because our locally minted number
        // collided. The ID is unchanged (identity is sacred); only the number
        // moved, and the device must correct what it displays.
        if (data?.order_number_reassigned) {
          console.warn(
            `[Drain] order ${op.entityId} was renumbered by the server: ` +
              `${p.orderNumber} -> ${data.order_number}`,
          );
        }
        return { kind: "synced" };
      } catch (error) {
        return rpcError(error);
      }
    },

    add_item: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as AddItemPayload;
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

        if (error) return rpcError(error);
        return { kind: "synced", syncVersion: data?.sync_version ?? null };
      } catch (error) {
        return rpcError(error);
      }
    },

    seat_guests: async (op: ClaimedOp): Promise<DrainOutcome> => {
      const p = op.payload as SeatGuestsPayload;
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

        if (error) return rpcError(error);

        // ── §9.5 — two stations seated the same table while partitioned.
        //
        // v4 reports this as DATA rather than raising, precisely so this
        // branch can exist. The table is lost, but the ORDER and its items are
        // not: they stay local, detached, and a manager is asked to merge or
        // move. Treating it as a retry would spin forever; treating it as a
        // plain rejection without escalating would strand a real check with
        // real food on it.
        if (data && data.success === false && data.error === "table_occupied") {
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

        return { kind: "synced" };
      } catch (error) {
        return rpcError(error);
      }
    },
  };
}
