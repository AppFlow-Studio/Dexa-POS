import {
  DiscountRecord,
  getLocalMenuItemDiscounts,
  MenuItemDiscountRecord,
} from "@/services/discountSync";
import { round2 } from "@/utils/money";

export type DiscountType = "percentage" | "fixed_amount";

export interface EligibilityContext {
  orderType: "dine_in" | "takeout" | "delivery";
  currentDate: Date;
  dailyUsageCounts: Record<string, number>;
  subtotal: number;
  items: {
    id: string;
    menu_item_id?: string;
    category_id?: string | null;
    is_alcohol?: boolean;
    item_total: number;
  }[];
}

export interface DiscountEligibility {
  eligible: boolean;
  reason?: string;
  discount: DiscountRecord;
  applicable_amount: number;
  calculated_savings: number;
}

const formatTime = (d: Date) => d.toTimeString().slice(0, 8);

function isTimeInWindow(current: string, start: string, end: string): boolean {
  if (start > end) {
    return current >= start || current <= end;
  }
  return current >= start && current <= end;
}

function getApplicableItems(
  discount: DiscountRecord,
  items: EligibilityContext["items"],
  menuItemDiscounts: MenuItemDiscountRecord[],
) {
  const itemSpecificIds = menuItemDiscounts
    .filter((mid) => mid.discount_id === discount.id)
    .map((mid) => mid.menu_item_id);

  return items.filter((item) => {
    if (itemSpecificIds.length > 0) {
      return item.menu_item_id && itemSpecificIds.includes(item.menu_item_id);
    }
    if (discount.exclude_alcohol && item.is_alcohol) {
      return false;
    }
    if (discount.exclude_categories?.includes(item.category_id || "")) {
      return false;
    }
    if (
      discount.applies_to_categories &&
      discount.applies_to_categories.length > 0
    ) {
      return discount.applies_to_categories.includes(item.category_id || "");
    }
    return true;
  });
}

export function calculateDiscountAmount(
  discount:
    | DiscountRecord
    | {
        discount_type: DiscountType;
        discount_value: number;
        max_discount_amount?: number | null;
      },
  applicableAmount: number,
): number {
  let amount: number;
  if (discount.discount_type === "percentage") {
    amount = applicableAmount * (discount.discount_value / 100);
    if (
      "max_discount_amount" in discount &&
      discount.max_discount_amount !== null &&
      discount.max_discount_amount !== undefined
    ) {
      amount = Math.min(amount, discount.max_discount_amount);
    }
  } else {
    amount = Math.min(discount.discount_value, applicableAmount);
  }
  return round2(amount ?? 0);
}

export function checkDiscountEligibility(
  discount: DiscountRecord,
  context: EligibilityContext,
): DiscountEligibility {
  const { currentDate, dailyUsageCounts, orderType, items, subtotal } = context;

  if (!discount.is_active) {
    return {
      eligible: false,
      reason: "Inactive",
      discount,
      applicable_amount: 0,
      calculated_savings: 0,
    };
  }

  if (discount.start_date && new Date(discount.start_date) > currentDate) {
    return {
      eligible: false,
      reason: "Not started",
      discount,
      applicable_amount: 0,
      calculated_savings: 0,
    };
  }
  if (discount.end_date && new Date(discount.end_date) < currentDate) {
    return {
      eligible: false,
      reason: "Expired",
      discount,
      applicable_amount: 0,
      calculated_savings: 0,
    };
  }

  const currentDay = currentDate.getDay();
  const applicableDays = discount.applicable_days;
  if (
    applicableDays != null &&
    applicableDays.length > 0 &&
    !applicableDays.map(Number).includes(currentDay)
  ) {
    return {
      eligible: false,
      reason: "Not valid today",
      discount,
      applicable_amount: 0,
      calculated_savings: 0,
    };
  }

  if (discount.applicable_hours_start && discount.applicable_hours_end) {
    const now = formatTime(currentDate);
    if (
      !isTimeInWindow(
        now,
        discount.applicable_hours_start,
        discount.applicable_hours_end,
      )
    ) {
      return {
        eligible: false,
        reason: "Outside hours",
        discount,
        applicable_amount: 0,
        calculated_savings: 0,
      };
    }
  }

  if (discount.scope !== "both") {
    const map: Record<string, string[]> = {
      dine_in: ["dine_in"],
      takeout: ["takeout", "delivery"],
      both: ["dine_in", "takeout", "delivery"],
    };
    if (!map[discount.scope]?.includes(orderType)) {
      return {
        eligible: false,
        reason: `Only for ${discount.scope}`,
        discount,
        applicable_amount: 0,
        calculated_savings: 0,
      };
    }
  }

  if (discount.requires_manager_approval) {
    return {
      eligible: false,
      reason: "Requires manager approval",
      discount,
      applicable_amount: 0,
      calculated_savings: 0,
    };
  }

  if (discount.max_uses_per_day !== null) {
    const usedToday = dailyUsageCounts[discount.id] || 0;
    if (usedToday >= discount.max_uses_per_day) {
      return {
        eligible: false,
        reason: "Daily limit reached",
        discount,
        applicable_amount: 0,
        calculated_savings: 0,
      };
    }
  }

  // Stackability check left to caller (based on cart state)

  const menuItemDiscounts = getLocalMenuItemDiscounts();
  const applicableItems = getApplicableItems(
    discount,
    items,
    menuItemDiscounts,
  );
  const applicableAmount = applicableItems.reduce(
    (sum, i) => sum + i.item_total,
    0,
  );

  if (
    discount.min_purchase_amount !== null &&
    applicableAmount < discount.min_purchase_amount
  ) {
    return {
      eligible: false,
      reason: `Min $${discount.min_purchase_amount.toFixed(2)}`,
      discount,
      applicable_amount: applicableAmount,
      calculated_savings: 0,
    };
  }

  if (applicableAmount <= 0) {
    return {
      eligible: false,
      reason: "No eligible items",
      discount,
      applicable_amount: 0,
      calculated_savings: 0,
    };
  }

  const calculated_savings = calculateDiscountAmount(
    discount,
    applicableAmount,
  );

  return {
    eligible: true,
    discount,
    applicable_amount: applicableAmount,
    calculated_savings,
  };
}

export function getEligibleDiscounts(
  discounts: DiscountRecord[],
  context: EligibilityContext,
): DiscountEligibility[] {
  return discounts
    .map((d) => checkDiscountEligibility(d, context))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.discount.display_order - b.discount.display_order;
    });
}
