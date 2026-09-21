import { colors } from "@/lib/theme";
import type { CartItem } from "@/lib/types";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { buildOpenCartItem } from "../../lib/cartItem";
import { formatCurrency } from "../../lib/format";
import { type } from "../../lib/type";
import { BottomSheet, Keypad, type KeypadKey, StickyActionBar, SwitchRow } from "../../primitives";

/** "45", "45.", "45.5" — digits with at most one point and two decimals. */
function typeAmount(current: string, key: KeypadKey): string {
  if (key === ".") return current.includes(".") ? current : current ? `${current}.` : "0.";
  const [, decimals] = current.split(".");
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current === "0" && key !== "00") return key;
  if (current.length >= 9) return current;
  return current + key;
}

/**
 * S4: an off-menu item with a real keypad. The entered price is the cash
 * price, as on the register's OpenItemAdder; dual pricing lifts the card
 * price by the location's percentage inside `buildOpenCartItem`.
 */
export function CustomItemSheet({ onAdd, onClose }: { onAdd: (item: CartItem) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxable, setTaxable] = useState(true);
  const dualPricingPct = useStoreSettingsStore((s) =>
    s.selectedStore?.pricing_strategy === "dual" ? (s.selectedStore.dual_pricing_percentage ?? null) : null,
  );
  const price = Number(amount) || 0;
  const ready = name.trim().length > 0 && price > 0;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Custom item"
      footer={
        <StickyActionBar
          actions={[
            {
              label: `Add item · ${formatCurrency(price)}`,
              disabled: !ready,
              onPress: () =>
                onAdd(
                  buildOpenCartItem({
                    name: name.trim(),
                    price,
                    taxable,
                    isToGo: false,
                    dualPricingPct: dualPricingPct && dualPricingPct > 0 ? dualPricingPct : null,
                  }),
                ),
            },
          ]}
        />
      }
    >
      <View className="mx-4 justify-center px-5" style={{ minHeight: 64, borderRadius: 18, backgroundColor: colors.card }}>
        <Text style={[type.nav, { color: colors.label }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What is it?"
          placeholderTextColor={colors.muted}
          autoCapitalize="sentences"
          className="py-0"
          style={[type.row, { fontWeight: "400", color: colors.heading }]}
          accessibilityLabel="Item name"
        />
      </View>
      <View className="items-center px-5 pt-3.5" style={{ paddingBottom: 10 }}>
        <Text style={[type.detail, { color: colors.label }]}>Price</Text>
        <Text style={{ fontSize: 44, fontWeight: "700", lineHeight: 52, letterSpacing: -1.3, color: colors.heading }}>
          {formatCurrency(price)}
        </Text>
      </View>
      <Keypad onKey={(k) => setAmount((a) => typeAmount(a, k))} onBackspace={() => setAmount((a) => a.slice(0, -1))} />
      <SwitchRow label="Taxable" value={taxable} onChange={setTaxable} />
    </BottomSheet>
  );
}
