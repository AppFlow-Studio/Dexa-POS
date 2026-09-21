import { isOrderReadOnly } from "@/lib/orderAccessControl";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useOrderStore } from "@/stores/useOrderStore";
import { Lock } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/** Station ownership, the register's rule: a check another station opened is read-only until claimed. */
export function useIsReadOnly(orderId: string): boolean {
  return useOrderStore((s) => isOrderReadOnly(s.ordersById[orderId], s.currentStationId));
}

const CLAIM_ERRORS: Record<string, string> = {
  ORDER_LOCKED_FOR_PAYMENT: "The other station is taking payment on it.",
  ORDER_FINALIZED: "This check has already been closed.",
  CONCURRENT_CLAIM: "Another station just took it. Try again.",
  NETWORK: "You need a connection to take over a check.",
};

/**
 * The register's ReadOnlyBanner as a `.bn` card: who has the check, and a
 * "Take over" that runs the same `claimOrderById` the tablet uses.
 */
export function TakeOverCard({ orderId }: { orderId: string }) {
  const station = useOrderStore((s) => {
    const o = s.ordersById[orderId];
    return o?.station_name ?? o?._sourceStationName ?? null;
  });
  const [claiming, setClaiming] = useState(false);

  const takeOver = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const result = await useOrderStore.getState().claimOrderById(orderId);
      if (!result.success) {
        toastService.show({
          title: "Couldn't take over",
          message: CLAIM_ERRORS[result.error] ?? "Try again in a moment.",
          type: "error",
        });
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <View className="mx-4 mb-3 flex-row items-center gap-3.5 rounded-[22px] px-4 py-3.5" style={{ backgroundColor: tint.warnSoft }} accessibilityRole="alert">
      <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: tint.warnIcon }}>
        <Lock size={22} color={colors.warning} />
      </View>
      <View className="min-w-0 flex-1">
        <Text style={[type.line, { fontWeight: "600", color: colors.heading }]}>Read-only</Text>
        <Text className="mt-0.5" style={[type.detail, { color: colors.label }]}>
          Currently owned by {station?.trim() || "another station"}. Take over to edit.
        </Text>
      </View>
      <Pressable
        onPress={() => void takeOver()}
        disabled={claiming}
        accessibilityRole="button"
        accessibilityLabel="Take over this order"
        className="justify-center rounded-full px-4"
        style={{ minHeight: 36, backgroundColor: tint.accentSoft, opacity: claiming ? 0.5 : 1 }}
      >
        <Text style={[type.segment, { color: colors.teal }]}>{claiming ? "Taking…" : "Take over"}</Text>
      </Pressable>
    </View>
  );
}
