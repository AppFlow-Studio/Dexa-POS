import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { AlertTriangle, Nfc } from "@/lib/icons";
import React from "react";
import { Text, View } from "react-native";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { chargeTotal, payableBalance } from "../lib/payments";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";
import { StickyActionBar } from "../primitives";
import { ChargeMessage } from "../screens/pay/ChargeMessage";
import { DoneScreen } from "../screens/pay/DoneScreen";
import { describeCard } from "../screens/pay/SuccessView";
import { useCharge } from "../screens/pay/useCharge";
import { useLeavePay } from "../screens/pay/useLeavePay";
import { useTableLabel } from "../screens/pay/useTableLabel";

/**
 * Screens 8 and 9 — tap to pay, then close the table.
 *
 * The header has no back button while the reader is open: ATOM has no
 * cancel-before-card, so there is nothing a Back could abort. The artifact
 * draws screen 8's header the same way (`.bar-t.pl`, no `.ib`).
 */
export default function ChargePage({ orderId, tip }: { orderId: string; tip: number }) {
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const { phase, charge, retry } = useCharge(orderId, tip);

  const balance = payableBalance(order);
  const total = chargeTotal(balance, tip);
  const table = useTableLabel(orderId);
  const leave = useLeavePay();

  // Screen 9.
  if (phase.kind === "done") {
    return (
      <DoneScreen orderId={orderId} amount={phase.amount} tip={phase.tip} line={describeCard(phase.response)} />
    );
  }

  // The card was approved and the payment did NOT record. Never offer a
  // retry here — that is how a guest gets charged twice.
  if (phase.kind === "unrecorded") {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.screen }}>
        <Header title="Check with a manager" line={`${formatCurrency(phase.amount)} was charged`} />
        <ChargeMessage
          tone="warn"
          icon={<AlertTriangle size={50} color={colors.warning} strokeWidth={1.8} />}
          title="The card was charged but not recorded"
          detail="Do not charge again. Take the check to the register so the payment can be added by hand."
        />
        <StickyActionBar column actions={[{ label: "Back to the check", onPress: leave, variant: "soft" }]} />
      </View>
    );
  }

  // The charge may have landed — same rule, no retry.
  if (phase.kind === "verify") {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.screen }}>
        <Header title="Check the reader" line={table ?? undefined} />
        <ChargeMessage
          tone="warn"
          icon={<AlertTriangle size={50} color={colors.warning} strokeWidth={1.8} />}
          title="We could not confirm this payment"
          detail={phase.message}
        />
        <StickyActionBar column actions={[{ label: "Back to the check", onPress: leave, variant: "soft" }]} />
      </View>
    );
  }

  // A clean decline leaves the check open and untouched, so a retry is safe.
  if (phase.kind === "declined") {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.screen }}>
        <Header title="Card payment" line={table ?? undefined} />
        <ChargeMessage
          tone="warn"
          icon={<AlertTriangle size={50} color={colors.warning} strokeWidth={1.8} />}
          title="The card was declined"
          detail={phase.message}
        />
        <StickyActionBar
          column
          actions={[
            { label: "Try again", onPress: retry },
            { label: "Back", onPress: leave, variant: "text" },
          ]}
        />
      </View>
    );
  }

  // Screen 8 — the hand-off warning, and the same screen while the card app
  // has the foreground.
  const charging = phase.kind === "charging";
  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <Header
        title="Card payment"
        line={[table ?? (order ? checkTitle(order) : null), `${formatCurrency(total)}${tip > 0 ? " with tip" : ""}`]
          .filter(Boolean)
          .join(" · ")}
      />
      <ChargeMessage
        icon={<Nfc size={50} color={colors.teal} strokeWidth={1.8} />}
        title={charging ? "Waiting for the card" : "The card reader opens next"}
        detail={
          charging
            ? "The payment app has the screen. You'll come back here when it's done."
            : "Your guest taps, inserts or swipes in the payment app. You'll come back here when it's done."
        }
      />
      <StickyActionBar
        column
        actions={[
          {
            label: charging ? "Waiting…" : "Open card reader",
            onPress: () => void charge(),
            disabled: charging,
          },
          ...(charging ? [] : [{ label: "Back", onPress: leave, variant: "text" as const }]),
        ]}
      />
    </View>
  );
}

/** The artifact's `.bar` with `.bar-t.pl`: a title and a line, no back button. */
function Header({ title, line }: { title: string; line?: string }) {
  return (
    <View className="justify-center px-5" style={{ minHeight: metrics.bar }}>
      <Text style={[type.pageTitle, { color: colors.heading }]} numberOfLines={1}>
        {title}
      </Text>
      {line ? (
        <Text className="mt-0.5" style={[type.pageSubtitle, { color: colors.label }]} numberOfLines={1}>
          {line}
        </Text>
      ) : null}
    </View>
  );
}
