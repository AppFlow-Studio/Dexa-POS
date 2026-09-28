import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { OfflineBanner } from "../components/OfflineBanner";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { PageHeader, SegmentedTabs, type SegmentedOption } from "../primitives";
import { payShare, type SplitShare } from "../screens/pay/unwired";
import { EvenSplit } from "../screens/split/EvenSplit";
import { ItemSplit } from "../screens/split/ItemSplit";
import { SeatSplit } from "../screens/split/SeatSplit";
import { useSplitData } from "../screens/split/useSplitData";

type Mode = "even" | "seat" | "item";

const MODES: readonly SegmentedOption<Mode>[] = [
  { value: "even", label: "Evenly" },
  { value: "seat", label: "By seat" },
  { value: "item", label: "By item" },
];

/**
 * Split check, reached from screen 6's "Split check" row. The artifact
 * promises "Evenly or by seat"; by item is the register's third way and
 * costs one more tab. Each share has its own Pay.
 *
 * Not wired: `payShare` is a Wave 4b seam (`screens/pay/unwired.ts`). Wiring
 * it means running the share through screens 7–8 with the share's amount in
 * place of the balance.
 */
export default function SplitPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const data = useSplitData(orderId);
  const [mode, setMode] = useState<Mode>("even");
  const [busy, setBusy] = useState(false);

  const pay = useCallback(
    async (share: SplitShare) => {
      setBusy(true);
      await payShare(orderId, share);
      setBusy(false);
    },
    [orderId],
  );
  const onPay = useCallback((share: SplitShare) => void pay(share), [pay]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader
        title="Split check"
        subtitle={[order ? checkTitle(order) : null, `${formatCurrency(data.due)} due`].filter(Boolean).join(" · ")}
        onBack={() => router.back()}
      />
      <OfflineBanner />
      <SegmentedTabs value={mode} options={MODES} onChange={setMode} />
      {mode === "even" ? (
        <EvenSplit due={data.due} defaultWays={data.defaultWays} busy={busy} onPay={onPay} />
      ) : mode === "seat" ? (
        <SeatSplit lines={data.lines} taxRatesMap={data.taxRatesMap} busy={busy} onPay={onPay} />
      ) : (
        <ItemSplit lines={data.lines} taxRatesMap={data.taxRatesMap} busy={busy} onPay={onPay} />
      )}
    </View>
  );
}
