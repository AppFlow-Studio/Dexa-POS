import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { AmountDisplay } from "../components/AmountDisplay";
import { EmptyState } from "../components/EmptyState";
import { OfflineBanner } from "../components/OfflineBanner";
import { SectionLabel } from "../components/SectionLabel";
import { amountOf, typeAmount } from "../lib/amountInput";
import { formatCurrency } from "../lib/format";
import { paymentTitle, refundable } from "../lib/paymentRecords";
import { ChipRow, Keypad, PageHeader, SegmentedTabs, StickyActionBar, type SegmentedOption } from "../primitives";
import { refundPayment } from "../screens/pay/unwired";

type Mode = "full" | "part";
const MODES: readonly SegmentedOption<Mode>[] = [
  { value: "full", label: "Full refund" },
  { value: "part", label: "Amount" },
];
const REASONS = ["Guest complaint", "Wrong item", "Overcharged", "Duplicate charge", "Other"] as const;

/**
 * Refund one payment, after a manager approved it on the Payments page.
 * Full refunds whatever is left on the payment; Amount takes a typed part of
 * it, capped at what is left. A reason is required either way.
 *
 * Not wired: `refundPayment` is a Wave 4b seam (`screens/pay/unwired.ts`).
 */
export default function RefundPage({ orderId, paymentId, approvedBy }: { orderId: string; paymentId: string; approvedBy: string }) {
  const router = useRouter();
  const payment = useOrderStore((s) => s.ordersById[orderId]?.payments?.find((p) => p.id === paymentId) ?? null);
  const [mode, setMode] = useState<Mode>("full");
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!payment) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.screen }}>
        <PageHeader title="Refund" onBack={() => router.back()} />
        <EmptyState title="Payment not found" hint="It may have been voided or refunded from another station." />
      </View>
    );
  }

  const max = refundable(payment);
  const amount = mode === "full" ? max : amountOf(raw);
  const over = amount > max + 0.004;

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    const ok = await refundPayment(orderId, paymentId, { amount, reason, approvedBy });
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader
        title="Refund"
        subtitle={`${paymentTitle(payment)} · approved by ${approvedBy}`}
        onBack={() => router.back()}
      />
      <OfflineBanner />
      <SegmentedTabs value={mode} options={MODES} onChange={setMode} />
      <AmountDisplay
        label={mode === "full" ? "Refund everything left" : "Refund amount"}
        value={formatCurrency(amount)}
        note={over ? `Only ${formatCurrency(max)} can be refunded` : `${formatCurrency(max)} left on this payment`}
        noteColor={over ? colors.warning : undefined}
      />
      <SectionLabel text="Reason" />
      <ChipRow chips={REASONS.map((r) => ({ key: r, label: r }))} active={reason} onChange={setReason} />
      <View className="flex-1" />
      {mode === "part" ? (
        <Keypad onKey={(k) => setRaw((r) => typeAmount(r, k))} onBackspace={() => setRaw((r) => r.slice(0, -1))} />
      ) : null}
      <StickyActionBar
        actions={[
          {
            label: busy ? "Refunding…" : `Refund ${formatCurrency(amount)}`,
            disabled: busy || !reason || amount <= 0 || over,
            onPress: () => void submit(),
          },
        ]}
        hint={reason ? undefined : "Choose a reason to continue"}
      />
    </View>
  );
}
