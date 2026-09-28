import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import { Banknote, Columns2, CreditCard } from "@/lib/icons";
import React, { useCallback } from "react";
import { Text, View } from "react-native";
import { OfflineBanner } from "../components/OfflineBanner";
import { useCheckActions } from "../components/check/useCheckActions";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { BALANCE_EPSILON, payBlockedReason } from "../lib/payments";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";
import { Button, PageHeader } from "../primitives";
import { MethodRow } from "../screens/pay/MethodRow";

/**
 * Screen 6 — Take payment: Card, Split check and Cash over a balance-due
 * hero, as the artifact draws it.
 *
 * Card is wired (Wave 4a). Split and Cash are Wave 4b screens built ahead of
 * their logic — every action on them lands in `screens/pay/unwired.ts`. The
 * hero's "if paid in cash" line shows only when dual pricing makes cash
 * cheaper; with it off the line would repeat the card total.
 * See `docs/features/handheld/wave4b-plan.md`.
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
  const cashDue = totals?.cashAmountDue ?? due;
  const cashLine = cashDue < due - BALANCE_EPSILON ? `${formatCurrency(cashDue)} if paid in cash` : null;
  const guests = order?.guest_count ? `${order.guest_count} guests` : null;
  const subtitle = [order ? checkTitle(order) : null, guests].filter(Boolean).join(" · ");

  // Re-asserted at tap time, like CheckFooter: the check can change hands
  // between render and tap.
  const go = useCallback(
    (pathname: "/handheld/pay/tip/[orderId]" | "/handheld/pay/split/[orderId]" | "/handheld/pay/cash/[orderId]") => {
      const s = useOrderStore.getState();
      const why = payBlockedReason(s.ordersById[orderId], s.currentStationId);
      if (why) {
        toastService.show({ title: "Payment blocked", message: why, type: "warning" });
        return;
      }
      router.push({ pathname, params: { orderId } });
    },
    [orderId, router],
  );

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
        {cashLine ? (
          <Text className="mt-2" style={[type.heroNote, { color: colors.muted }]} numberOfLines={1}>
            {cashLine}
          </Text>
        ) : null}
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
          onPress={() => go("/handheld/pay/tip/[orderId]")}
          icon={<CreditCard size={26} color={blocked ? colors.muted : colors.onSolid} />}
        />
        <MethodRow
          testID="handheld-pay-split"
          title="Split check"
          detail="Evenly, by seat or by item"
          disabled={blocked !== null}
          onPress={() => go("/handheld/pay/split/[orderId]")}
          icon={<Columns2 size={26} color={blocked ? colors.muted : colors.heading} />}
        />
        <MethodRow
          testID="handheld-pay-cash"
          title="Cash"
          detail="Count it and give change"
          disabled={blocked !== null}
          onPress={() => go("/handheld/pay/cash/[orderId]")}
          icon={<Banknote size={26} color={blocked ? colors.muted : colors.heading} />}
        />
      </View>

      {/* `.pay-foot` — a text button, 8dp under the options. */}
      <View className="items-center" style={{ paddingTop: 8, paddingBottom: 30 }}>
        <Button label="Print the check" variant="text" fit onPress={actions.printCheck} />
      </View>
    </View>
  );
}
