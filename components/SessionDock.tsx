import { useToast } from "@/contexts/ToastContext";
import { useTimeClock } from "@/hooks/useTimeclock";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useRouter } from "expo-router";
import {
    ArrowLeftRight,
    Bell,
    Clock,
    Coffee,
    LogOut,
    Pause,
    User,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SwitchAccountModal from "./settings/security-and-login/SwitchAccountModal";
import BreakEndedModal from "./timeclock/BreakEndedModal";
import CashTipDeclarationModal from "./timeclock/CashTipDeclarationModal";
import PinInputModal from "./timeclock/PinInputModal";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const BREAK_DURATION_MIN = 30;

// Countdown component for on-break users
const BreakCountdown = ({ startTime }: { startTime: Date }) => {
  // Tick state to trigger re-render every second without flashing an initial default
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Update immediately on mount to avoid any visible lag
    setTick((t) => t + 1);
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Derive display on every render using current time
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const diff = now - start;
  const breakDurationMs = BREAK_DURATION_MIN * 60 * 1000;
  const isOvertime = diff >= breakDurationMs;

  let displayTime: string;
  if (isOvertime) {
    const overtime = diff - breakDurationMs;
    const minutes = Math.floor((overtime / (1000 * 60)) % 60);
    const seconds = Math.floor((overtime / 1000) % 60);
    displayTime = `+${String(minutes).padStart(2, "0")}:${String(
      seconds,
    ).padStart(2, "0")}`;
  } else {
    const remaining = Math.max(0, breakDurationMs - diff);
    const minutes = Math.floor((remaining / 1000 / 60) % 60);
    const seconds = Math.floor((remaining / 1000) % 60);
    displayTime = `${String(minutes).padStart(2, "0")}:${String(
      seconds,
    ).padStart(2, "0")}`;
  }

  return (
    <Text
      className={`text-xs font-bold ${
        isOvertime ? "text-red-400" : "text-yellow-400"
      }`}
    >
      {displayTime}
    </Text>
  );
};

// Individual chip for each user session
const SessionChip = ({ sessionId }: { sessionId: string }) => {
  const { sessions, activeEmployeeId, endBreak, startBreak } =
    useTimeclockStore();
  const { employees, signOut } = useEmployeeStore();
  const isBreakAndSwitchEnabled = useLocationConfigStore(
    (s) => s.config.timeclock.breakAndSwitchEnabled,
  );
  const { markAllAsRead } = useNotificationStore();
  const router = useRouter();
  const { show } = useToast();

  const openSheet = useNotificationSheetStore((state) => state.openSheet);

  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [isBreakEndedModalOpen, setBreakEndedModalOpen] = useState(false);
  const [isBreakPinModalOpen, setBreakPinModalOpen] = useState(false);
  const [isLogoutPinModalOpen, setLogoutPinModalOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("unknown");
  const [showCashDeclaration, setShowCashDeclaration] = useState(false);
  const pendingClockOutPinRef = useRef<string | null>(null);

  // Backend hook for time clock actions
  const timeClock = useTimeClock();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);

  // Get device ID on mount
  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const session = sessions[sessionId];
  const employee = employees.find((e) => e.id === session?.employeeId);
  const employeeId = employee?.id;
  const employeeProfileId = employee?.profileId;

  const unreadCount = useNotificationStore((state) =>
    employee
      ? state.notifications.filter(
          (n) => n.employeeId === employee.id && !n.isRead,
        ).length
      : 0,
  );

  const handleBreakPinConfirm = async (pin: string) => {
    setBreakPinModalOpen(false);

    const locationId = selectedStore?.id;
    if (!locationId) {
      show({
        title: "Error",
        message: "No location selected",
        type: "error",
      });
      return;
    }

    // Call backend
    await timeClock.startBreak(pin, locationId, deviceId);
    // Also update old store for local UI sync
    startBreak();

    if (isBreakAndSwitchEnabled) {
      show({
        title: "Break Started",
        message: "Your break has started. Ready for the next user to log in.",
        type: "success",
      });
      signOut();
      replaceRoute("(auth)", "pin-login");
    } else {
      show({
        title: "Break Started",
        message: "Your break has started.",
        type: "success",
      });
    }
  };

  const handleLogout = () => {
    pendingClockOutPinRef.current = null;
    setLogoutPinModalOpen(true);
  };

  const handleLogoutPinConfirm = (pin: string) => {
    pendingClockOutPinRef.current = pin;
    setLogoutPinModalOpen(false);
    setShowCashDeclaration(true);
  };

  const handleLogoutPinCancel = () => {
    pendingClockOutPinRef.current = null;
    setLogoutPinModalOpen(false);
  };

  const handleDeclarationComplete = useCallback(
    async (declaredAmount: number) => {
      setShowCashDeclaration(false);
      const locationId = selectedStore?.id;
      const pin = pendingClockOutPinRef.current;
      pendingClockOutPinRef.current = null;

      if (!locationId || !pin) return;

      // Declare cash tips (non-blocking — queued if offline)
      const shiftId = timeClock.shiftId;
      if (shiftId || employeeProfileId) {
        try {
          await timeClock.declareCashTips(
            shiftId || "",
            declaredAmount,
            locationId,
            deviceId,
            employeeProfileId,
          );
        } catch (e) {
          console.warn(
            "[SessionDock] Cash tip declaration failed, proceeding:",
            e,
          );
        }
      }

      // Clock out via RPC and only apply local session changes after acceptance.
      try {
        await timeClock.clockOut(pin, locationId, deviceId);
        if (employeeId) {
          useTimeclockStore.getState().clockOut(employeeId);
        }
        replaceRoute("(auth)", "pin-login");
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : typeof e === "string" ? e : "";

        if (
          errorMessage.includes("END_BREAK_FIRST") ||
          errorMessage.includes("ALREADY_ON_BREAK")
        ) {
          startBreak();
          return;
        }

        console.warn("[SessionDock] clockOut RPC failed:", e);
      }
    },
    [
      selectedStore?.id,
      timeClock,
      deviceId,
      employeeId,
      employeeProfileId,
      startBreak,
    ],
  );

  const handleDeclarationCancel = useCallback(() => {
    setShowCashDeclaration(false);
    pendingClockOutPinRef.current = null;
  }, []);

  if (!session || !employee) return null;

  const isActive = activeEmployeeId === session.employeeId;
  const isOnBreak = session.status === "onBreak";
  const isClockedIn = session.status === "clockedIn";

  const handleOpenNotificationPanel = () => {
    openSheet();
  };

  const handlePress = () => {
    if (isActive) return;
    setPinModalOpen(true);
  };

  const handlePinSuccess = () => {
    setPinModalOpen(false);
    if (isOnBreak) {
      setBreakEndedModalOpen(true);
    } else {
      useTimeclockStore.getState().setActiveEmployee(session.employeeId);
    }
  };

  const handleStartBreak = () => {
    if (isClockedIn) {
      // Show PIN modal for backend verification
      setBreakPinModalOpen(true);
    }
  };

  const initials = employee.fullName
    .split(" ")
    .map((n: string) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // For active employee, show teal circle + name, circle opens dropdown
  if (isActive) {
    return (
      <>
        <DropdownMenu>
          <View className="flex-row items-center gap-2">
            {/* Avatar circle — tapping opens dropdown */}
            <DropdownMenuTrigger
              style={{
                width: 30,
                height: 30,
                borderRadius: 21,
                backgroundColor: colors.tealMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 13,
                  fontWeight: "bold",
                  lineHeight: 13,
                  includeFontPadding: false,
                  textAlignVertical: "center",
                }}
              >
                {initials}
              </Text>
              {unreadCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.danger,
                  }}
                />
              )}
            </DropdownMenuTrigger>
            {/* Name — non-interactive */}
            <View>
              <Text
                className="font-medium text-xs leading-tight"
                style={{ color: colors.heading }}
              >
                {employee.fullName.split(" ")[0]}
              </Text>
              {isOnBreak && session.breakStartTime && (
                <BreakCountdown startTime={session.breakStartTime} />
              )}
            </View>
          </View>

          <DropdownMenuContent
            className="w-[300px] rounded-2xl shadow-2xl mt-3 overflow-hidden p-0"
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Hero header */}
            <View
              style={{ backgroundColor: colors.card }}
              className="px-5 pt-5 pb-4"
            >
              <View className="flex-row items-center gap-3">
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: colors.tealMuted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 15,
                      fontWeight: "bold",
                      lineHeight: 15,
                      includeFontPadding: false,
                      textAlignVertical: "center",
                    }}
                  >
                    {initials}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      color: colors.heading,
                    }}
                    numberOfLines={1}
                  >
                    {employee.fullName}
                  </Text>
                  <View
                    className="mt-1 self-start px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isOnBreak
                        ? `${colors.warning}20`
                        : `${colors.teal}20`,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {isOnBreak ? (
                        <Pause size={10} color={colors.warning} />
                      ) : (
                        <Clock size={10} color={colors.teal} />
                      )}
                      <Text
                        className="text-xs font-semibold"
                        style={{
                          color: isOnBreak ? colors.warning : colors.teal,
                        }}
                      >
                        {isOnBreak ? "On Break" : "On Duty"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Menu items */}
            <View className="py-1.5">
              <DropdownMenuItem
                onPress={() => router.push("/my-profile")}
                className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: colors.screen }}
                >
                  <User size={16} color={colors.label} />
                </View>
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: 14,
                    fontWeight: "500",
                    flex: 1,
                  }}
                >
                  My Profile
                </Text>
              </DropdownMenuItem>

              <DropdownMenuItem
                onPress={handleOpenNotificationPanel}
                className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: colors.screen }}
                >
                  <Bell size={16} color={colors.label} />
                  {unreadCount > 0 && (
                    <View
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.teal }}
                    >
                      <Text
                        style={{
                          color: colors.onSolid,
                          fontSize: 9,
                          fontWeight: "bold",
                        }}
                      >
                        {unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: 14,
                    fontWeight: "500",
                    flex: 1,
                  }}
                >
                  Notifications
                </Text>
                {unreadCount > 0 && (
                  <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${colors.teal}20` }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: colors.teal }}
                    >
                      {unreadCount}
                    </Text>
                  </View>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onPress={() => setPinModalOpen(true)}
                className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: colors.screen }}
                >
                  <ArrowLeftRight size={16} color={colors.label} />
                </View>
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: 14,
                    fontWeight: "500",
                    flex: 1,
                  }}
                >
                  Switch Account
                </Text>
              </DropdownMenuItem>

              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginHorizontal: 16,
                  marginVertical: 4,
                }}
              />

              <DropdownMenuItem
                onPress={handleStartBreak}
                disabled={!isClockedIn || isOnBreak}
                className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{
                    backgroundColor:
                      !isClockedIn || isOnBreak
                        ? colors.screen
                        : `${colors.warning}20`,
                  }}
                >
                  <Coffee
                    size={16}
                    color={
                      !isClockedIn || isOnBreak ? colors.muted : colors.warning
                    }
                  />
                </View>
                <Text
                  className="text-sm font-medium flex-1"
                  style={{
                    color:
                      !isClockedIn || isOnBreak ? colors.muted : colors.heading,
                  }}
                >
                  {isOnBreak ? "On Break" : "Start Break"}
                </Text>
              </DropdownMenuItem>

              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginHorizontal: 16,
                  marginVertical: 4,
                }}
              />

              <DropdownMenuItem
                onPress={handleLogout}
                className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: `${colors.danger}20` }}
                >
                  <LogOut size={16} color={colors.danger} />
                </View>
                <Text
                  className="text-sm font-medium flex-1"
                  style={{ color: colors.danger }}
                >
                  Sign out
                </Text>
              </DropdownMenuItem>
            </View>
          </DropdownMenuContent>
        </DropdownMenu>
        <SwitchAccountModal
          isOpen={isPinModalOpen}
          onClose={() => setPinModalOpen(false)}
        />
        <BreakEndedModal
          isOpen={isBreakEndedModalOpen}
          onClockIn={() => {
            endBreak(employee.id);
            setBreakEndedModalOpen(false);
          }}
          shift={session}
        />
        <PinInputModal
          isOpen={isBreakPinModalOpen}
          title="Start Break"
          subtitle="Enter your PIN to confirm"
          onConfirm={handleBreakPinConfirm}
          onCancel={() => setBreakPinModalOpen(false)}
        />
        <PinInputModal
          isOpen={isLogoutPinModalOpen}
          title="Sign Out"
          subtitle="Enter your PIN to clock out"
          onConfirm={handleLogoutPinConfirm}
          onCancel={handleLogoutPinCancel}
        />
        <CashTipDeclarationModal
          isOpen={showCashDeclaration}
          shiftId={timeClock.shiftId || ""}
          staffProfileId={employee?.profileId || ""}
          locationId={selectedStore?.id || ""}
          employeeName={employee?.fullName || ""}
          clockInTime={
            session?.clockInTime ? new Date(session.clockInTime) : new Date()
          }
          onComplete={handleDeclarationComplete}
          onCancel={handleDeclarationCancel}
        />
      </>
    );
  }

  // For non-active employees, show teal circle + name
  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        className="flex-row items-center gap-2"
      >
        <View className="relative">
          <View
            className={`w-7 h-7 rounded-full items-center justify-center ${
              isOnBreak ? "bg-amber-500/70" : "bg-teal-500/40"
            }`}
          >
            <Text
              style={{
                color: colors.onSolid,
                fontSize: 10,
                fontWeight: "bold",
                lineHeight: 10,
                includeFontPadding: false,
                textAlignVertical: "center",
              }}
            >
              {initials}
            </Text>
          </View>
          {unreadCount > 0 && (
            <View className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </View>
        <View>
          <Text className="font-medium text-xs text-label">
            {employee.fullName.split(" ")[0]}
          </Text>
          {isOnBreak && session.breakStartTime && (
            <BreakCountdown startTime={session.breakStartTime} />
          )}
        </View>
      </TouchableOpacity>
      <SwitchAccountModal
        isOpen={isPinModalOpen}
        onClose={() => setPinModalOpen(false)}
      />
      <BreakEndedModal
        isOpen={isBreakEndedModalOpen}
        onClockIn={() => {
          endBreak(employee.id);
          setBreakEndedModalOpen(false);
        }}
        shift={session}
      />
    </>
  );
};

// The main dock component
const SessionDock = () => {
  const { sessions, activeEmployeeId } = useTimeclockStore();

  const activeSessionId = Object.keys(sessions).find(
    (id) => sessions[id].employeeId === activeEmployeeId,
  );

  return (
    <>
      <View style={{ alignItems: "flex-end" }}>
        {activeSessionId && <SessionChip sessionId={activeSessionId} />}
      </View>
    </>
  );
};

export default SessionDock;
