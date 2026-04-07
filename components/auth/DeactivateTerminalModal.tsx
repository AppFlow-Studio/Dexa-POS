import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useTimeClock } from "@/hooks/useTimeclock";
import { useSessionKick } from "@/contexts/SessionKickListenerProvider";
import { getDeviceId } from "@/lib/deviceId";
import { toastService } from "@/lib/toastService";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { clearLocationData } from "@/services/cacheService";
import { PosStaffLogoutResponse } from "@/types/station";
import { replaceRoute } from "@/lib/rootNavigation";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import PinDisplay from "./PinDisplay";
import PinNumpad from "./PinNumpad";

const MAX_PIN_LENGTH = 4;
const MANAGER_ROLES = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
  "merchant.shift_manager",
];

interface DeactivateTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DeactivateTerminalModal = ({
  isOpen,
  onClose,
}: DeactivateTerminalModalProps) => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const timeClock = useTimeClock();

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearStationSession = useStoreSettingsStore(
    (s) => s.clearStationSession
  );
  const { findEmployeeByPin, getEmployeeByStaffId } = useEmployeeStore();
  const { markVoluntaryLogout } = useSessionKick();

  const shakeX = useSharedValue(0);

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 })
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleClose = () => {
    setPin("");
    setError(null);
    onClose();
  };

  const handleKeyPress = (input: number | "backspace" | "clear") => {
    setError(null);
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prev) => prev + input.toString());
      }
    } else if (input === "backspace") {
      setPin((prev) => prev.slice(0, -1));
    } else if (input === "clear") {
      setPin("");
    }
  };

  const handleSubmit = async () => {
    if (pin.length !== MAX_PIN_LENGTH || !selectedStore) return;

    setIsLoading(true);
    setError(null);

    try {
      const deviceId = getDeviceId();
      let employee: EmployeeProfile | null = null;

      // Verify PIN via server
      const result = await timeClock.signIn(pin, selectedStore.id, deviceId);

      if (result?.staff_id) {
        employee = getEmployeeByStaffId(result.staff_id) || null;
      } else if (result?.queued) {
        employee = findEmployeeByPin(pin);
      }

      if (!employee) {
        triggerShake();
        setError("Invalid PIN. Please try again.");
        setPin("");
        setIsLoading(false);
        return;
      }

      // Check manager-level role
      if (!MANAGER_ROLES.includes(employee.role)) {
        triggerShake();
        setError("Only managers can deactivate the terminal.");
        setPin("");
        setIsLoading(false);
        return;
      }

      // Suppress kicked-out modal since this is a voluntary logout
      markVoluntaryLogout();

      // End station session on server
      if (stationSessionId) {
        try {
          const { data, error: rpcError } = await supabase.rpc(
            "pos_staff_logout",
            {
              p_session_id: stationSessionId,
              p_location_id: selectedStore.id,
              p_pin_code: pin,
              p_device_id: deviceId,
              p_clock_out: false,
            }
          );

          if (rpcError) {
            console.error("Error ending station session:", rpcError);
          }
        } catch (err) {
          console.error("Error calling pos_staff_logout:", err);
        }
      }

      // Clear local state and all location-specific data
      clearStationSession();
      clearLocationData();

      toastService.show({
        title: "Terminal Deactivated",
        message: "Station session has been ended.",
        type: "success",
      });

      onClose();
      replaceRoute('(auth)', 'station-select');
    } catch (err: any) {
      triggerShake();
      setError(
        err?.message?.includes("PIN") || err?.message?.includes("pin")
          ? "Invalid PIN. Please try again."
          : "Verification failed. Please try again."
      );
      setPin("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-fit h-fit bg-panel border-gray-600 p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold text-white">
            Deactivate Terminal
          </DialogTitle>
        </DialogHeader>
        <Animated.View style={shakeStyle} className="py-4">
          <Text className="text-center text-lg text-gray-300 mb-4">
            Enter a manager PIN to deactivate this terminal
          </Text>

          <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

          <PinNumpad onKeyPress={handleKeyPress} />

          {error && (
            <Text className="text-red-400 text-center mt-3">{error}</Text>
          )}

          <View className="flex-row gap-3 mt-4">
            <TouchableOpacity
              onPress={handleClose}
              className="flex-1 py-3 bg-gray-600 rounded-lg"
            >
              <Text className="text-center text-lg font-bold text-white">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={pin.length !== MAX_PIN_LENGTH || isLoading}
              className={`flex-1 py-3 bg-red-600 rounded-lg ${
                (pin.length !== MAX_PIN_LENGTH || isLoading) && "opacity-50"
              }`}
            >
              <Text className="text-center text-lg font-bold text-white">
                {isLoading ? "Verifying..." : "Deactivate"}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </DialogContent>
    </Dialog>
  );
};

export default DeactivateTerminalModal;
