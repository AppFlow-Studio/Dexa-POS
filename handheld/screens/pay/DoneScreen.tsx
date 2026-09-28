import { colors } from "@/lib/theme";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import React, { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { StickyActionBar } from "../../primitives";
import { ReceiptOptions } from "./ReceiptOptions";
import { SuccessView } from "./SuccessView";
import { useCloseTable } from "./useCloseTable";
import { useLeavePay } from "./useLeavePay";
import { useTableLabel } from "./useTableLabel";

/**
 * Screen 9 — the payment went through: the success header, "Send a
 * receipt", then "Close table N" (or "Done" for a check with no table). The
 * hint under it follows the location's auto-clear setting, since that
 * decides whether the table frees up or goes to cleaning (useCloseTable).
 * Card and cash both end here; `line` is what differs ("Approved · Visa
 * ending 4412" / "Cash · $2.60 change").
 */
export function DoneScreen({
  orderId,
  amount,
  tip,
  line,
}: {
  orderId: string;
  amount: number;
  tip: number;
  line: string;
}) {
  const close = useCloseTable(orderId);
  const table = useTableLabel(orderId);
  const autoClear = useLocationConfigStore((s) => s.config.dining.autoClearTableOnPayment === true);
  const leave = useLeavePay();

  const finish = useCallback(async () => {
    await close.close();
    leave();
  }, [close, leave]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      {/* Scrolls only at large font scales; at 1.0 everything fits 720dp. */}
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <SuccessView amount={amount} tip={tip} card={line} />
        <ReceiptOptions orderId={orderId} />
      </ScrollView>
      <StickyActionBar
        column
        actions={[
          {
            label: table ? `Close ${table.toLowerCase()}` : "Done",
            onPress: () => void finish(),
            disabled: close.busy,
          },
        ]}
        hint={table ? (autoClear ? `${table} frees up` : `${table} moves to cleaning`) : undefined}
      />
    </View>
  );
}
