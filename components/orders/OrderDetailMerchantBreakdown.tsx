/**
 * OrderDetailMerchantBreakdown — staff-only platform-fee breakdown.
 *
 * Shows the merchant-side decomposition of a captured payment:
 *   - Subtotal charged / Platform fee / Merchant subtotal
 *   - Tip charged / Tip platform fee / Merchant tip
 *   - Merchant take-home
 *
 * Customer-invisibility invariant (per `feedback_platform_fees_invisible_to_customer`):
 *   This component is gated to manager roles and must NEVER be imported by
 *   any customer-facing render path (printed receipts, CFD `ResultScreen`,
 *   PDF receipt templates, email receipts). The
 *   `__tests__/platformFeesCustomerInvisibility.test.ts` regression test
 *   guards this.
 */

import { colors } from "@/lib/theme";
import type { MerchantRole } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import React from "react";
import { Text, View } from "react-native";

const MANAGER_ROLES: MerchantRole[] = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
];

interface Props {
  /** Card-priced payment subtotal (already includes baked-in surcharge). */
  amount: number;
  /** Tip charged to card (marked-up if surcharge > 0). */
  tipAmount: number;
  /** Surcharge portion of `amount`. 0 for cash payments. */
  dualPricingFee?: number;
  /** Surcharge portion of `tipAmount`. 0 for cash payments. */
  tipFee?: number;
}

const dollar = (n: number) => `$${(n || 0).toFixed(2)}`;

export const OrderDetailMerchantBreakdown: React.FC<Props> = ({
  amount,
  tipAmount,
  dualPricingFee = 0,
  tipFee = 0,
}) => {
  const employee = useEmployeeStore(s => s.loggedInEmployee);
  const isManager = !!employee && MANAGER_ROLES.includes(employee.role);

  if (!isManager) return null;
  if (dualPricingFee === 0 && tipFee === 0) return null;

  const merchantSubtotal = Math.max(0, (amount || 0) - dualPricingFee);
  const merchantTip = Math.max(0, (tipAmount || 0) - tipFee);
  const merchantTakehome = merchantSubtotal + merchantTip;

  const Row = ({
    label,
    value,
    accent,
  }: {
    label: string;
    value: string;
    accent?: "muted" | "info" | "success";
  }) => {
    const color =
      accent === "info"
        ? colors.info
        : accent === "success"
          ? colors.success
          : accent === "muted"
            ? colors.muted
            : colors.heading;
    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <Text style={{ fontSize: 11, color: accent === "muted" ? colors.muted : colors.label }}>
          {label}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color }}>{value}</Text>
      </View>
    );
  };

  return (
    <View
      style={{
        marginTop: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.teal + "40",
        backgroundColor: colors.teal + "08",
        borderRadius: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: colors.teal,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Merchant breakdown · internal
        </Text>
      </View>

      <Row label="Subtotal charged" value={dollar(amount)} />
      {dualPricingFee > 0 && (
        <Row label="Platform fee" value={`-${dollar(dualPricingFee)}`} accent="muted" />
      )}
      <Row label="Merchant subtotal" value={dollar(merchantSubtotal)} accent="info" />

      {tipAmount > 0 && (
        <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Row label="Tip charged" value={dollar(tipAmount)} />
          {tipFee > 0 && (
            <Row label="Tip platform fee" value={`-${dollar(tipFee)}`} accent="muted" />
          )}
          <Row label="Merchant tip" value={dollar(merchantTip)} accent="info" />
        </View>
      )}

      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Row label="Merchant take-home" value={dollar(merchantTakehome)} accent="success" />
      </View>
    </View>
  );
};
