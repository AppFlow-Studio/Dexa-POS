import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { applyCustomDiscount, checkSubtotal, type CustomDiscountType } from "../../lib/discounts";
import { formatCurrency } from "../../lib/format";
import { type } from "../../lib/type";
import { BottomSheet, Keypad, type KeypadKey, SegmentedTabs, StickyActionBar } from "../../primitives";

const KINDS = [
  { value: "percentage", label: "Percent" },
  { value: "fixed", label: "Amount" },
] as const;

/** Digits with at most one point and two decimals; a percent takes no more than three digits before it. */
function typeValue(current: string, key: KeypadKey, kind: CustomDiscountType): string {
  if (key === ".") return current.includes(".") ? current : current ? `${current}.` : "0.";
  const [whole, decimals] = current.split(".");
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (decimals === undefined && whole.length >= (kind === "percentage" ? 3 : 7)) return current;
  if (current === "0" && key !== "00") return key;
  return current + key;
}

/**
 * The register's custom discount, on the handheld keypad: a percent or a
 * dollar amount off the whole check, with the same three checks before the
 * store sees it. Reached from the discount sheet after the manager PIN.
 */
export function CustomDiscountSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [kind, setKind] = useState<CustomDiscountType>("percentage");
  const [raw, setRaw] = useState("");
  const subtotal = useOrderStore((s) => (s.ordersById[orderId] ? checkSubtotal(s.ordersById[orderId]) : 0));
  const value = Number(raw) || 0;
  const off = kind === "percentage" ? (subtotal * value) / 100 : value;
  const shown = kind === "percentage" ? `${raw || "0"}%` : formatCurrency(value);

  const apply = () => {
    const order = useOrderStore.getState().ordersById[orderId];
    if (!order) return;
    const blocked = applyCustomDiscount(order, kind, value);
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
      title="Custom discount"
      subtitle={`Check subtotal ${formatCurrency(subtotal)}`}
      footer={<StickyActionBar actions={[{ label: `Take ${formatCurrency(off)} off`, disabled: value <= 0, onPress: apply }]} />}
    >
      <SegmentedTabs
        value={kind}
        options={KINDS}
        onChange={(next) => {
          setKind(next);
          setRaw("");
        }}
      />
      <View className="items-center px-5 pt-3.5" style={{ paddingBottom: 10 }}>
        <Text style={[type.detail, { color: colors.label }]}>{kind === "percentage" ? "Percent off" : "Amount off"}</Text>
        <Text style={{ fontSize: 44, fontWeight: "700", lineHeight: 52, letterSpacing: -1.3, color: colors.heading }}>{shown}</Text>
      </View>
      <Keypad
        onKey={(k) => setRaw((r) => typeValue(r, k, kind))}
        onBackspace={() => setRaw((r) => r.slice(0, -1))}
        leftKey={kind === "percentage" ? null : "."}
      />
      <View className="h-4" />
    </BottomSheet>
  );
}
