import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  performQuickClockInOut,
  QuickClockMode,
} from "@/services/quickClockInOut";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Clock, LogIn, LogOut } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface ClockInOutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_PIN_LENGTH = 4;

/**
 * PIN-driven clock in / out that does NOT switch the active terminal account.
 * Any staff member can walk up, enter their PIN, and clock in or out without
 * taking over whoever is currently signed in.
 */
const ClockInOutModal: React.FC<ClockInOutModalProps> = ({
  isOpen,
  onClose,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();

  const [pin, setPin] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const shakeX = useSharedValue(0);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPin("");
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 }),
    );
  };

  const handleKeyPress = (input: NumpadInput) => {
    if (submitting) return;
    setError(null);
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) setPin((prev) => prev + input);
    } else if (input === "backspace") {
      setPin((prev) => prev.slice(0, -1));
    } else if (input === "clear") {
      setPin("");
    }
  };

  const handleAction = async (mode: QuickClockMode) => {
    if (submitting) return;
    if (pin.length !== MAX_PIN_LENGTH) {
      triggerShake();
      setError(`PIN must be ${MAX_PIN_LENGTH} digits`);
      return;
    }
    if (!selectedStore?.id || !deviceId) {
      setError("Store or device not configured");
      return;
    }

    setSubmitting(true);
    const result = await performQuickClockInOut(supabase, {
      mode,
      pin,
      locationId: selectedStore.id,
      deviceId,
    });
    setSubmitting(false);

    if (result.status === "success") {
      const name = result.employeeName;
      if (result.mode === "clock_in") {
        show({
          title: "Clocked In",
          message: name ? `Welcome, ${name}!` : "Clocked in successfully.",
          type: "success",
        });
      } else {
        show({
          title: "Clocked Out",
          message: name
            ? `${name} has been clocked out.`
            : "Clocked out successfully.",
          type: "success",
        });
      }
      setPin("");
      setError(null);
      onClose();
      // If the active terminal user just clocked themselves out, drop back to
      // the PIN login screen (mirrors the normal sign-out flow).
      if (result.mode === "clock_out" && result.wasActiveUser) {
        replaceRoute("(auth)", "pin-login");
      }
      return;
    }

    if (result.status === "queued") {
      show({
        title: "Saved Offline",
        message: "Your action will sync when the connection is restored.",
        type: "warning",
      });
      setPin("");
      setError(null);
      onClose();
      return;
    }

    // error
    triggerShake();
    setError(result.message);
    setPin("");
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const pinReady = pin.length === MAX_PIN_LENGTH && !submitting;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="p-0 overflow-hidden"
        style={{ borderRadius: s(14) }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              backgroundColor: colors.screen,
              paddingVertical: s(14),
              paddingHorizontal: s(20),
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: s(8),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: s(28),
                height: s(28),
                borderRadius: 999,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "40",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock size={s(14)} color={colors.teal} />
            </View>
            <DialogTitle>
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                Clock In / Out
              </Text>
            </DialogTitle>
          </View>

          {/* Body */}
          <Animated.View style={[shakeStyle, { padding: s(20) }]}>
            <Text
              style={{
                fontSize: s(12),
                color: colors.muted,
                textAlign: "center",
                marginBottom: s(14),
              }}
            >
              Enter your PIN — this will not switch the active account
            </Text>

            <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

            <View style={{ marginTop: s(10) }}>
              <PinNumpad onKeyPress={handleKeyPress} />
            </View>

            {/* Error */}
            <View
              style={{
                height: s(20),
                marginTop: s(8),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {error && (
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.danger,
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              )}
            </View>

            {/* Actions */}
            <View
              style={{
                flexDirection: "row",
                gap: s(8),
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: s(14),
              }}
            >
              <TouchableOpacity
                onPress={() => handleAction("clock_out")}
                disabled={!pinReady}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(6),
                  paddingVertical: s(10),
                  borderWidth: 1,
                  borderColor: pinReady ? colors.danger + "60" : colors.border,
                  borderRadius: s(8),
                  backgroundColor: pinReady
                    ? colors.danger + "12"
                    : colors.screen,
                }}
              >
                <LogOut
                  size={s(14)}
                  color={pinReady ? colors.danger : colors.muted}
                />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "700",
                    color: pinReady ? colors.danger : colors.muted,
                  }}
                >
                  Clock Out
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleAction("clock_in")}
                disabled={!pinReady}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(6),
                  paddingVertical: s(10),
                  backgroundColor: pinReady ? colors.teal : colors.teal + "30",
                  borderRadius: s(8),
                }}
              >
                <LogIn
                  size={s(14)}
                  color={pinReady ? colors.onSolid : colors.muted}
                />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "700",
                    color: pinReady ? colors.onSolid : colors.muted,
                  }}
                >
                  Clock In
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ClockInOutModal;
