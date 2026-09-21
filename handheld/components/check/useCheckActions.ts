import { logError } from "@/lib/logError";
import { toastService } from "@/lib/toastService";
import type { OrderProfile } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useCallback, useState } from "react";
import { checkNumber } from "../../lib/checks";
import { tableIdOf } from "../../lib/sendCourse";

export type CheckSheet = "more" | "discount" | "note" | null;
export type GatedAction = "void" | "discount";

const liveOrder = (orderId: string): OrderProfile | undefined => useOrderStore.getState().ordersById[orderId];

/** MoreOptionsBottomSheet's onConfirmVoid: table checks through the session dispatcher, others directly. */
async function voidCheck(order: OrderProfile) {
  const tableId = order.session_id ? tableIdOf(order) : null;
  if (tableId) {
    await useTableSessionStore
      .getState()
      .dispatchAction({ type: "VOID_ORDER", tableId, orderId: order.id, dbOrderId: order.db_order_id });
    if (order.session_id) await useReservationStore.getState().completeReservationForSession(order.session_id);
  } else {
    useOrderStore.getState().voidOrder(order.id);
  }
}

/** The register's print-receipt path, including its "no printer" modal. */
async function printCheck(orderId: string) {
  const order = liveOrder(orderId);
  const store = useStoreSettingsStore.getState().selectedStore;
  if (!order || !store || order.items.length === 0) return;
  try {
    const ok = await PrinterService.printReceipt(order, store);
    if (ok) toastService.show({ title: "Receipt sent", message: "Receipt sent to printer.", type: "success" });
    else useNoPrinterModalStore.getState().show("receipt");
  } catch (e) {
    logError("print", "Handheld receipt print failed", e);
    toastService.show({ title: "Print error", message: "Failed to print receipt.", type: "error" });
  }
}

async function printKitchenTicket(orderId: string) {
  const order = liveOrder(orderId);
  const store = useStoreSettingsStore.getState().selectedStore;
  const items = order?.items.filter((i) => !i.is_voided) ?? [];
  if (!order || !store || items.length === 0) return;
  try {
    const ok = await PrinterService.printKitchenTickets(order, items, store, { forceGroupBySeat: true });
    if (ok) toastService.show({ title: "Kitchen ticket sent", message: "Kitchen ticket sent to printer.", type: "success" });
    else useNoPrinterModalStore.getState().show("kitchen");
  } catch (e) {
    logError("print", "Handheld kitchen ticket print failed", e);
    toastService.show({ title: "Print error", message: "Failed to print kitchen ticket.", type: "error" });
  }
}

/**
 * S5 / S6 wiring for one check: which sheet is open, which action is waiting
 * on a manager, and the register's own print / void / note calls.
 */
export function useCheckActions(orderId: string, onVoided: () => void) {
  const [sheet, setSheet] = useState<CheckSheet>(null);
  const [approval, setApproval] = useState<GatedAction | null>(null);

  const request = useCallback((action: GatedAction) => {
    setSheet(null);
    setApproval(action);
  }, []);

  const approved = useCallback(
    async (managerName: string) => {
      setApproval(null);
      const order = liveOrder(orderId);
      if (!approval || !order) return;
      if (approval === "discount") {
        setSheet("discount");
        return;
      }
      try {
        await voidCheck(order);
        toastService.show({ title: "Order voided", message: `Approved by ${managerName}.`, type: "success" });
        onVoided();
      } catch (e) {
        logError("order", "Handheld void failed", e);
        toastService.show({ title: "Void failed", message: "The order could not be voided.", type: "error" });
      }
    },
    [approval, orderId, onVoided],
  );

  const saveNote = useCallback(
    (notes: string) => {
      setSheet(null);
      const orders = useOrderStore.getState();
      if (orders.activeOrderId !== orderId) orders.setActiveOrder(orderId);
      void orders.updateActiveOrderDetails({ notes: notes.trim() });
    },
    [orderId],
  );

  const order = liveOrder(orderId);
  const approvalLabel = approval && order ? `${approval === "void" ? "Void" : "Discount"} order ${checkNumber(order)}` : "";

  return {
    sheet,
    setSheet,
    close: () => setSheet(null),
    approval,
    approvalLabel,
    request,
    approved,
    cancelApproval: () => setApproval(null),
    printCheck: () => {
      setSheet(null);
      void printCheck(orderId);
    },
    printKitchenTicket: () => {
      setSheet(null);
      void printKitchenTicket(orderId);
    },
    saveNote,
  };
}
