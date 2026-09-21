import { toastService } from "@/lib/toastService";
import type { OrderProfile } from "@/lib/types";
import { getEligibleDiscounts, type DiscountEligibility } from "@/services/discountEligibility";
import type { DiscountRecord } from "@/services/discountSync";
import { getDailyUsageCounts } from "@/services/discountUsageTracker";
import { useOrderStore } from "@/stores/useOrderStore";
import { orderKind } from "./checks";

/** Live, non-voided line subtotal — the base the register validates against. */
export function checkSubtotal(order: OrderProfile): number {
  return order.items.reduce((sum, i) => {
    if (i.is_voided) return sum;
    const line = typeof i.subtotal === "number" ? i.subtotal : i.price * i.quantity;
    return sum + Math.max(0, line);
  }, 0);
}

/** The register's DiscountBottomSheet eligibility pass, eligible first. */
export function eligibleDiscounts(order: OrderProfile, discounts: DiscountRecord[]): DiscountEligibility[] {
  const items = order.items
    .filter((i) => !i.is_voided)
    .map((i) => ({
      id: i.id,
      menu_item_id: i.menuItemId,
      category_id: i.category_name || undefined,
      is_alcohol: false,
      item_total: i.price * i.quantity,
    }));
  return getEligibleDiscounts(discounts, {
    orderType: orderKind(order),
    currentDate: new Date(),
    dailyUsageCounts: getDailyUsageCounts(),
    subtotal: items.reduce((sum, i) => sum + i.item_total, 0),
    items,
  });
}

function discountAmount(discount: DiscountRecord, subtotal: number): number {
  const value = Number(discount.discount_value);
  if (!Number.isFinite(value) || value <= 0 || subtotal <= 0) return 0;
  if (discount.discount_type === "percentage") return subtotal * (value > 1 ? value / 100 : value);
  return value;
}

/**
 * Apply a preset with the register's pre-checks. Returns the message that
 * blocked it, or null once handed to the store (which reports its own
 * failures through `toastService`, as the register's sheet does).
 */
export function applyDiscount(order: OrderProfile, discount: DiscountRecord): string | null {
  const subtotal = checkSubtotal(order);
  if (subtotal <= 0) return "Discount cannot be applied to an empty check.";
  const amount = discountAmount(discount, subtotal);
  if (amount <= 0) return "Please enter a valid discount amount.";
  if (discount.discount_type === "percentage" && amount - subtotal > 0.001) {
    return "Discount is too high. It cannot reduce the total below $0.00.";
  }
  // Same call and same loose typing as the register's sheet: the store reads
  // discount_type / discount_value off the record.
  useOrderStore.getState().applyDiscountToCheck(order.id, discount as never, (message) => {
    toastService.show({ title: "Discount not applied", message, type: "error" });
  });
  return null;
}
