import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useVerifyStaffPin } from "@/hooks/useVerifyStaffPin";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const MAX_PIN_LENGTH = 4;

/**
 * Attribution-only PIN gate shown over the order screen before each new order
 * when `requirePinPerOrder` is on. Verifies the PIN (no session/clock side
 * effects) and records the verified staff as the next order's creator via
 * `setOrderAttributionStaff`. Non-dismissable — there is no cancel; the only way
 * out is a valid PIN.
 */
export default function OrderPinGate({
  open,
  attributionOrderId,
  onVerified,
}: {
  open: boolean;
  /**
   * The target this verification is bound to: the active order id (QSR) or
   * PENDING_SEAT_ATTRIBUTION (dine-in seating). Stored alongside the staff id so
   * a verification can only satisfy the gate for the exact target it was for.
   */
  attributionOrderId: string | null;
  /** Called with the verified staff_profile_id after a successful PIN. */
  onVerified?: (staffProfileId: string) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shakeX = useSharedValue(0);

  const selectedStore = useStoreSettingsStore((st) => st.selectedStore);
  const selectedStation = useStoreSettingsStore((st) => st.selectedStation);
  const { isOnline } = useNetworkStatus();
  const { verifyPin } = useVerifyStaffPin();

  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 }),
    );
  };

  const submit = async (entered: string) => {
    if (!selectedStore || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const verified = await verifyPin({
        pin: entered,
        locationId: selectedStore.id,
        isOnline,
      });
      if (!verified) {
        shake();
        setError("Incorrect PIN. Please try again.");
        setPin("");
        return;
      }
      useEmployeeStore
        .getState()
        .setOrderAttributionStaff(verified.staffProfileId, attributionOrderId);
      setPin("");
      onVerified?.(verified.staffProfileId);
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyPress = (input: NumpadInput) => {
    if (verifying) return;
    if (typeof input === "number") {
      if (pin.length >= MAX_PIN_LENGTH) return;
      const next = pin + input.toString();
      setPin(next);
      if (next.length === MAX_PIN_LENGTH) void submit(next);
      return;
    }
    if (input === "backspace") setPin((p) => p.slice(0, -1));
    else if (input === "clear") setPin("");
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <Dialog open={open}>
      <DialogContent className="min-w-xl w-[420px]">
        <Animated.View style={[shakeStyle, { width: "100%" }]}>
          <Text
            style={{
              fontSize: s(15),
              fontWeight: "700",
              color: colors.heading,
              textAlign: "center",
              marginBottom: s(4),
            }}
          >
            Enter PIN to start order
          </Text>
          {selectedStation && selectedStore ? (
            <Text
              style={{
                fontSize: s(11),
                color: colors.muted,
                textAlign: "center",
                marginBottom: s(14),
              }}
            >
              {selectedStation.station_name} · {selectedStore.name}
            </Text>
          ) : (
            <View style={{ marginBottom: s(14) }} />
          )}

          <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

          {error ? (
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "600",
                color: colors.danger,
                textAlign: "center",
                marginBottom: s(8),
              }}
            >
              {error}
            </Text>
          ) : null}

          <View style={{ marginTop: s(4) }}>
            <PinNumpad onKeyPress={handleKeyPress} />
          </View>
        </Animated.View>
      </DialogContent>
    </Dialog>
  );
}
