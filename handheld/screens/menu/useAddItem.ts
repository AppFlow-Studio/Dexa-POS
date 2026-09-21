import type { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSeatingStore } from "@/stores/useSeatingStore";
import { useCallback, useEffect, useState } from "react";
import { buildMenuCartItem, type ItemDraft } from "../../lib/cartItem";
import type { MenuRowData } from "./useMenuRows";
import type { OptionsTarget } from "./useOptionsDraft";

/**
 * ModifierScreen's seat override after an add: the line's seat in the
 * seating store (no backend call — the add RPC carries `seat_number`), and
 * the active seat follows so later items land there too.
 */
function applySeat(orderId: string, itemId: string, seat: number | null) {
  const seating = useSeatingStore.getState();
  seating.setItemSeat(orderId, itemId, seat, undefined, true);
  seating.setActiveSeat(orderId, seat);
}

/**
 * The add path for screen 3: an item with modifier groups opens the options
 * sheet, anything else goes straight onto the check with the register's
 * defaults. Every write is `addItemToActiveOrder`, so the store's own gates
 * (closed check, other station, PIN-to-start) and the outbox apply unchanged.
 * The page makes `orderId` the active order for as long as it is mounted.
 * `seat` is the menu page's chosen seat; undefined on a check without seats.
 */
export function useAddItem(orderId: string, seat: number | null | undefined) {
  const [pending, setPending] = useState<OptionsTarget | null>(null);

  useEffect(() => {
    const store = useOrderStore.getState();
    if (store.activeOrderId !== orderId) store.setActiveOrder(orderId);
  }, [orderId]);

  const addCartItem = useCallback(
    (cartItem: CartItem) => {
      const store = useOrderStore.getState();
      if (store.activeOrderId !== orderId) store.setActiveOrder(orderId);
      store.addItemToActiveOrder(cartItem);
      if (seat !== undefined) applySeat(orderId, cartItem.id, seat);
    },
    [orderId, seat],
  );

  const commit = useCallback(
    (draft: ItemDraft) => {
      addCartItem(buildMenuCartItem({ ...draft, seatNumber: seat }));
      setPending(null);
    },
    [addCartItem, seat],
  );

  const add = useCallback(
    (row: MenuRowData) => {
      if (row.item.modifierGroupIds?.length) {
        setPending({ ...row, seatNumber: seat });
        return;
      }
      commit({
        item: row.item,
        categoryId: row.categoryId,
        menuId: row.menuId,
        quantity: 1,
        isToGo: false,
        groups: [],
        selections: {},
        notes: "",
        seatNumber: seat,
      });
    },
    [commit, seat],
  );

  return { pending, add, commit, addCartItem, dismiss: () => setPending(null) };
}
