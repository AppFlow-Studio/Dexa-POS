import { colors } from "@/lib/theme";
import { Check } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { metrics, tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/**
 * Best-effort card description for the artifact's "Approved · Visa ending
 * 4412" line. Terminal responses are not normalised across processors, so
 * this reads the handful of keys the shipped mappers set and degrades to a
 * bare "Approved" rather than printing something wrong on a receipt line.
 */
export function describeCard(response?: Record<string, unknown>): string {
  if (!response) return "Approved";
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = response[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
    return null;
  };
  const brand = pick("cardBrand", "card_brand", "cardType", "card_type");
  const last4 = pick("cardLast4", "card_last4", "last4", "maskedPan");
  const tail = last4 ? last4.replace(/\D/g, "").slice(-4) : null;
  if (brand && tail) return `Approved · ${brand} ending ${tail}`;
  if (brand) return `Approved · ${brand}`;
  if (tail) return `Approved · card ending ${tail}`;
  return "Approved";
}

/**
 * Screen 9's `.okh` header — the success mark, the charged amount, and the
 * two muted lines under it.
 *
 * The artifact also draws a 2x2 "Send a receipt" grid here. That is Wave 4b
 * (text and email have no handheld path yet, and print has to be pinned to
 * the built-in printer or it routes to the register's).
 */
export function SuccessView({ amount, tip, card }: { amount: number; tip: number; card: string }) {
  return (
    <View className="items-center" style={{ paddingTop: 34, paddingHorizontal: 20, paddingBottom: 28 }}>
      <View
        className="items-center justify-center"
        style={{
          width: metrics.successDot,
          height: metrics.successDot,
          borderRadius: 999,
          backgroundColor: tint.okSoft,
          marginBottom: 22,
        }}
      >
        <Check size={42} color={colors.success} strokeWidth={2.4} />
      </View>
      <Text
        style={[type.successAmount, { color: colors.heading }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatCurrency(amount)}
      </Text>
      <Text className="mt-2" style={[type.successNote, { color: colors.label }]}>
        {card}
      </Text>
      {tip > 0 ? (
        <Text className="mt-0.5" style={[type.successNote, { color: colors.label }]}>
          Includes {formatCurrency(tip)} tip
        </Text>
      ) : null}
    </View>
  );
}
