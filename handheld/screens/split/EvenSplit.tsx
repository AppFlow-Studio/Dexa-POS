import { colors } from "@/lib/theme";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SectionLabel } from "../../components/SectionLabel";
import { evenShares, MAX_WAYS, MIN_WAYS } from "../../lib/split";
import { type } from "../../lib/type";
import { Stepper } from "../menu/Stepper";
import type { SplitShare } from "../pay/unwired";
import { ShareRow } from "./ShareRow";

/**
 * "Evenly": how many ways, then one row per share. Leftover cents go to the
 * first shares so the shares always add back to the balance.
 */
export function EvenSplit({
  due,
  defaultWays,
  busy,
  onPay,
}: {
  due: number;
  defaultWays: number;
  busy: boolean;
  onPay: (share: SplitShare) => void;
}) {
  const [ways, setWays] = useState(defaultWays);
  const shares = useMemo(() => evenShares(due, ways), [due, ways]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
      <View
        className="mx-4 flex-row items-center justify-between px-5"
        style={{ minHeight: 72, borderRadius: 22, backgroundColor: colors.panel }}
      >
        <Text style={[type.row, { fontWeight: "400", color: colors.heading }]}>Split between</Text>
        <Stepper value={ways} onChange={(n) => setWays(Math.min(MAX_WAYS, Math.max(MIN_WAYS, n)))} />
      </View>
      <SectionLabel text={`${ways} shares`} />
      {shares.map((amount, i) => (
        <ShareRow
          key={i}
          title={`Guest ${i + 1}`}
          amount={amount}
          divider={i > 0}
          disabled={busy}
          onPay={() => onPay({ label: `Guest ${i + 1} of ${ways}`, amount })}
        />
      ))}
    </ScrollView>
  );
}
