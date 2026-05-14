import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import CashTipDeclarationModal from "@/components/timeclock/CashTipDeclarationModal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
    getDeviceInfo,
    sanitizeIpAddress,
    sendKickBroadcast,
    usePinSignIn,
} from "@/hooks/usePinSignIn";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useTimeClock } from "@/hooks/useTimeclock";
import {
    getPinAuthFailure,
    getPinPromptLabel,
    resolvePostLoginRoute,
} from "@/lib/authFlow";
import { getDeviceId } from "@/lib/deviceId";
import { getDeviceName } from "@/lib/deviceName";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { MerchantRole } from "@/lib/types";
import {
    EmployeeProfile,
    STATION_IN_USE_AUTH_ERROR,
    useEmployeeStore,
} from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { PosStaffLoginResponse } from "@/types/station";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [showCashDeclaration, setShowCashDeclaration] = useState(false);
  const pendingClockOutPinRef = useRef<string | null>(null);
  const [clockOutEmployee, setClockOutEmployee] = useState<{
    name: string;
    profileId: string;
    shiftId: string;
    clockInTime: Date;
  } | null>(null);
  const [cachedDeviceInfo, setCachedDeviceInfo] = useState<Awaited<
    ReturnType<typeof getDeviceInfo>
  > | null>(null);
  const supabase = useSupabaseClient();

  // Clear PIN when screen comes into focus; also handle rollback feedback from background RPC
  useFocusEffect(
    useCallback(() => {
      setPin("");
      const err = useEmployeeStore.getState().pendingAuthError;
      if (err) {
        if (err === STATION_IN_USE_AUTH_ERROR) {
          showDialog(
            "Take Over Station?",
            "Another employee is signed in on this station. Enter your PIN again to take over.",
            "warning",
            { showTakeover: false },
          );
        } else {
          triggerShakeAnimation();
          showDialog("Sign In Failed", err, "error");
        }
        useEmployeeStore.getState().setPendingAuthError(null);
      }
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
  const {
    getSession,
    clockIn: timeclockClockIn,
    queueAction,
    currentStaffId,
    employeeName: tcEmployeeName,
    sessions,
    activeEmployeeId,
  } = useTimeclockStore();
  const { isOnline, rawIsOnline } = useNetworkStatus();

  const timeClock = useTimeClock();
  const { performOptimisticSignIn } = usePinSignIn();

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
      const info = cachedDeviceInfo ?? (await getDeviceInfo());

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

      // Send broadcast kick notification to the kicked device (Layer 1)
      if (
        response.session?.kicked_previous &&
        response.session?.kicked_device_id
      ) {
        await sendKickBroadcast(supabase, response.session.kicked_device_id, {
          session_id: response.session.session_id,
          kicked_by: response.staff?.display_name || "Unknown",
          station_id: selectedStation.id,
          source_device_id: deviceId,
          target_session_id: response.session.kicked_session_id,
        });
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
          .select(
            `
            id, pin_code, pin_plain, role_code, staff_profile_id,
            staff_profiles (id, first_name, last_name, display_name, avatar_url, email, phone)
          `,
          )
          .eq("location_id", selectedStore.id)
          .eq("is_active", true);

        if (data?.length) {
          const mappedEmployees: EmployeeProfile[] = data.map((row: any) => {
            const profile = row.staff_profiles;
            const fullName =
              `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
            return {
              id: row.id,
              profileId: profile?.id || "",
              fullName: fullName || "Unknown Staff",
              displayName: profile?.display_name || fullName || "Unknown",
              role: row.role_code as MerchantRole,
              profilePictureUrl: profile?.avatar_url || undefined,
              pin: row.pin_plain ?? null,
              email: profile?.email,
              phone: profile?.phone,
              shiftStatus: "clocked_out" as const,
            };
          });
          setEmployees(mappedEmployees);
          employee =
            mappedEmployees.find(
              (e) => e.profileId === response.staff?.staff_profile_id,
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
      replaceRoute("(main)", isKDS ? "kds" : "home");
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

    // ── FAST PATH: optimistic sign-in (works online AND offline, cache hit) ──
    const result = await performOptimisticSignIn({
      pin,
      selectedStore,
      selectedStation,
      deviceId,
      cachedDeviceInfo,
      forceTakeover: forceTakeover === "true",
      isOnline,
    });

    if (result.outcome === "navigating") {
      setPin("");
      return;
    }

    // ── CACHE MISS: employees not loaded (first startup / empty cache) ────────
    if (result.outcome === "cache_miss") {
      if (!isOnline) {
        const authFailure = getPinAuthFailure({ offline: true });
        triggerShakeAnimation();
        showDialog(authFailure.title, authFailure.message, "error");
        setPin("");
        return;
      }
      // Fall through to blocking online flow below
    }

    if (result.outcome === "server_validation_required") {
      // Fall through to blocking online flow below
    }

    // ── BLOCKING ONLINE FLOW (cache miss + online) ────────────────────────────
    showLoading("Signing in...");

    try {
      const deviceName = getDeviceName();
      const info = cachedDeviceInfo ?? (await getDeviceInfo());

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

      if (error) throw error;

      const response = data as PosStaffLoginResponse;

      if (!response.success) {
        hideLoading();

        if (response.error_code === "STATION_IN_USE") {
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

        const authFailure = getPinAuthFailure({
          error: response.error,
          errorCode: response.error_code,
        });
        triggerShakeAnimation();
        showDialog(authFailure.title, authFailure.message, "error");
        setPin("");
        return;
      }

      if (response.session?.session_id) {
        setStationSessionId(response.session.session_id);
      }

      if (
        response.session?.kicked_previous &&
        response.session?.kicked_device_id
      ) {
        await sendKickBroadcast(supabase, response.session.kicked_device_id, {
          session_id: response.session.session_id,
          kicked_by: response.staff?.display_name || "Unknown",
          station_id: selectedStation.id,
          source_device_id: deviceId,
          target_session_id: response.session.kicked_session_id,
        });
      }

      let employee: EmployeeProfile | null = null;

      if (response.staff?.staff_profile_id) {
        employee =
          getEmployeeByStaffId(response.staff.staff_profile_id) || null;
      }

      // If not found locally, re-sync employees and retry
      if (!employee && response.staff?.staff_profile_id && selectedStore?.id) {
        console.log("Employee not found locally, re-syncing...");
        const { data: membersData } = await supabase
          .from("location_members")
          .select(
            `
            id, pin_code, pin_plain, role_code, staff_profile_id,
            staff_profiles (id, first_name, last_name, display_name, avatar_url, email, phone)
          `,
          )
          .eq("location_id", selectedStore.id)
          .eq("is_active", true);

        if (membersData?.length) {
          const mappedEmployees: EmployeeProfile[] = membersData.map(
            (row: any) => {
              const profile = row.staff_profiles;
              const fullName =
                `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
              return {
                id: row.id,
                profileId: profile?.id || "",
                fullName: fullName || "Unknown Staff",
                displayName: profile?.display_name || fullName || "Unknown",
                role: row.role_code as MerchantRole,
                profilePictureUrl: profile?.avatar_url || undefined,
                pin: row.pin_plain ?? null,
                email: profile?.email,
                phone: profile?.phone,
                shiftStatus: "clocked_out" as const,
              };
            },
          );
          setEmployees(mappedEmployees);
          employee =
            mappedEmployees.find(
              (e) => e.profileId === response.staff?.staff_profile_id,
            ) || null;
        }
      }

      if (employee) {
        const existingSession = getSession(employee.id);
        if (!existingSession) {
          employeeClockIn(employee.id);
          timeclockClockIn(employee.id);
        }
        setActiveSession(employee);
      }

      hideLoading();
      setPin("");
      replaceRoute(
        "(main)",
        resolvePostLoginRoute(selectedStation?.station_type),
      );
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
      const authFailure = getPinAuthFailure({
        error: error?.message,
        errorCode: error?.code,
      });
      showDialog(authFailure.title, authFailure.message, "error");
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

    try {
      // useTimeClock updates state optimistically; success/error toasts handled by the hook
      await timeClock.clockIn(pin, selectedStore.id, deviceId);
      setPin("");
    } catch {
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

    // Call the actual clock-out RPC first — it validates the PIN and returns
    // the staff_id + shift_id. Then show the declaration modal with correct info.
    // The clock-out completes on the backend, but we still need the declaration.
    const enteredPin = pin;
    setPin("");

    try {
      const result = await timeClock.clockOut(
        enteredPin,
        selectedStore.id,
        deviceId,
      );

      // Offline path: RPC was queued, resolve employee from PIN locally
      if (result?.queued) {
        const allEmployees = useEmployeeStore.getState().employees;
        const offlineEmp = allEmployees.find((e) => e.pin === enteredPin);
        if (!offlineEmp) {
          triggerShakeAnimation();
          return;
        }
        const offlineSession = sessions[offlineEmp.id];
        const offlineClockIn = offlineSession?.clockInTime
          ? new Date(offlineSession.clockInTime)
          : new Date();
        const tcStore = useTimeclockStore.getState();

        setClockOutEmployee({
          name: offlineEmp.fullName || "Employee",
          profileId: offlineEmp.profileId,
          shiftId: tcStore.currentShiftId || "",
          clockInTime: offlineClockIn,
        });
        tcStore.clockOut(offlineEmp.id);
        pendingClockOutPinRef.current = enteredPin;
        setShowCashDeclaration(true);
        return;
      }

      // Online path: extract data from RPC response
      const staffId = result?.staff_id;
      const staffName = result?.employee_name;
      const shiftId = result?.shift_id;

      if (!staffId) {
        triggerShakeAnimation();
        return;
      }

      // Find clock-in time from their shift
      const { employees: allEmps } = useEmployeeStore.getState();
      const emp = allEmps.find((e) => e.profileId === staffId);
      const empSession = emp ? sessions[emp.id] : null;
      let clockInTime = empSession?.clockInTime
        ? new Date(empSession.clockInTime)
        : new Date();

      // Try to get accurate clock-in time from backend
      try {
        const { data: shiftData } = await supabase
          .from("staff_shifts")
          .select("clock_in_time")
          .eq("id", shiftId)
          .single();
        if (shiftData?.clock_in_time) {
          clockInTime = new Date(shiftData.clock_in_time);
        }
      } catch {}

      setClockOutEmployee({
        name: staffName || emp?.fullName || "Employee",
        profileId: staffId,
        shiftId: shiftId || "",
        clockInTime,
      });

      // Update local store
      if (emp) {
        useTimeclockStore.getState().clockOut(emp.id);
      }

      pendingClockOutPinRef.current = enteredPin;
      setShowCashDeclaration(true);
    } catch {
      triggerShakeAnimation();
    }
  };

  const handleClockOutDeclarationComplete = useCallback(
    async (declaredAmount: number) => {
      setShowCashDeclaration(false);
      pendingClockOutPinRef.current = null;
      if (!selectedStore) return;

      // Clock-out already happened in handleClockOut — just declare tips
      const shiftId = clockOutEmployee?.shiftId;
      if (shiftId || clockOutEmployee?.profileId) {
        try {
          await timeClock.declareCashTips(
            shiftId || "",
            declaredAmount,
            selectedStore.id,
            deviceId,
            clockOutEmployee?.profileId,
          );
        } catch (e) {
          console.warn("[PinLogin] Cash tip declaration failed:", e);
        }
      }
      setClockOutEmployee(null);
    },
    [selectedStore, timeClock, deviceId, clockOutEmployee],
  );

  const handleClockOutDeclarationCancel = useCallback(() => {
    setShowCashDeclaration(false);
    pendingClockOutPinRef.current = null;
  }, []);

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
        employee = findEmployeeByPin(pin);
      }

      hideLoading();

      if (!employee) {
        triggerShakeAnimation();
        showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
        setPin("");
        return;
      }

      // Check for manager-level roles
      const managerRoles = [
        "merchant.manager",
        "merchant.admin",
        "merchant.owner",
        "merchant.shift_manager",
      ];
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
      <Animated.View style={[shakeStyle, { width: "100%" }]}>
        {/* Title */}
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: colors.heading,
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          {getPinPromptLabel(MAX_PIN_LENGTH)}
        </Text>

        {/* Station / store subtitle */}
        {selectedStation && selectedStore ? (
          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            {selectedStation.station_name} · {selectedStore.name}
          </Text>
        ) : (
          <View style={{ marginBottom: 16 }} />
        )}

        {!rawIsOnline && (
          <View
            style={{
              alignSelf: "center",
              marginBottom: 12,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: colors.warning + "18",
              borderWidth: 1,
              borderColor: colors.warning + "35",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.warning,
                textAlign: "center",
              }}
            >
              Offline mode: sign-in will sync when connection returns.
            </Text>
          </View>
        )}

        <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

        <View style={{ marginTop: 10 }}>
          <PinNumpad onKeyPress={handleKeyPress} />
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <TouchableOpacity
            onPress={handleLogin}
            disabled={!canSubmit}
            style={{
              flex: 1,
              paddingVertical: 11,
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              borderRadius: 10,
              alignItems: "center",
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "700", color: colors.teal }}
            >
              SIGN IN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockIn}
            disabled={!canSubmit}
            style={{
              flex: 1,
              paddingVertical: 11,
              backgroundColor: colors.success + "15",
              borderWidth: 1,
              borderColor: colors.success + "40",
              borderRadius: 10,
              alignItems: "center",
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "700", color: colors.success }}
            >
              CLOCK IN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockOut}
            disabled={!canSubmit}
            style={{
              flex: 1,
              paddingVertical: 11,
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "40",
              borderRadius: 10,
              alignItems: "center",
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "700", color: colors.danger }}
            >
              CLOCK OUT
            </Text>
          </TouchableOpacity>
        </View>

        {/* Open Timeclock */}
        <TouchableOpacity
          onPress={handleOpenTimeclock}
          style={{
            alignSelf: "center",
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 7,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
          }}
        >
          <Lock size={13} color={colors.label} />
          <Text
            style={{ fontSize: 12, fontWeight: "600", color: colors.label }}
          >
            Open Timeclock
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <Dialog open={dialog.visible} onOpenChange={hideDialog}>
        <DialogContent className="min-w-xl w-[500px]">
          <View
            style={{
              width: "100%",
              borderRadius: 14,
              padding: 20,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor:
                dialog.variant === "success"
                  ? colors.success + "60"
                  : dialog.variant === "warning"
                    ? colors.warning + "60"
                    : colors.danger + "60",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 6,
                color:
                  dialog.variant === "success"
                    ? colors.success
                    : dialog.variant === "warning"
                      ? colors.warning
                      : colors.danger,
              }}
            >
              {dialog.title}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.label,
                marginBottom: 18,
                lineHeight: 19,
              }}
            >
              {dialog.message}
            </Text>

            {dialog.showTakeover ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    hideDialog();
                    setPendingTakeoverPin(null);
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.label,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleTakeover}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: colors.warning + "20",
                    borderWidth: 1,
                    borderColor: colors.warning + "50",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.warning,
                    }}
                  >
                    Take Over
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={hideDialog}
                style={{
                  alignSelf: "flex-end",
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor:
                    dialog.variant === "success"
                      ? colors.success + "20"
                      : dialog.variant === "warning"
                        ? colors.warning + "20"
                        : colors.danger + "20",
                  borderWidth: 1,
                  borderColor:
                    dialog.variant === "success"
                      ? colors.success + "50"
                      : dialog.variant === "warning"
                        ? colors.warning + "50"
                        : colors.danger + "50",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color:
                      dialog.variant === "success"
                        ? colors.success
                        : dialog.variant === "warning"
                          ? colors.warning
                          : colors.danger,
                  }}
                >
                  OK
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </DialogContent>
      </Dialog>

      <CashTipDeclarationModal
        isOpen={showCashDeclaration}
        shiftId={clockOutEmployee?.shiftId || timeClock.shiftId || ""}
        staffProfileId={clockOutEmployee?.profileId || currentStaffId || ""}
        locationId={selectedStore?.id || ""}
        employeeName={clockOutEmployee?.name || "Employee"}
        clockInTime={clockOutEmployee?.clockInTime || new Date()}
        onComplete={handleClockOutDeclarationComplete}
        onCancel={() => {
          handleClockOutDeclarationCancel();
          setClockOutEmployee(null);
        }}
      />
    </>
  );
};

export default PinLoginScreen;
