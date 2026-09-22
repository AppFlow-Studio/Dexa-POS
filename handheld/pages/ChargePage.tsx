import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import { AlertTriangle, Nfc } from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, View } from "react-native";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { checkTitle } from "../lib/checks";
import { formatCurrency } from "../lib/format";
import { chargeTotal, payableBalance } from "../lib/payments";
import { tableIdOf } from "../lib/sendCourse";
import { tableTitle } from "../lib/tableName";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";
import { StickyActionBar } from "../primitives";
import { ChargeMessage } from "../screens/pay/ChargeMessage";
import { describeCard, SuccessView } from "../screens/pay/SuccessView";
import { useCharge } from "../screens/pay/useCharge";
import { useCloseTable } from "../screens/pay/useCloseTable";

/**
 * Screens 8 and 9 — tap to pay, then close the table.
 *
 * The header has no back button while the reader is open: ATOM has no
 * cancel-before-card, so there is nothing a Back could abort. The artifact
 * draws screen 8's header the same way (`.bar-t.pl`, no `.ib`).
 */
export default function ChargePage({ orderId, tip }: { orderId: string; tip: number }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const { phase, charge, retry } = useCharge(orderId, tip);
  const close = useCloseTable(orderId);

  const balance = payableBalance(order);
  const total = chargeTotal(balance, tip);
  const table = useTableLabel(orderId);

  // The pay flow pushed three screens over the check (pay → tip → charge), so
  // a single back() would land on the tip screen. Unwind the whole flow.
  const leave = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    else router.back();
  }, [router]);

  const finish = useCallback(async () => {
    await close.close();
    leave();
  }, [close, leave]);

  // Screen 9.
  if (phase.kind === "done") {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.screen }}>
        <SuccessView amount={phase.amount} tip={phase.tip} card={describeCard(phase.response)} />
        <View className="flex-1" />
        <StickyActionBar
          column
          actions={[
            {
              label: table ? `Close ${table.toLowerCase()}` : "Done",
              onPress: () => void finish(),
              disabled: close.busy,
            },
          ]}
          hint={table ? `${table} frees up` : undefined}
        />
      </View>
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

/**
 * "Table 12" for a check that sits on a table, else null — a takeout check
 * has nothing to close, so screen 9's button becomes a plain "Done".
 */
function useTableLabel(orderId: string): string | null {
  const tableId = useOrderStore((s) => {
    const order = s.ordersById[orderId];
    return order ? tableIdOf(order) : null;
  });
  return useFloorPlanStore((s) => {
    if (!tableId) return null;
    const name = s.tables.find((t) => t.id === tableId)?.name;
    return name ? tableTitle(name, []) : null;
  });
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
