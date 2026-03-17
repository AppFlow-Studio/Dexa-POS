/**
 * handleSeatingEffect — Backend RPC handler for seat_guests_v3.
 *
 * Called directly from seatGuests() (NOT registered in the side-effect
 * registry, since seating is a creation action with different deps).
 *
 * Responsibilities:
 * 1. Build SeatGuestsParams and call FloorPlanService.seatGuests()
 * 2. On success: batchDispatch SESSION_CREATED, call hydrateOrderFromSeat
 * 3. Merge additional tables for multi-table seating
 * 4. On failure: batchDispatch SEAT_FAILED
 */

import { FloorPlanService } from "@/services/floorPlanService";
import type { TableSession } from "@/types/db-floor-plan-types";
import type { SeatGuestsParams } from "@/types/sessionRpcTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionAction } from "@/stores/useTableSessionStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeatingEffectDeps {
  supabase: SupabaseClient;
  merchantId: string;
  staffId: string | null;
  serverStaffId: string | null;
  deviceId: string | null;
  stationId: string | null;
  batchDispatch: (actions: Array<{ tableId: string; action: SessionAction }>) => number;
}

export interface SeatingEffectParams {
  partySize: number;
  guestName?: string;
  guestPhone?: string;
  reservationId?: string;
  waitlistId?: string;
  createOrder: boolean;
  localOrderId?: string;
  optimisticSession: TableSession;
}

export interface SeatingEffectResult {
  success: boolean;
  sessionId?: string;
  orderId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Effect
// ---------------------------------------------------------------------------

export async function handleSeatingEffect(
  tableIds: string[],
  params: SeatingEffectParams,
  deps: SeatingEffectDeps,
): Promise<SeatingEffectResult> {
  const primaryTableId = tableIds[0];
  const additionalTableIds = tableIds.slice(1);

  // 1. Build RPC params and call seat_guests_v3
  const rpcParams: SeatGuestsParams = {
    p_table_id: primaryTableId,
    p_merchant_id: deps.merchantId,
    p_staff_id: deps.staffId,
    p_server_staff_id: deps.serverStaffId,
    p_party_size: params.partySize,
    p_create_order: params.createOrder,
    p_guest_name: params.guestName || null,
    p_guest_phone: params.guestPhone || null,
    p_reservation_id: params.reservationId || null,
    p_waitlist_id: params.waitlistId || null,
    p_device_id: deps.deviceId,
    p_station_id: deps.stationId,
  };

  const { data, error } = await FloorPlanService.seatGuests(
    deps.supabase,
    rpcParams,
  );

  if (error || !data) {
    // Dispatch SEAT_FAILED for all tables
    deps.batchDispatch(
      tableIds.map(tableId => ({
        tableId,
        action: { type: 'SEAT_FAILED' as const },
      })),
    );
    return {
      success: false,
      error: error?.message || "seat_guests_v3 returned no data",
    };
  }

  // 2. Merge additional tables for multi-table seating (parallel)
  if (additionalTableIds.length > 0 && data.session_id) {
    const mergeResults = await Promise.allSettled(
      additionalTableIds.map(extraTableId =>
        FloorPlanService.mergeTableToSession(deps.supabase, {
          p_session_id: data.session_id!,
          p_table_id: extraTableId,
        })
      )
    );
    mergeResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.warn(
          `[handleSeatingEffect] Non-fatal: failed to merge table ${additionalTableIds[i]}:`,
          result.reason,
        );
      }
    });
  }

  // 3. Hydrate order from RPC response
  if (data.order_id) {
    const { useOrderStore } = await import("@/stores/useOrderStore");

    useOrderStore.getState().hydrateOrderFromSeat({
      localOrderId: params.localOrderId,
      dbOrderId: data.order_id,
      sessionId: data.session_id!,
      orderNumber: data.order_number,
      displayNumber: data.display_number,
    });

    // Fix activeOrderId if hydrateOrderFromSeat rekeyed the order
    if (params.localOrderId) {
      const os = useOrderStore.getState();
      // If order was rekeyed, activeOrderId now points to a deleted key — fix it
      if (os.activeOrderId === params.localOrderId && !os.ordersById[params.localOrderId]) {
        const newKey = os.dbOrderIdIndex[data.order_id] ?? data.order_id;
        if (os.ordersById[newKey]) {
          useOrderStore.getState().setActiveOrder(newKey);
        }
      }
    }
  }

  // 4. Dispatch SESSION_CREATED for all tables
  const realSession: TableSession = {
    ...params.optimisticSession,
    id: data.session_id!,
    order_id: data.order_id,
    session_number: data.session_number ?? params.optimisticSession.session_number,
  };

  deps.batchDispatch(
    tableIds.map(tableId => ({
      tableId,
      action: { type: 'SESSION_CREATED' as const, session: realSession },
    })),
  );

  console.log("[handleSeatingEffect] Success:", data);

  return {
    success: true,
    sessionId: data.session_id!,
    orderId: data.order_id,
  };
}
