import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { OfflineBanner } from "../components/OfflineBanner";
import { SectionLabel } from "../components/SectionLabel";
import { checkPageTitle, checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { PageHeader, StickyActionBar } from "../primitives";
import { MergeRow } from "../screens/merge/MergeRow";
import { useMergeCandidates } from "../screens/merge/useMergeCandidates";
import { mergeChecks } from "../screens/pay/unwired";

/**
 * Merge checks into this one — two checks at one table that should be paid
 * as one. Other checks on the same table are listed first. The footer names
 * how many are folding in and what the combined check comes to.
 *
 * Not wired: `mergeChecks` is a Wave 4b seam (`screens/pay/unwired.ts`).
 */
export default function MergePage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const { sameTable, others } = useMergeCandidates(orderId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const combined = useOrderStore((s) => {
    let sum = s.ordersById[orderId]?.total_amount ?? 0;
    for (const id of picked) sum += s.ordersById[id]?.total_amount ?? 0;
    return sum;
  });

  const toggle = useCallback(
    (id: string) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const merge = async () => {
    setBusy(true);
    const ok = await mergeChecks(orderId, [...picked]);
    setBusy(false);
    if (ok) router.back();
  };

  const section = (label: string, ids: string[]) =>
    ids.length ? (
      <View key={label}>
        <SectionLabel text={label} />
        {ids.map((id, i) => (
          <MergeRow key={id} orderId={id} checked={picked.has(id)} divider={i > 0} onToggle={toggle} />
        ))}
      </View>
    ) : null;

  const n = picked.size;
  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader
        title="Merge checks"
        subtitle={order ? `Into ${checkTitle(order)}` : undefined}
        onBack={() => router.back()}
      />
      <OfflineBanner />
      {sameTable.length + others.length === 0 ? (
        <EmptyState title="No other open checks" hint="There is nothing to merge into this check right now." />
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 12 }}>
          {section(order ? `Also on ${checkPageTitle(order).toLowerCase()}` : "Same table", sameTable)}
          {section("Other open checks", others)}
        </ScrollView>
      )}
      <StickyActionBar
        actions={[
          {
            label: busy ? "Merging…" : n ? `Merge ${n} ${n === 1 ? "check" : "checks"} · ${formatCurrency(combined)}` : "Choose checks to merge",
            disabled: n === 0 || busy,
            onPress: () => void merge(),
          },
        ]}
      />
    </View>
  );
}
