import { getDeviceId } from "@/lib/deviceId";
import { logError } from "@/lib/logError";
import { toastService } from "@/lib/toastService";
import { PENDING_SEAT_ATTRIBUTION, useEmployeeStore } from "@/stores/useEmployeeStore";
import { registerPendingOrderCreation, useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useCallback, useState } from "react";
import { findTableAnywhere } from "../../hooks/useFloors";

/** tables/index.tsx's canSeatFromSidebar: free or reserved only. */
export function canSeat(status?: string | null): boolean {
  const s = status?.toLowerCase();
  return !s || s === "available" || s === "reserved";
}

/**
 * Screen 2's submit, step for step the register's handleGuestCountSubmit:
 * a local order first (synchronous), the pending-creation guard so nothing
 * double-creates, the optimistic session, then `seatGuests` in the
 * background. Two handheld-specific choices: the signed-in employee is the
 * server (the artifact's "you'll be the server"), and with per-order PIN on
 * that same employee is the attributed creator — this device is theirs, so
 * a second PIN would only re-prove what sign-in already did.
 */
export function useSeatTable(tableId: string) {
  const [busy, setBusy] = useState(false);

  const seat = useCallback(
    (guestCount: number, note: string): boolean => {
      const fresh = findTableAnywhere(tableId);
      if (!canSeat(fresh?.session?.status)) {
        toastService.show({
          title: "Table occupied",
          message: "This table is no longer available. It was occupied by another station.",
          type: "error",
        });
        return false;
      }
      setBusy(true);
      const employees = useEmployeeStore.getState();
      const me = employees.loggedInEmployee;
      if (useStoreSettingsStore.getState().requirePinPerOrder && me) {
        employees.setOrderAttributionStaff(me.profileId, PENDING_SEAT_ATTRIBUTION);
      }

      const orders = useOrderStore.getState();
      const newOrder = orders.startNewOrder({ tableId, guestCount });
      orders.setActiveOrder(newOrder.id);
      let resolveCreation: (dbOrderId: string | null) => void = () => {};
      registerPendingOrderCreation(newOrder.id, new Promise((r) => (resolveCreation = r)));

      useTableSessionStore
        .getState()
        .seatGuests({
          tableIds: [tableId],
          partySize: guestCount,
          guestNotes: note.trim() || undefined,
          createOrder: true,
          localOrderId: newOrder.id,
          selected_station: useStoreSettingsStore.getState().selectedStation?.id,
          device_id: getDeviceId(),
          serverId: me?.profileId,
        })
        .then(({ orderId }) => {
          useEmployeeStore.getState().clearOrderAttributionStaff();
          resolveCreation(orderId && orderId !== newOrder.id ? orderId : null);
        })
        .catch((e: unknown) => {
          logError("table", "Handheld seatGuests failed", e);
          resolveCreation(null);
          toastService.show({ title: "Seating failed", message: "The table could not be seated. Try again.", type: "error" });
        })
        .finally(() => setBusy(false));
      return true;
    },
    [tableId],
  );

  return { seat, busy };
}
