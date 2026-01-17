import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useTimeClock } from "@/hooks/useTimeclock";
import { getDeviceId } from "@/lib/deviceId";
import { getDeviceName } from "@/lib/deviceName";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { PosStaffLoginResponse } from "@/types/station";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const MAX_PIN_LENGTH = 4;

const PinLoginScreen = () => {
  const router = useRouter();
  const { forceTakeover } = useLocalSearchParams<{ forceTakeover?: string }>();
  const [pin, setPin] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const supabase = useSupabaseClient();

  // Clear PIN when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setPin("");
    }, [])
  );

  const { showLoading, hideLoading, isLoading } = useLoading();
  const {
    findEmployeeByPin,
    getEmployeeByStaffId,
    setActiveSession,
    clockIn: employeeClockIn,
    employees,
  } = useEmployeeStore();

  // console.log("employees", employees);

  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const selectedStation = useStoreSettingsStore(
    (state) => state.selectedStation
  );
  const setStationSessionId = useStoreSettingsStore(
    (state) => state.setStationSessionId
  );
  const { getSession, clockIn: timeclockClockIn } = useTimeclockStore();

  const timeClock = useTimeClock();

  const canSubmit = useMemo(
    () =>
      pin.length === MAX_PIN_LENGTH &&
      !isLoading &&
      !!deviceId &&
      !!selectedStore &&
      !!selectedStation,
    [pin, isLoading, deviceId, selectedStore, selectedStation]
  );

  // Get device ID on mount (synchronous with MMKV)
  useEffect(() => {
    console.log("getDeviceId", getDeviceId());
    setDeviceId(getDeviceId());
  }, []);

  // Redirect to station select if no station is selected
  useEffect(() => {
    if (!selectedStation && selectedStore) {
      router.replace("/station-select");
    }
  }, [selectedStation, selectedStore, router]);

  // Animation values for shake effect
  const shakeX = useSharedValue(0);

  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    variant: "success" | "warning" | "error";
  }>({ visible: false, title: "", message: "", variant: "success" });
  const showDialog = (
    title: string,
    message: string,
    variant: "success" | "warning" | "error"
  ) => setDialog({ visible: true, title, message, variant });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const triggerShakeAnimation = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 })
    );
  };

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prevPin) => prevPin + input.toString());
      }
    } else {
      switch (input) {
        case "backspace":
          setPin((prevPin) => prevPin.slice(0, -1));
          break;
        case "clear":
          setPin("");
          break;
      }
    }
  };

  const handleLogin = async () => {
    if (!canSubmit || !selectedStore || !selectedStation) {
      showDialog(
        !selectedStore
          ? "No Store Selected"
          : !selectedStation
            ? "No Station Selected"
            : "Invalid PIN",
        !selectedStore
          ? "Please select a store first."
          : !selectedStation
            ? "Please select a station first."
            : `Please enter a ${MAX_PIN_LENGTH}-digit PIN to sign in.`,
        "error"
      );
      return;
    }

    showLoading("Signing in...");

    try {
      const deviceName = getDeviceName();

      // Call the new combined RPC for station + clock in
      console.log("Calling pos_staff_login with:", {
        p_location_id: selectedStore.id,
        p_pin_code: pin,
        p_station_id: selectedStation.id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_auto_clock_in: true,
        p_force_takeover: forceTakeover === "true",
      });
      const { data, error } = await supabase.rpc("pos_staff_login", {
        p_location_id: selectedStore.id,
        p_pin_code: pin,
        p_station_id: selectedStation.id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_auto_clock_in: true,
        p_force_takeover: forceTakeover === "true",
      });

      console.log("pos_staff_login response:", data, error);

      if (error) throw error;

      const response = data as PosStaffLoginResponse;

      if (!response.success) {
        hideLoading();

        if (response.error_code === "STATION_IN_USE") {
          showDialog(
            "Station In Use",
            response.current_session
              ? `This station is currently being used by ${response.current_session.staff_name}. Please select a different station or use the Take Over option.`
              : "This station is currently in use.",
            "warning"
          );
          setPin("");
          return;
        }

        triggerShakeAnimation();
        showDialog(
          "Sign In Failed",
          response.error || "Unable to sign in.",
          "error"
        );
        setPin("");
        return;
      }

      // Store session ID for later logout
      if (response.session?.session_id) {
        setStationSessionId(response.session.session_id);
      }

      let employee: EmployeeProfile | null = null;

      // Get employee from local store using staff profile ID
      if (response.staff?.staff_profile_id) {
        employee =
          getEmployeeByStaffId(response.staff.staff_profile_id) || null;
      }

      if (employee) {
        // Sync local session state
        const existingSession = getSession(employee.id);
        if (!existingSession) {
          employeeClockIn(employee.id);
          timeclockClockIn(employee.id);
        }
        setActiveSession(employee);
      }

      hideLoading();

      if (!employee) {
        // Staff found in database but not synced locally - still allow login
        console.warn(
          "Staff profile not found locally:",
          response.staff?.staff_profile_id
        );
      }

      setPin("");
      router.replace("/home");
    } catch (error: any) {
      hideLoading();
      triggerShakeAnimation();
      const errorMessage =
        error?.message?.includes("PIN") || error?.message?.includes("pin")
          ? "The PIN you entered is incorrect."
          : "Unable to sign in. Please try again.";
      showDialog("Sign In Failed", errorMessage, "error");
      setPin("");
    }
  };

  const handleClockIn = async () => {
    if (!canSubmit || !selectedStore) {
      showDialog(
        !selectedStore ? "No Store Selected" : "Invalid PIN",
        !selectedStore
          ? "Please select a store first."
          : `Please enter a ${MAX_PIN_LENGTH}-digit PIN.`,
        "error"
      );
      return;
    }

    showLoading("Clocking in...");

    try {
      // Use server for clock in (handles both online and offline via the hook)
      await timeClock.clockIn(pin, selectedStore.id, deviceId);
      // Success toast is handled by the hook
      hideLoading();
      setPin("");
    } catch (error: any) {
      hideLoading();
      // Toast notification is already shown by the useTimeClock hook
      // Just shake and clear PIN for visual feedback
      triggerShakeAnimation();
      setPin("");
    }
  };

  const handleClockOut = async () => {
    if (!canSubmit || !selectedStore) {
      showDialog(
        !selectedStore ? "No Store Selected" : "Invalid PIN",
        !selectedStore
          ? "Please select a store first."
          : `Please enter a ${MAX_PIN_LENGTH}-digit PIN.`,
        "error"
      );
      return;
    }

    showLoading("Clocking out...");

    try {
      // Use server for clock out (handles both online and offline via the hook)
      await timeClock.clockOut(pin, selectedStore.id, deviceId);
      // Success toast is handled by the hook
      hideLoading();
      setPin("");
    } catch (error: any) {
      hideLoading();
      // Toast notification is already shown by the useTimeClock hook
      // Just shake and clear PIN for visual feedback
      triggerShakeAnimation();
      setPin("");
    }
  };

  const handleOpenTimeclock = async () => {
    if (!canSubmit || !selectedStore) {
      showDialog(
        !selectedStore ? "No Store Selected" : "Invalid PIN",
        !selectedStore
          ? "Please select a store first."
          : `Please enter a ${MAX_PIN_LENGTH}-digit PIN to open the timeclock.`,
        "error"
      );
      return;
    }

    showLoading("Verifying...");

    try {
      let employee: EmployeeProfile | null = null;

      // Try server-side verification first (works online, queues offline)
      const result = await timeClock.signIn(pin, selectedStore.id, deviceId);

      if (result?.staff_id) {
        // Server returned employee ID - get local employee record
        employee = getEmployeeByStaffId(result.staff_id) || null;
      } else if (result?.queued) {
        // Request was queued (offline) - verify locally
        employee = await findEmployeeByPin(pin);
      }

      hideLoading();

      if (!employee) {
        triggerShakeAnimation();
        showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
        setPin("");
        return;
      }

      // Check for manager-level roles
      const managerRoles = ["merchant.manager", "merchant.admin", "merchant.owner","merchant.shift_manager"];
      if (!managerRoles.includes(employee.role)) {
        showDialog(
          "Permission Denied",
          "Only managers can access the timeclock.",
          "error"
        );
        setPin("");
        return;
      }

      setPin("");
      router.push("/timeclock");
    } catch (error: any) {
      hideLoading();
      const isHandledError =
        error?.message?.includes("PIN") || error?.message?.includes("pin");

      if (!isHandledError) {
        triggerShakeAnimation();
        showDialog(
          "Verification Failed",
          "Unable to verify PIN. Please try again.",
          "error"
        );
      }
      setPin("");
    }
  };

  // Animated style for shake effect
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeX.value }],
    };
  });

  return (
    <>
      <Animated.View style={shakeStyle} className="w-full m-auto">
        <Text className="text-3xl font-semibold text-white text-center mb-8">
          Enter Your PIN
        </Text>

        <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

        <View className="w-full mt-4">
          <PinNumpad onKeyPress={handleKeyPress} />
        </View>

        <View className="flex-row gap-4 mt-6 items-stretch">
          <TouchableOpacity
            onPress={handleLogin}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-blue-400 text-xl font-bold">SIGN IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockIn}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-green-400 text-xl font-bold">CLOCK IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockOut}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-red-400 text-xl font-bold">CLOCK OUT</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleOpenTimeclock}
          className="self-center mt-6 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center flex-row"
        >
          <Text className="text-lg font-semibold text-white mr-2">
            Open Timeclock
          </Text>
          <Lock color="white" size={20} />
        </TouchableOpacity>
      </Animated.View>

      <Dialog open={dialog.visible} onOpenChange={hideDialog}>
        <DialogContent className="min-w-xl w-[500px] ">
          <View
            className="min-w-xl w-full rounded-2xl p-6"
            style={{
              backgroundColor: "#2b2b2b",
              borderWidth: 1,
              borderColor:
                dialog.variant === "success"
                  ? "#059669"
                  : dialog.variant === "warning"
                    ? "#F59E0B"
                    : "#EF4444",
            }}
          >
            <Text
              className={`text-2xl font-semibold mb-2 ${
                dialog.variant === "success"
                  ? "text-green-400"
                  : dialog.variant === "warning"
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {dialog.title}
            </Text>
            <Text className="text-xl text-gray-200 mb-6">{dialog.message}</Text>
            <TouchableOpacity
              onPress={hideDialog}
              className="self-end px-5 py-2.5 rounded-lg"
              style={{
                backgroundColor:
                  dialog.variant === "success"
                    ? "#065F46"
                    : dialog.variant === "warning"
                      ? "#92400E"
                      : "#7F1D1D",
              }}
            >
              <Text className="text-white text-lg font-medium">OK</Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PinLoginScreen;
