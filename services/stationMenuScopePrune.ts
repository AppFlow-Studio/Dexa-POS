import { isKitchenItemSent } from "@/lib/kitchenStatusUtils";
import {
  channelForStationType,
  selectVisibleMenus,
} from "@/lib/menu/stationMenuScope";
import { toastService } from "@/lib/toastService";
import type { CartItem } from "@/lib/types";
import type { KioskCartLine } from "@/stores/useKioskCartStore";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

/**
 * Cart hygiene after a menu snapshot lands.
 *
 * The POS cart is MMKV-persisted, so a line added from the Sushi menu survives
 * the sync in which the portal hides Sushi from this station. Left alone it
 * rings up an item staff can no longer see or reopen. So when a new snapshot
 * is applied, lines from a menu that is no longer visible HERE are removed,
 * once, with a toast — and nothing crashes.
 *
 * What is removed is deliberately narrow:
 *
 *  - Only lines whose origin menu (`addedFromMenuId`) is still in the tree but
 *    no longer visible on this station. A menu that vanished from the payload
 *    altogether is a different event (a menu deletion) with different
 *    expectations, and is left to the existing paths.
 *  - Only lines the kitchen has not seen and nobody has paid for. A sent or
 *    paid line is an order item, not a cart line: removing it would corrupt
 *    the check, and voiding it is a staff decision.
 *  - Only the ACTIVE order. That is the cart on screen; other open orders are
 *    orders.
 *
 * The kiosk cart is in-memory and carries no menu id, so it is pruned by ITEM
 * reachability instead: a line whose item exists only in menus this kiosk can
 * no longer show is dropped. An item that is also on a visible menu stays.
 */

export interface StationScopePrunePlan {
  posItemIds: string[];
  kioskLineIds: string[];
}

type PruneMenu = {
  id: string;
  categories: readonly { items?: readonly { id: string }[] }[];
};

type PrunePosItem = Pick<
  CartItem,
  "id" | "addedFromMenuId" | "is_voided" | "kitchen_status" | "paidQuantity"
>;

type PruneKioskLine = Pick<KioskCartLine, "lineId" | "menuItemId">;

const itemIdsIn = (menus: readonly PruneMenu[]): Set<string> => {
  const ids = new Set<string>();
  for (const menu of menus) {
    for (const category of menu.categories) {
      for (const item of category.items ?? []) ids.add(item.id);
    }
  }
  return ids;
};

/** Pure: decide what to remove. Exported for the unit test. */
export function planStationScopePrune(input: {
  menus: readonly PruneMenu[];
  visibleMenus: readonly PruneMenu[];
  posItems: readonly PrunePosItem[];
  kioskLines: readonly PruneKioskLine[];
}): StationScopePrunePlan {
  const knownMenuIds = new Set(input.menus.map((m) => m.id));
  const visibleMenuIds = new Set(input.visibleMenus.map((m) => m.id));

  const posItemIds = input.posItems
    .filter((item) => {
      const menuId = item.addedFromMenuId;
      if (!menuId) return false; // open items and legacy lines carry no origin
      if (!knownMenuIds.has(menuId)) return false; // menu gone: not our event
      if (visibleMenuIds.has(menuId)) return false; // still on this station
      if (item.is_voided) return false;
      if (isKitchenItemSent(item)) return false;
      if ((item.paidQuantity ?? 0) > 0) return false;
      return true;
    })
    .map((item) => item.id);

  const knownItemIds = itemIdsIn(input.menus);
  const visibleItemIds = itemIdsIn(input.visibleMenus);
  const kioskLineIds = input.kioskLines
    .filter(
      (line) =>
        knownItemIds.has(line.menuItemId) &&
        !visibleItemIds.has(line.menuItemId),
    )
    .map((line) => line.lineId);

  return { posItemIds, kioskLineIds };
}

/**
 * Apply the plan against the live stores. Called by PosSyncProvider right
 * after `setMenuData` on a fresh snapshot. Never throws: cart hygiene must not
 * be able to take the menu sync down with it.
 */
export function pruneCartForStationScope(): StationScopePrunePlan {
  const empty: StationScopePrunePlan = { posItemIds: [], kioskLineIds: [] };
  try {
    const { menus, stationMenuScopes } = useMenuStore.getState();
    const station = useStoreSettingsStore.getState().selectedStation;
    const visibleMenus = selectVisibleMenus(
      menus,
      stationMenuScopes,
      station?.id ?? null,
      channelForStationType(station?.station_type),
    );

    const orderState = useOrderStore.getState();
    const activeOrder = orderState.activeOrderId
      ? orderState.ordersById[orderState.activeOrderId]
      : undefined;

    const plan = planStationScopePrune({
      menus,
      visibleMenus,
      posItems: activeOrder?.items ?? [],
      kioskLines: useKioskCartStore.getState().lines,
    });

    for (const itemId of plan.posItemIds) {
      orderState.removeItemFromActiveOrder(itemId);
    }
    const kioskCart = useKioskCartStore.getState();
    for (const lineId of plan.kioskLineIds) {
      kioskCart.removeLine(lineId);
    }

    const removed = plan.posItemIds.length + plan.kioskLineIds.length;
    if (removed > 0) {
      console.log("[stationMenuScopePrune] removed cart lines", plan);
      toastService.show({
        title: "Cart updated",
        message:
          removed === 1
            ? "1 item was removed — its menu is no longer available on this station."
            : `${removed} items were removed — their menu is no longer available on this station.`,
        type: "warning",
      });
    }
    return plan;
  } catch (error) {
    console.warn("[stationMenuScopePrune] failed:", error);
    return empty;
  }
}
