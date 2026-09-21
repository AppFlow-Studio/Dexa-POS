import { isKitchenItemSent } from "@/lib/kitchenStatusUtils";
import { logError } from "@/lib/logError";
import { toastService } from "@/lib/toastService";
import type { CartItem } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSeatingStore } from "@/stores/useSeatingStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCallback, useState } from "react";
import { withOptions, type ItemDraft } from "../../lib/cartItem";
import type { OptionsTarget } from "../../screens/menu/useOptionsDraft";

/** Which of the item sheets is up. `pin` waits on a manager for a sent-item void. */
export type ItemSheet = "menu" | "options" | "note" | "seat" | "course" | "reason" | "pin" | null;

const liveItem = (orderId: string, itemId: string | null): CartItem | undefined =>
  itemId ? useOrderStore.getState().ordersById[orderId]?.items.find((i) => i.id === itemId) : undefined;

/** Every edit targets the active order; the check page keeps it active, this makes sure. */
function activeStore(orderId: string) {
  const store = useOrderStore.getState();
  if (store.activeOrderId !== orderId) store.setActiveOrder(orderId);
  return store;
}

/** BillItem's handleConfirmVoid: mark the sent line voided, then the void ticket when the location prints them. */
async function voidSentItem(orderId: string, item: CartItem, reason: string) {
  activeStore(orderId).removeItemFromActiveOrder(item.id, reason);
  if (!useLocationConfigStore.getState().config.printing.printVoidTickets) return;
  const order = useOrderStore.getState().ordersById[orderId];
  const store = useStoreSettingsStore.getState().selectedStore;
  if (!order || !store) return;
  try {
    await PrinterService.printVoidTicket(order, [item], store);
  } catch (e) {
    logError("print", "Handheld void ticket failed", e);
  }
}

/**
 * One line's corrections, on the register's own calls: quantity and remove
 * (unsent), options / note / seat / course through `updateItemInActiveOrder`,
 * and a sent line's void behind a reason and a manager PIN, since the
 * handheld station has `can_void_orders = false`.
 */
export function useItemActions(orderId: string) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ItemSheet>(null);
  const [reason, setReason] = useState("");
  const item = useOrderStore((s) => (itemId ? s.ordersById[orderId]?.items.find((i) => i.id === itemId) : undefined));

  const close = useCallback(() => {
    setItemId(null);
    setSheet(null);
    setReason("");
  }, []);

  const open = useCallback((target: CartItem) => {
    setItemId(target.id);
    setSheet("menu");
  }, []);

  const update = useCallback(
    (patch: (current: CartItem) => CartItem) => {
      const current = liveItem(orderId, itemId);
      if (current) activeStore(orderId).updateItemInActiveOrder(patch(current));
      close();
    },
    [orderId, itemId, close],
  );

  /** The options sheet's target for this line, or null when the item left the menu. */
  const optionsTarget = useCallback((): OptionsTarget | null => {
    const current = liveItem(orderId, itemId);
    const menuItem = current ? useMenuStore.getState().getMenuItemById(current.menuItemId) : undefined;
    if (!current || !menuItem) {
      toastService.show({ title: "Not on the menu", message: "This item is no longer on the menu, so its options cannot change.", type: "warning" });
      return null;
    }
    return { item: menuItem, categoryId: current.addedFromCategoryId ?? null, menuId: current.addedFromMenuId ?? null, existing: current };
  }, [orderId, itemId]);

  const approved = useCallback(
    async (managerName: string) => {
      const current = liveItem(orderId, itemId);
      close();
      if (!current) return;
      try {
        await voidSentItem(orderId, current, reason || "User voided");
        toastService.show({ title: "Item voided", message: `${current.name} · approved by ${managerName}.`, type: "success" });
      } catch (e) {
        logError("order", "Handheld item void failed", e);
        toastService.show({ title: "Void failed", message: "The item could not be voided.", type: "error" });
      }
    },
    [orderId, itemId, reason, close],
  );

  return {
    item,
    sent: !!item && isKitchenItemSent(item),
    sheet,
    setSheet,
    open,
    close,
    optionsTarget,
    setQuantity: (n: number) => activeStore(orderId).setItemQuantity(itemId ?? "", n),
    remove: () => {
      if (itemId) activeStore(orderId).removeItemFromActiveOrder(itemId);
      close();
    },
    saveOptions: (draft: ItemDraft) => update((c) => withOptions(c, draft)),
    saveNote: (notes: string) => update((c) => ({ ...c, customizations: { ...c.customizations, notes } })),
    moveSeat: (seat: number | null) => {
      const current = liveItem(orderId, itemId);
      if (current) useSeatingStore.getState().setItemSeat(orderId, current.id, seat, current.db_order_item_id);
      update((c) => ({ ...c, seatNumber: seat }));
    },
    moveCourse: (course: number) => {
      const current = liveItem(orderId, itemId);
      if (current) useCoursingStore.getState().setItemCourse(orderId, current.id, course, current.db_order_item_id);
      update((c) => ({ ...c, courseNumber: course }));
    },
    pickReason: (picked: string) => {
      setReason(picked);
      setSheet("pin");
    },
    approved,
  };
}
