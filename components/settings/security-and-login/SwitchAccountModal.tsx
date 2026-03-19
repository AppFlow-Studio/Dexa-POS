import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useTimeClock } from "@/hooks/useTimeclock";
import { getDeviceId } from "@/lib/deviceId";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Clock, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { getEmployeeByStaffId, setActiveSession, clockIn: employeeClockIn } = useEmployeeStore();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { getSession, clockIn: timeclockClockIn } = useTimeclockStore();
  const timeClock = useTimeClock();
  const { showLoading, hideLoading } = useLoading();

  const [pin, setPin] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const MAX_PIN_LENGTH = 4;
  const [error, setError] = useState<string | null>(null);

  const shakeX = useSharedValue(0);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPin("");
      setError(null);
    }
  }, [isOpen]);

  const handleKeyPress = (input: NumpadInput) => {
    setError(null);
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) setPin((prev) => prev + input);
    } else {
      if (input === "backspace") setPin((prev) => prev.slice(0, -1));
      if (input === "clear") setPin("");
    }
  };

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 })
    );
  };

  const handleSwitchUser = async () => {
    if (pin.length !== MAX_PIN_LENGTH) {
      setError(`PIN must be ${MAX_PIN_LENGTH} digits`);
      return;
    }
    if (!selectedStore || !deviceId) {
      setError("Store or device not configured");
      return;
    }

    showLoading("Switching account...");

    try {
      const result = await timeClock.signIn(pin, selectedStore.id, deviceId);

      if (result?.staff_id) {
        const employee = getEmployeeByStaffId(result.staff_id);
        if (employee) {
          const existingSession = getSession(employee.id);
          if (!existingSession) {
            employeeClockIn(employee.id);
            timeclockClockIn(employee.id);
          }
          setActiveSession(employee);
          hideLoading();
          setPin("");
          setError(null);
          onClose();
          return;
        }
      }

      hideLoading();
      triggerShake();
      setError("Incorrect PIN. Please try again.");
      setPin("");
    } catch {
      hideLoading();
      triggerShake();
      setError("Incorrect PIN. Please try again.");
      setPin("");
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 overflow-hidden" style={{ borderRadius: 14 }}>
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              backgroundColor: colors.screen,
              paddingVertical: 14,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "40",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UserRound size={14} color={colors.teal} />
            </View>
            <DialogTitle>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>
                Switch Account
              </Text>
            </DialogTitle>
          </View>

          {/* Body */}
          <Animated.View style={[shakeStyle, { padding: 20 }]}>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginBottom: 14 }}>
              Enter your PIN to switch
            </Text>

            <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

            <View style={{ marginTop: 10 }}>
              <PinNumpad onKeyPress={handleKeyPress} />
            </View>

            {/* Error */}
            <View style={{ height: 20, marginTop: 8, alignItems: "center", justifyContent: "center" }}>
              {error && (
                <Text style={{ fontSize: 11, color: colors.danger, textAlign: "center" }}>
                  {error}
                </Text>
              )}
            </View>

            {/* Forgot PIN */}
            <TouchableOpacity style={{ alignSelf: "flex-end", marginBottom: 14 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>
                Forgot PIN?
              </Text>
            </TouchableOpacity>

            {/* Actions */}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 14,
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  backgroundColor: colors.screen,
                }}
              >
                <Clock size={13} color={colors.label} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
                  Timeclock
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSwitchUser}
                disabled={pin.length < MAX_PIN_LENGTH}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  backgroundColor: pin.length === MAX_PIN_LENGTH ? colors.teal : colors.teal + "30",
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: pin.length === MAX_PIN_LENGTH ? colors.onSolid : colors.muted,
                  }}
                >
                  Enter
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchAccountModal;
