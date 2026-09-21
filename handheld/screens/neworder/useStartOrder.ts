import { logError } from "@/lib/logError";
import { toastService } from "@/lib/toastService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCallback, useState } from "react";

export type NewOrderType = "takeout" | "delivery";

/**
 * S2's submit for takeout and delivery: `startOrResumeOrder` (the register's
 * one entry point for a new ticket — it reuses an empty draft rather than
 * stranding its number), the type and customer on the profile, then the
 * eager backend create the register does for takeout. With per-order PIN on,
 * the signed-in employee is the attributed creator (this device is theirs —
 * see useSeatTable). Resolves to the local order id to push, or null.
 */
export function useStartOrder() {
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (type: NewOrderType, customer: { name: string; phone: string }): Promise<string | null> => {
      setBusy(true);
      try {
        const orders = useOrderStore.getState();
        const order = orders.startOrResumeOrder();
        if (!order) {
          toastService.show({ title: "Couldn't start an order", message: "Try again in a moment.", type: "error" });
          return null;
        }
        const me = useEmployeeStore.getState().loggedInEmployee;
        if (useStoreSettingsStore.getState().requirePinPerOrder && me) {
          useEmployeeStore.getState().setOrderAttributionStaff(me.profileId, order.id);
        }
        await orders.updateActiveOrderDetails({
          order_type: type,
          customer_name: customer.name.trim() || undefined,
          customer_phone: customer.phone.trim() || undefined,
        });
        void orders.ensureActiveOrderCreated(order.id);
        return order.id;
      } catch (e) {
        logError("order", "Handheld start order failed", e);
        toastService.show({ title: "Couldn't start an order", message: "Try again in a moment.", type: "error" });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { start, busy };
}
