import { useOrderStore } from "@/stores/useOrderStore";
import { useCallback, useEffect, useState } from "react";
import { buildMenuCartItem, type ItemDraft } from "../../lib/cartItem";
import type { MenuRowData } from "./useMenuRows";

/**
 * The add path for screen 3: an item with modifier groups opens the options
 * sheet, anything else goes straight onto the check with the register's
 * defaults. Every write is `addItemToActiveOrder`, so the store's own gates
 * (closed check, other station, PIN-to-start) and the outbox apply unchanged.
 * The page makes `orderId` the active order for as long as it is mounted.
 */
export function useAddItem(orderId: string) {
  const [pending, setPending] = useState<MenuRowData | null>(null);

  useEffect(() => {
    const store = useOrderStore.getState();
    if (store.activeOrderId !== orderId) store.setActiveOrder(orderId);
  }, [orderId]);

  const commit = useCallback(
    (draft: ItemDraft) => {
      const store = useOrderStore.getState();
      if (store.activeOrderId !== orderId) store.setActiveOrder(orderId);
      store.addItemToActiveOrder(buildMenuCartItem(draft));
      setPending(null);
    },
    [orderId],
  );

  const add = useCallback(
    (row: MenuRowData) => {
      if (row.item.modifierGroupIds?.length) {
        setPending(row);
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
      });
    },
    [commit],
  );

  return { pending, add, commit, dismiss: () => setPending(null) };
}
