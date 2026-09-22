import { colors } from "@/lib/theme";
import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { type } from "../lib/type";
import { StickyActionBar } from "../primitives";
import { CustomTipSheet } from "../screens/pay/CustomTipSheet";
import { TipAltCard, TipCard, TipRow } from "../screens/pay/TipCard";
import { useTip } from "../screens/pay/useTip";

/**
 * Screen 7 — the guest adds a tip.
 *
 * Guest-facing, so it has no `.bar` header and no back button, exactly as the
 * artifact draws it: the server hands the device over and the guest sees only
 * the amount, the presets and Continue. Android's hardware back still works
 * for the server.
 *
 * The tip is baked into the authorization (`tipAmount`, ATOM "Flow B") rather
 * than letting the terminal draw its own tip prompt — that is what makes this
 * screen Dexa's to draw. See `docs/features/handheld/wave4-plan.md`.
 */
export default function TipPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const totals = useOrderTotals(orderId);
  const [customOpen, setCustomOpen] = useState(false);

  const base = totals?.amountDue ?? order?.amount_due ?? 0;
  const tip = useTip(base);

  const toCharge = useCallback(() => {
    router.push({
      pathname: "/handheld/pay/charge/[orderId]",
      params: { orderId, tip: String(tip.tip) },
    });
  }, [router, orderId, tip.tip]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      {/* `.tipt` — 48dp of air above, everything centred. */}
      <View className="items-center px-6" style={{ paddingTop: 48 }}>
        <Text style={[type.tipLabel, { color: colors.label }]}>Add a tip</Text>
        <Text
          className="mt-1.5"
          style={[type.hero, { color: colors.heading }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatCurrency(base)}
        </Text>
        <Text className="mt-2" style={[type.heroNote, { color: colors.muted }]} numberOfLines={1}>
          {order ? `${checkTitle(order)} · Thank you` : "Thank you"}
        </Text>
      </View>

      {/* `.grow` — presets sit in the thumb zone for a seated guest. */}
      <View className="flex-1" />

      <TipRow>
        {tip.presets.map((p) => (
          <TipCard
            key={p.percent}
            percent={p.percent}
            value={formatCurrency(p.amount)}
            selected={tip.isPreset(p.percent)}
            onPress={() => tip.selectPreset(p.percent)}
          />
        ))}
      </TipRow>

      <TipRow top={10}>
        <TipAltCard label="Custom" selected={tip.isCustom} onPress={() => setCustomOpen(true)} />
        <TipAltCard label="No tip" selected={tip.isNone} onPress={tip.selectNone} />
      </TipRow>

      <StickyActionBar
        actions={[{ label: `Continue · ${formatCurrency(tip.total)}`, onPress: toCharge }]}
      />

      {customOpen ? (
        <CustomTipSheet
          balance={base}
          onApply={tip.selectCustom}
          onClose={() => setCustomOpen(false)}
        />
      ) : null}
    </View>
  );
}
