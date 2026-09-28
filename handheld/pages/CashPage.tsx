import { colors } from "@/lib/theme";
import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { AmountDisplay } from "../components/AmountDisplay";
import { OfflineBanner } from "../components/OfflineBanner";
import { amountOf, typeAmount } from "../lib/amountInput";
import { changeDue, quickCashAmounts, stillOwed } from "../lib/cash";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { Keypad, PageHeader, StickyActionBar } from "../primitives";
import { DoneScreen } from "../screens/pay/DoneScreen";
import { QuickCash } from "../screens/pay/QuickCash";
import { recordCash } from "../screens/pay/unwired";

type Phase = { kind: "tender" } | { kind: "done"; amount: number; change: number };

/**
 * Cash at the table: what the guest handed over, the change owed, and
 * "Record cash". The balance is the cash price (`cashAmountDue`), which is
 * lower than the card total when dual pricing is on.
 *
 * Not wired: `recordCash` is a Wave 4b seam (`screens/pay/unwired.ts`). The
 * drawer question from `wave4-plan.md` ("Cash — why it is out") still has to
 * be answered before it is.
 */
export default function CashPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const totals = useOrderTotals(orderId);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "tender" });

  const due = totals?.cashAmountDue ?? totals?.amountDue ?? order?.amount_due ?? 0;
  const tendered = amountOf(raw);
  const change = changeDue(due, tendered);
  const owed = stillOwed(due, tendered);
  const covered = due > 0 && owed === 0;

  if (phase.kind === "done") {
    const line = phase.change > 0 ? `Cash · ${formatCurrency(phase.change)} change` : "Cash · exact";
    return <DoneScreen orderId={orderId} amount={phase.amount} tip={0} line={line} />;
  }

  const record = async () => {
    setBusy(true);
    const ok = await recordCash(orderId, { amount: due, tendered });
    setBusy(false);
    if (ok) setPhase({ kind: "done", amount: due, change });
  };

  const note =
    tendered === 0
      ? `${formatCurrency(due)} due`
      : covered
        ? `Change ${formatCurrency(change)}`
        : `${formatCurrency(owed)} still owed`;
  const noteColor = tendered === 0 ? colors.muted : covered ? colors.success : colors.warning;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader
        title="Cash"
        subtitle={[order ? checkTitle(order) : null, `${formatCurrency(due)} due`].filter(Boolean).join(" · ")}
        onBack={() => router.back()}
      />
      <OfflineBanner />
      <AmountDisplay label="Cash received" value={formatCurrency(tendered)} note={note} noteColor={noteColor} />
      <View className="flex-1" />
      <QuickCash amounts={quickCashAmounts(due)} selected={raw ? tendered : null} onPick={(a) => setRaw(a.toFixed(2))} />
      <View className="h-3" />
      <Keypad onKey={(k) => setRaw((r) => typeAmount(r, k))} onBackspace={() => setRaw((r) => r.slice(0, -1))} />
      <StickyActionBar
        actions={[
          {
            label: busy ? "Recording…" : covered ? `Record cash · ${formatCurrency(due)}` : "Record cash",
            disabled: !covered || busy,
            onPress: () => void record(),
          },
        ]}
      />
    </View>
  );
}
