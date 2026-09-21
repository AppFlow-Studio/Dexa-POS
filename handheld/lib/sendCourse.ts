import { getKitchenSentStatus, isKitchenItemUnsent } from "@/lib/kitchenStatusUtils";
import { logError } from "@/lib/logError";
import type { CartItem, OrderProfile } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { orderKind } from "./checks";

export type SendOutcome = "sent" | "queued" | "empty" | "failed";

/**
 * The table a check sits on, resolved the way MoreOptionsBottomSheet's void
 * does: through the session index first (server-hydrated orders carry a
 * table *number* in `service_location_id`), then the local field.
 */
export function tableIdOf(order: OrderProfile): string | null {
  const sessions = useTableSessionStore.getState();
  const bySession = order.session_id
    ? (sessions.sessionTableIndex[order.session_id]?.[0] ??
      sessions.getSessionBySessionId(order.session_id)?.tableId)
    : undefined;
  return bySession ?? order.service_location_id ?? null;
}

/** The check belongs to a table session: sends go through the session dispatcher. */
export function isTableCheck(order: OrderProfile): boolean {
  return orderKind(order) === "dine_in" && !!tableIdOf(order);
}

/** Items of `course` (or every course when null) the kitchen has not received. */
export function unsentItems(order: OrderProfile, course: number | null): CartItem[] {
  const map = useCoursingStore.getState().getForOrder(order.id)?.itemCourseMap;
  return order.items.filter((i) => {
    if (i.is_voided || i.isDraft || !isKitchenItemUnsent(i)) return false;
    return course === null || (i.courseNumber ?? map?.[i.id] ?? 1) === course;
  });
}

function stampSentAt(orderId: string) {
  const store = useOrderStore.getState();
  const order = store.ordersById[orderId];
  if (!order) return;
  const now = new Date().toISOString();
  const patch: Partial<OrderProfile> = {};
  if (!order.opened_at) patch.opened_at = now;
  if (!order.sent_to_kitchen_at) patch.sent_to_kitchen_at = now;
  if (Object.keys(patch).length) void store.updateActiveOrderDetails(patch);
}

function autoPrint(order: OrderProfile, items: CartItem[]) {
  const store = useStoreSettingsStore.getState().selectedStore;
  if (!store || !useLocationConfigStore.getState().config.printing.autoPrintKitchenTickets) return;
  queueMicrotask(() => {
    PrinterService.printKitchenTickets(order, items, store).catch((e: unknown) =>
      logError("print", "Handheld kitchen ticket auto-print failed", e),
    );
  });
}

/**
 * A table course, the way TableOrderView's handleSendCourse does it: mark
 * the items sent locally, mark the course, dispatch SEND_TO_KITCHEN through
 * the session store (which owns the offline queue), then stamp timestamps
 * and auto-print — or roll the marks back when the effect refuses.
 */
async function sendTableCourse(order: OrderProfile, tableId: string, course: number): Promise<SendOutcome> {
  const items = unsentItems(order, course);
  if (items.length === 0) return "empty";
  const orders = useOrderStore.getState();
  const coursing = useCoursingStore.getState();
  const before = items.map((i) => ({ id: i.id, item_status: i.item_status, kitchen_status: i.kitchen_status }));

  orders.batchUpdateItemKitchenStatus(order.id, items.map((i) => i.id), getKitchenSentStatus());
  coursing.markCourseSent(order.id, course);

  const result = await useTableSessionStore.getState().dispatchAction(
    {
      type: "SEND_TO_KITCHEN",
      tableId,
      courseNumber: course,
      itemIds: items.map((i) => i.id),
      dbItemIds: items.map((i) => i.db_order_item_id).filter((id): id is string => !!id),
      orderId: order.id,
      dbOrderId: order.db_order_id,
    },
    { awaitEffects: true },
  );

  if (!result.success) {
    coursing.unmarkCourseSent(order.id, course);
    useOrderStore.setState((state) => {
      const live = state.ordersById[order.id];
      if (!live) return;
      for (const b of before) {
        const item = live.items.find((i) => i.id === b.id);
        if (item) {
          item.item_status = b.item_status;
          item.kitchen_status = b.kitchen_status;
        }
      }
    });
    return "failed";
  }
  stampSentAt(order.id);
  if (result.outcome?.status === "queued") return "queued";
  autoPrint(order, items);
  return "sent";
}

/** Send a course of a table check, or everything unsent on any other check. */
export async function sendToKitchen(orderId: string, course: number | null): Promise<SendOutcome> {
  const orders = useOrderStore.getState();
  const order = orders.ordersById[orderId];
  if (!order) return "failed";
  if (orders.activeOrderId !== orderId) orders.setActiveOrder(orderId);

  const tableId = orderKind(order) === "dine_in" ? tableIdOf(order) : null;
  if (tableId) return sendTableCourse(order, tableId, course ?? 1);

  if (unsentItems(order, null).length === 0) return "empty";
  const result = await orders.sendNewItemsToKitchenForOrder(orderId);
  switch (result.status) {
    case "sent":
      return "sent";
    case "queued":
      return "queued";
    case "skipped":
      return "empty";
    default:
      return "failed";
  }
}
