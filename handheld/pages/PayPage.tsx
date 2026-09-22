import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import { CreditCard } from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, View } from "react-native";
import { OfflineBanner } from "../components/OfflineBanner";
import { useCheckActions } from "../components/check/useCheckActions";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { payBlockedReason } from "../lib/payments";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";
import { Button, PageHeader } from "../primitives";
import { MethodRow } from "../screens/pay/MethodRow";

/**
 * Screen 6 — Take payment.
 *
 * The artifact draws three rows (Card, Split check, Cash) over a balance-due
 * hero. Wave 4a renders **Card only**: cash is out of Wave 4 entirely (the
 * drawer story for a pocketed device is unsettled) and split is Wave 4b.
 * The hero's "$182.37 if paid in cash" line goes with cash — a dual-pricing
 * line has nothing to offer when the device cannot take cash, and with dual
 * pricing off it would duplicate the card total anyway.
 * See `docs/features/handheld/wave4-plan.md`.
 */
export default function PayPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const totals = useOrderTotals(orderId);
  const blocked = useOrderStore((s) =>
    payBlockedReason(s.ordersById[orderId], s.currentStationId),
  );
  const actions = useCheckActions(orderId, useCallback(() => router.back(), [router]));

  // The hero reads from `useOrderTotals`, not `payableBalance`: the guard is
  // deliberately conservative and reports 0 for every unknown, which would
  // flash "$0.00" at a guest the moment the network hiccups.
  const due = totals?.amountDue ?? order?.amount_due ?? 0;
  const guests = order?.guest_count ? `${order.guest_count} guests` : null;
  const subtitle = [order ? checkTitle(order) : null, guests].filter(Boolean).join(" · ");

  const toTip = useCallback(() => {
    const s = useOrderStore.getState();
    const why = payBlockedReason(s.ordersById[orderId], s.currentStationId);
    if (why) {
      toastService.show({ title: "Payment blocked", message: why, type: "warning" });
      return;
    }
    router.push({ pathname: "/handheld/pay/tip/[orderId]", params: { orderId } });
  }, [orderId, router]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader title="Payment" subtitle={subtitle || undefined} onBack={() => router.back()} />
      <OfflineBanner />

      {/* `.hero-a` — 28dp above, label over the figure, both centred. */}
      <View className="items-center px-5" style={{ paddingTop: 28 }}>
        <Text style={[type.heroLabel, { color: colors.label }]}>Balance due</Text>
        <Text className="mt-1.5" style={[type.hero, { color: colors.heading }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(due)}
        </Text>
      </View>

      {/* `.grow` — the artifact pushes the options into the thumb zone. */}
      <View className="flex-1" />

      <View style={{ paddingHorizontal: metrics.px, gap: 10 }}>
        <MethodRow
          testID="handheld-pay-card"
          title="Card"
          detail="Tip, then tap on this device"
          primary
          disabled={blocked !== null}
          onPress={toTip}
          icon={<CreditCard size={26} color={blocked ? colors.muted : colors.onSolid} />}
        />
      </View>

      {/* `.pay-foot` — a text button, 8dp under the options. */}
      <View className="items-center" style={{ paddingTop: 8, paddingBottom: 30 }}>
        <Button label="Print the check" variant="text" fit onPress={actions.printCheck} />
      </View>
    </View>
  );
}
