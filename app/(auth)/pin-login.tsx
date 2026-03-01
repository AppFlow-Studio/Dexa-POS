import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { useTimeClock } from "@/hooks/useTimeclock";
import { getDeviceId } from "@/lib/deviceId";
import { getDeviceName } from "@/lib/deviceName";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { MerchantRole } from "@/lib/types";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { PosStaffLoginResponse } from "@/types/station";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Network from "expo-network";
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
// Helper function to validate and clean IP address
const sanitizeIpAddress = (ip: string | null | undefined): string | null => {
  if (!ip || ip.trim() === '') return null;
  
  // Basic IPv4 validation (optional but good practice)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  const trimmed = ip.trim();
  if (ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed)) {
    return trimmed;
  }
  
  return null; // Invalid format, send null instead of crashing DB
};

const getDeviceInfo = async () => {
  const ip = await Network.getIpAddressAsync().catch(() => null);
  return {
    ip_address: ip !== '' ? ip : null,
    app_version: Application.nativeApplicationVersion,
    os_version: `${Device.osName} ${Device.osVersion}`,
    hardware_model: Device.modelName,
  };
};

const PinLoginScreen = () => {
  const router = useRouter();
  const { forceTakeover } = useLocalSearchParams<{ forceTakeover?: string }>();
  const [pin, setPin] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [cachedDeviceInfo, setCachedDeviceInfo] = useState<Awaited<
    ReturnType<typeof getDeviceInfo>
  > | null>(null);
  const supabase = useSupabaseClient();

  // Clear PIN when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setPin("");
    }, []),
  );

  const { showLoading, hideLoading, isLoading } = useLoading();
  const {
    findEmployeeByPin,
    getEmployeeByStaffId,
    setActiveSession,
    setEmployees,
    clockIn: employeeClockIn,
    employees,
  } = useEmployeeStore();

  // console.log("employees", employees);

  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const selectedStation = useStoreSettingsStore(
    (state) => state.selectedStation,
  );
  const setStationSessionId = useStoreSettingsStore(
    (state) => state.setStationSessionId,
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
    [pin, isLoading, deviceId, selectedStore, selectedStation],
  );

  // Get device ID on mount (synchronous with MMKV)
  useEffect(() => {
    console.log("getDeviceId", getDeviceId());
    setDeviceId(getDeviceId());
  }, []);

  // Eagerly cache device info (IP lookup) in background while user enters PIN
  useEffect(() => {
    getDeviceInfo().then(setCachedDeviceInfo);
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
    showTakeover?: boolean;
    currentUser?: string;
  }>({ visible: false, title: "", message: "", variant: "success" });
  const showDialog = (
    title: string,
    message: string,
    variant: "success" | "warning" | "error",
    options?: { showTakeover?: boolean; currentUser?: string },
  ) => setDialog({ visible: true, title, message, variant, ...options });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  // Store PIN temporarily for takeover action
  const [pendingTakeoverPin, setPendingTakeoverPin] = useState<string | null>(
    null,
  );

  const triggerShakeAnimation = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 }),
    );
  };

  // Handle takeover when user confirms
  const handleTakeover = async () => {
    if (!pendingTakeoverPin || !selectedStore || !selectedStation) {
      hideDialog();
      return;
    }

    hideDialog();
    showLoading("Taking over station...");

    try {
      const deviceName = getDeviceName();
      const info = cachedDeviceInfo ?? await getDeviceInfo();

      console.log("Calling pos_staff_login for TAKEOVER with:", {
        p_location_id: selectedStore.id,
        p_pin_code: pendingTakeoverPin,
        p_station_id: selectedStation.id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_auto_clock_in: true,
        p_force_takeover: true,
        p_ip_address: info.ip_address,
        p_app_version: info.app_version,
        p_os_version: info.os_version,
        p_hardware_model: info.hardware_model,
      });

      // Call the login RPC with force takeover enabled
      const { data, error } = await supabase.rpc("pos_staff_login_v2", {
        p_location_id: selectedStore.id,
        p_pin_code: pendingTakeoverPin,
        p_station_id: selectedStation.id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_auto_clock_in: true,
        p_force_takeover: true, // Force takeover!
        p_ip_address: info.ip_address,
        p_app_version: info.app_version,
        p_os_version: info.os_version,
        p_hardware_model: info.hardware_model,
      });

      console.log("Takeover response:", data, error);

      if (error) throw error;

      const response = data as PosStaffLoginResponse;

      if (!response.success) {
        hideLoading();
        triggerShakeAnimation();
        showDialog(
          "Takeover Failed",
          response.error || "Unable to take over station.",
          "error",
        );
        setPendingTakeoverPin(null);
        return;
      }

      // Store session ID for later logout
      if (response.session?.session_id) {
        setStationSessionId(response.session.session_id);
      }

      // Send broadcast kick notification to the kicked device
      // This is Layer 1 of the kick system - instant, no RLS dependency
      if (response.session?.kicked_previous && response.session?.kicked_device_id) {
        const kickedDeviceId = response.session.kicked_device_id;
        console.log(`[Takeover] Broadcasting kick to device: ${kickedDeviceId}`);
        try {
          const kickChannel = supabase.channel(`station-kick:${kickedDeviceId}`);
          await kickChannel.send({
            type: "broadcast",
            event: "kick",
            payload: {
              device_id: kickedDeviceId,
              session_id: response.session.session_id,
              kicked_by: response.staff?.display_name || "Unknown",
              reason: "Taken over",
              station_id: selectedStation.id,
            },
          });
          // Clean up the temporary channel after sending
          supabase.removeChannel(kickChannel);
          console.log("[Takeover] Broadcast kick sent successfully");
        } catch (broadcastErr) {
          // Non-critical - other kick layers will catch it
          console.warn("[Takeover] Broadcast kick failed (non-critical):", broadcastErr);
        }
      }

      let employee: EmployeeProfile | null = null;

      // Get employee from local store using staff profile ID
      if (response.staff?.staff_profile_id) {
        employee =
          getEmployeeByStaffId(response.staff.staff_profile_id) || null;
      }

      // If not found locally, re-sync employees and retry
      if (!employee && response.staff?.staff_profile_id && selectedStore?.id) {
        console.log("Employee not found locally (takeover), re-syncing...");
        const { data } = await supabase
          .from("location_members")
          .select(`
            id, pin_code, role_code, staff_profile_id,
            staff_profiles (id, first_name, last_name, display_name, avatar_url, email, phone)
          `)
          .eq("location_id", selectedStore.id)
          .eq("is_active", true);

        if (data?.length) {
          const mappedEmployees: EmployeeProfile[] = data.map((row: any) => {
            const profile = row.staff_profiles;
            const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
            return {
              id: row.id,
              profileId: profile?.id || "",
              fullName: fullName || "Unknown Staff",
              displayName: profile?.display_name || fullName || "Unknown",
              role: row.role_code as MerchantRole,
              profilePictureUrl: profile?.avatar_url || undefined,
              pinHash: row.pin_code,
              email: profile?.email,
              phone: profile?.phone,
              shiftStatus: "clocked_out" as const,
            };
          });
          setEmployees(mappedEmployees);
          employee = mappedEmployees.find(
            (e) => e.profileId === response.staff?.staff_profile_id
          ) || null;
        }
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
      setPendingTakeoverPin(null);
      const isKDS = selectedStation?.station_type === "kds";
      router.replace(isKDS ? "/kds" : "/home");
    } catch (error: any) {
      console.error("Takeover error details:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        fullError: error,
      });
      hideLoading();
      triggerShakeAnimation();
      showDialog(
        "Takeover Failed",
        error?.message || "Unable to take over station. Please try again.",
        "error",
      );
      setPendingTakeoverPin(null);
    }
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
        "error",
      );
      return;
    }

    showLoading("Signing in...");

    try {
      const deviceName = getDeviceName();
      const info = cachedDeviceInfo ?? await getDeviceInfo();

      // Call the new combined RPC for station + clock in
      console.log("Calling pos_staff_login with:", {
        p_location_id: selectedStore.id,
        p_pin_code: pin,
        p_station_id: selectedStation.id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_auto_clock_in: true,
        p_force_takeover: forceTakeover === "true",
        p_ip_address: sanitizeIpAddress(info.ip_address),
        p_app_version: info.app_version,
        p_os_version: info.os_version,
        p_hardware_model: info.hardware_model,
      });
      if (navigator.onLine) {
        console.log('Internet connection is available');
      } else {
        console.log('Internet connection is not available');
      }
      const { data, error } = await supabase.rpc("pos_staff_login_v2", {
        p_location_id: selectedStore.id,
        p_pin_code: pin,
        p_station_id: selectedStation.id,
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_auto_clock_in: true,
        p_force_takeover: forceTakeover === "true",
        p_ip_address: sanitizeIpAddress(info.ip_address),
        p_app_version: info.app_version,
        p_os_version: info.os_version,
        p_hardware_model: info.hardware_model,
      });

      console.log("pos_staff_login response:", data, error);

      if (error) throw error;

      const response = data as PosStaffLoginResponse;

      if (!response.success) {
        hideLoading();

        if (response.error_code === "STATION_IN_USE") {
          // Store the PIN for potential takeover
          setPendingTakeoverPin(pin);
          showDialog(
            "Take Over Station?",
            response.current_session
              ? `Station is being used by ${response.current_session.staff_name}. Taking over uses your PIN to end their session.`
              : "Station is in use. Taking over uses your PIN to end the session.",
            "warning",
            {
              showTakeover: true,
              currentUser: response.current_session?.staff_name,
            },
          );
          setPin("");
          return;
        }

        triggerShakeAnimation();
        showDialog(
          "Sign In Failed",
          response.error || "Unable to sign in.",
          "error",
        );
        setPin("");
        return;
      }

      // Store session ID for later logout
      if (response.session?.session_id) {
        console.log(
          "📝 Setting stationSessionId:",
          response.session.session_id,
        );
        setStationSessionId(response.session.session_id);
      }

      // Send broadcast kick notification to the kicked device (Layer 1)
      if (response.session?.kicked_previous && response.session?.kicked_device_id) {
        const kickedDeviceId = response.session.kicked_device_id;
        console.log(`[Login] Broadcasting kick to device: ${kickedDeviceId}`);
        try {
          const kickChannel = supabase.channel(`station-kick:${kickedDeviceId}`);
          await kickChannel.send({
            type: "broadcast",
            event: "kick",
            payload: {
              device_id: kickedDeviceId,
              session_id: response.session.session_id,
              kicked_by: response.staff?.display_name || "Unknown",
              reason: "Taken over",
              station_id: selectedStation.id,
            },
          });
          supabase.removeChannel(kickChannel);
          console.log("[Login] Broadcast kick sent successfully");
        } catch (broadcastErr) {
          console.warn("[Login] Broadcast kick failed (non-critical):", broadcastErr);
        }
      }

      let employee: EmployeeProfile | null = null;

      // Get employee from local store using staff profile ID
      if (response.staff?.staff_profile_id) {
        employee =
          getEmployeeByStaffId(response.staff.staff_profile_id) || null;
      }

      // If not found locally, re-sync employees and retry
      if (!employee && response.staff?.staff_profile_id && selectedStore?.id) {
        console.log("Employee not found locally, re-syncing...");
        const { data } = await supabase
          .from("location_members")
          .select(`
            id, pin_code, role_code, staff_profile_id,
            staff_profiles (id, first_name, last_name, display_name, avatar_url, email, phone)
          `)
          .eq("location_id", selectedStore.id)
          .eq("is_active", true);

        if (data?.length) {
          const mappedEmployees: EmployeeProfile[] = data.map((row: any) => {
            const profile = row.staff_profiles;
            const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
            return {
              id: row.id,
              profileId: profile?.id || "",
              fullName: fullName || "Unknown Staff",
              displayName: profile?.display_name || fullName || "Unknown",
              role: row.role_code as MerchantRole,
              profilePictureUrl: profile?.avatar_url || undefined,
              pinHash: row.pin_code,
              email: profile?.email,
              phone: profile?.phone,
              shiftStatus: "clocked_out" as const,
            };
          });
          setEmployees(mappedEmployees);
          employee = mappedEmployees.find(
            (e) => e.profileId === response.staff?.staff_profile_id
          ) || null;
        }
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
          response.staff?.staff_profile_id,
        );
      }

      setPin("");
      const isKDS = selectedStation?.station_type === "kds";
      router.replace(isKDS ? "/kds" : "/home");
    } catch (error: any) {
      console.error("Login error details:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        fullError: error,
      });
      hideLoading();
      triggerShakeAnimation();
      const errorMessage =
        error?.message?.includes("PIN") || error?.message?.includes("pin")
          ? "The PIN you entered is incorrect."
          : error?.message || "Unable to sign in. Please try again.";
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
        "error",
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
        "error",
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
        "error",
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
          "error",
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
          "error",
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
        <Text className="text-3xl font-semibold text-white text-center mb-2">
          Enter Your PIN
        </Text>
        {selectedStation && selectedStore && (
          <Text className="text-base text-gray-400 text-center mb-6">
            {selectedStation.station_name} | {selectedStore.name}
          </Text>
        )}
        {(!selectedStation || !selectedStore) && <View className="mb-6" />}

        <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

        <View className="w-full mt-4">
          <PinNumpad onKeyPress={handleKeyPress} />
        </View>

        <View className="flex-row gap-4 mt-6 items-stretch">
          <TouchableOpacity
            onPress={handleLogin}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-card border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-blue-400 text-xl font-bold">SIGN IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockIn}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-card border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-green-400 text-xl font-bold">CLOCK IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockOut}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-card border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-red-400 text-xl font-bold">CLOCK OUT</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleOpenTimeclock}
          className="self-center mt-6 p-4 bg-card border border-gray-700 rounded-xl items-center justify-center flex-row"
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
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor:
                dialog.variant === "success"
                  ? colors.success
                  : dialog.variant === "warning"
                    ? colors.warning
                    : colors.danger,
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

            {dialog.showTakeover ? (
              // Takeover scenario - show Take Over and Cancel buttons
              <View className="flex-row justify-end gap-3">
                <TouchableOpacity
                  onPress={() => {
                    hideDialog();
                    setPendingTakeoverPin(null);
                  }}
                  className="px-5 py-2.5 rounded-lg bg-gray-600"
                >
                  <Text className="text-white text-lg font-medium">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleTakeover}
                  className="px-5 py-2.5 rounded-lg bg-amber-600"
                >
                  <Text className="text-white text-lg font-medium">
                    Take Over
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Normal dialog - just OK button
              <TouchableOpacity
                onPress={hideDialog}
                className="self-end px-5 py-2.5 rounded-lg"
                style={{
                  backgroundColor:
                    dialog.variant === "success"
                      ? "#065F46"
                      : dialog.variant === "warning"
                        ? "#92400E"
                        : colors.danger,
                }}
              >
                <Text className="text-white text-lg font-medium">OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PinLoginScreen;
