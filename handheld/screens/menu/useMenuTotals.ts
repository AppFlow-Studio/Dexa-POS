import { isKitchenItemUnsent } from "@/lib/kitchenStatusUtils";
import type { CartItem, OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { checkPageTitle } from "../../lib/checks";

/** Items not yet sent, summed by `pick` — the footer's count and running total. */
function sumUnsent(order: OrderProfile | undefined, pick: (item: CartItem) => number): number {
  let sum = 0;
  for (const i of order?.items ?? []) {
    if (i.is_voided || i.isDraft || !isKitchenItemUnsent(i)) continue;
    sum += pick(i);
  }
  return sum;
}

/** Screen 3's header title, "N items to send" line and the cart button's numbers. */
export function useMenuTotals(orderId: string) {
  const title = useOrderStore((s) => (s.ordersById[orderId] ? checkPageTitle(s.ordersById[orderId]) : "Menu"));
  const unsentCount = useOrderStore((s) => sumUnsent(s.ordersById[orderId], (i) => i.quantity));
  const unsentTotal = useOrderStore((s) => sumUnsent(s.ordersById[orderId], (i) => i.price * i.quantity));
  const subtitle = unsentCount === 1 ? "1 item to send" : `${unsentCount} items to send`;
  return { title, subtitle, unsentCount, unsentTotal };
}
