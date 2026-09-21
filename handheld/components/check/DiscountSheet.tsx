import { useDiscounts } from "@/hooks/useDiscounts";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import type { DiscountRecord } from "@/services/discountSync";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { applyDiscount, eligibleDiscounts } from "../../lib/discounts";
import { formatCurrency } from "../../lib/format";
import { type } from "../../lib/type";
import { BottomSheet, ListRow, StickyActionBar } from "../../primitives";
import { EmptyState } from "../EmptyState";

function discountLabel(d: DiscountRecord): string {
  return d.discount_type === "percentage" ? `${d.discount_value}% off` : `${formatCurrency(d.discount_value)} off`;
}

/**
 * Preset discounts for the check, eligible ones first with the register's
 * reasons on the rest; an applied discount can be removed. Custom amounts
 * stay on the register (a keypad flow the artifact does not draw).
 */
export function DiscountSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  const applied = order?.checkDiscount ?? null;
  const { data: discounts = [] } = useDiscounts();
  const rows = useMemo(() => (order ? eligibleDiscounts(order, discounts.filter((d) => d.is_active)) : []), [order, discounts]);

  const pick = (d: DiscountRecord) => {
    if (!order) return;
    const blocked = applyDiscount(order, d);
    if (blocked) {
      toastService.show({ title: "Invalid discount", message: blocked, type: "error" });
      return;
    }
    onClose();
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Apply discount"
      subtitle={applied ? `${applied.label} is on this check` : undefined}
      footer={
        applied ? (
          <StickyActionBar
            actions={[
              {
                label: "Remove discount",
                variant: "tonal",
                onPress: () => {
                  useOrderStore.getState().removeCheckDiscount(orderId);
                  onClose();
                },
              },
            ]}
          />
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No discounts set up" hint="Presets are managed on the dashboard." />
      ) : (
        <View className="pb-2">
          {rows.map((r, i) => (
            <ListRow
              key={r.discount.id}
              title={r.discount.name}
              detail={r.eligible ? discountLabel(r.discount) : (r.reason ?? "Not available for this check")}
              value={r.eligible ? `−${formatCurrency(r.calculated_savings)}` : undefined}
              divider={i > 0}
              onPress={r.eligible ? () => pick(r.discount) : undefined}
            />
          ))}
          {rows.some((r) => !r.eligible) ? (
            <Text className="px-4 pt-2" style={[type.hint, { color: colors.muted }]}>
              Greyed discounts do not apply to this check.
            </Text>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}
