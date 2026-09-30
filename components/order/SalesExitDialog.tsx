import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { countUnsentItems } from "@/lib/salesExitGuard";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSalesExitGuardStore } from "@/stores/useSalesExitGuardStore";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

/**
 * Asked when leaving Sales with unsent items while "Require PIN per order" is
 * on (see useSalesExitGuardStore). Rendered by the Sales screen; opens whenever
 * the guard holds a pending exit.
 */
export default function SalesExitDialog() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const isOpen = useSalesExitGuardStore((st) => st.pendingExit !== null);
  const isSending = useSalesExitGuardStore((st) => st.isSending);
  const stay = useSalesExitGuardStore((st) => st.stay);
  const leaveOrderOpen = useSalesExitGuardStore((st) => st.leaveOrderOpen);
  const sendAndLeave = useSalesExitGuardStore((st) => st.sendAndLeave);
  const unsentCount = useOrderStore((st) =>
    st.activeOrderId ? countUnsentItems(st.ordersById[st.activeOrderId]) : 0,
  );

  const buttonText = {
    fontSize: s(14),
    fontWeight: "700" as const,
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
    >
      <DialogContent
        className="w-[520px] rounded-2xl p-0 overflow-hidden"
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View className="px-5 pt-5 pb-4" style={{ backgroundColor: colors.panel }}>
          <DialogHeader>
            <DialogTitle
              style={{
                fontSize: s(20),
                fontWeight: "700",
                color: colors.heading,
              }}
            >
              Send to kitchen before leaving?
            </DialogTitle>
          </DialogHeader>
          <Text
            style={{
              color: colors.label,
              fontSize: s(14),
              marginTop: s(8),
              lineHeight: s(20),
            }}
          >
            {unsentCount === 1
              ? "1 item on this order hasn't been sent to the kitchen."
              : `${unsentCount} items on this order haven't been sent to the kitchen.`}{" "}
            The next person will start a new order. This one stays open in
            Previous Orders.
          </Text>
        </View>

        <DialogFooter className="flex-row px-5 pb-5 pt-1 gap-3">
          <TouchableOpacity
            onPress={stay}
            disabled={isSending}
            className="flex-1 h-11 rounded-xl items-center justify-center"
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isSending ? 0.5 : 1,
            }}
          >
            <Text style={[buttonText, { color: colors.heading }]}>Stay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={leaveOrderOpen}
            disabled={isSending}
            className="flex-1 h-11 rounded-xl items-center justify-center"
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isSending ? 0.5 : 1,
            }}
          >
            <Text style={[buttonText, { color: colors.heading }]}>
              Leave Order Open
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void sendAndLeave()}
            disabled={isSending}
            className="flex-1 h-11 rounded-xl items-center justify-center"
            style={{ backgroundColor: colors.teal }}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.onSolid} />
            ) : (
              <Text style={[buttonText, { color: colors.onSolid }]}>
                Send & Leave
              </Text>
            )}
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
