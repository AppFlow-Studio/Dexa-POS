import { useToast } from "@/contexts/ToastContext";
import { useTimeClock } from "@/hooks/useTimeclock";
import { getDeviceId } from "@/lib/deviceId";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useRouter } from "expo-router";
import { colors } from "@/lib/theme";
import {
  ArrowLeftRight,
  Bell,
  Coffee,
  LogOut,
  User,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SwitchAccountModal from "./settings/security-and-login/SwitchAccountModal";
import BreakEndedModal from "./timeclock/BreakEndedModal";
import PinInputModal from "./timeclock/PinInputModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

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
      seconds
    ).padStart(2, "0")}`;
  } else {
    const remaining = Math.max(0, breakDurationMs - diff);
    const minutes = Math.floor((remaining / 1000 / 60) % 60);
    const seconds = Math.floor((remaining / 1000) % 60);
    displayTime = `${String(minutes).padStart(2, "0")}:${String(
      seconds
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
  const isBreakAndSwitchEnabled = useStoreSettingsStore((s) => s.isBreakAndSwitchEnabled);
  const { markAllAsRead } = useNotificationStore();
  const router = useRouter();
  const { show } = useToast();

  const openSheet = useNotificationSheetStore((state) => state.openSheet);

  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [isBreakEndedModalOpen, setBreakEndedModalOpen] = useState(false);
  const [isBreakPinModalOpen, setBreakPinModalOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("unknown");

  // Backend hook for time clock actions
  const timeClock = useTimeClock();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);

  // Get device ID on mount
  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const session = sessions[sessionId];
  const employee = employees.find((e) => e.id === session?.employeeId);

  const unreadCount = useNotificationStore((state) =>
    employee
      ? state.notifications.filter(
          (n) => n.employeeId === employee.id && !n.isRead
        ).length
      : 0
  );

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
      router.replace("/pin-login");
    } else {
      show({
        title: "Break Started",
        message: "Your break has started.",
        type: "success",
      });
    }
  };

  const handleLogout = () => {
    useTimeclockStore.getState().clockOut(employee.id);
    router.replace("/pin-login");
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
            {/* Teal circle — tapping opens dropdown */}
            <DropdownMenuTrigger style={{ width: 30, height: 30, borderRadius: 21, backgroundColor: '#2DD4BF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#0C0F1A', fontSize: 13, fontWeight: 'bold' }}>{initials}</Text>
              {unreadCount > 0 && (
                <View style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
              )}
            </DropdownMenuTrigger>
            {/* Name — non-interactive */}
            <View>
              <Text className="font-medium text-white text-xs leading-tight">
                {employee.fullName.split(" ")[0]}
              </Text>
              {isOnBreak && session.breakStartTime && (
                <BreakCountdown startTime={session.breakStartTime} />
              )}
            </View>
          </View>

          <DropdownMenuContent className="w-[300px] bg-panel border border-border rounded-2xl shadow-2xl mt-3 overflow-hidden p-0">
            {/* Hero header */}
            <View style={{ backgroundColor: '#0C0F1A' }} className="px-5 pt-5 pb-4">
              <View className="flex-row items-center gap-3">
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#2DD4BF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#0C0F1A', fontSize: 15, fontWeight: 'bold' }}>{initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white text-base font-bold" numberOfLines={1}>{employee.fullName}</Text>
                  <View className={`mt-1 self-start px-2 py-0.5 rounded-full ${isOnBreak ? "bg-amber-500/20" : "bg-teal-500/20"}`}>
                    <Text className={`text-xs font-semibold ${isOnBreak ? "text-amber-400" : "text-teal-400"}`}>
                      {isOnBreak ? "⏸ On Break" : "● On Duty"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View className="h-px bg-border" />

            {/* Menu items */}
            <View className="py-1.5">
              <DropdownMenuItem onPress={() => router.push("/my-profile")} className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5">
                <View className="w-8 h-8 bg-white/5 rounded-lg items-center justify-center">
                  <User size={16} color={colors.label} />
                </View>
                <Text className="text-heading text-sm font-medium flex-1">My Profile</Text>
              </DropdownMenuItem>

              <DropdownMenuItem onPress={handleOpenNotificationPanel} className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5">
                <View className="w-8 h-8 bg-white/5 rounded-lg items-center justify-center">
                  <Bell size={16} color={colors.label} />
                  {unreadCount > 0 && (
                    <View className="absolute -top-1 -right-1 w-4 h-4 bg-teal-500 rounded-full items-center justify-center">
                      <Text style={{ color: '#0C0F1A', fontSize: 9, fontWeight: 'bold' }}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text className="text-heading text-sm font-medium flex-1">Notifications</Text>
                {unreadCount > 0 && (
                  <View className="bg-teal-500/20 px-2 py-0.5 rounded-full">
                    <Text className="text-teal-400 text-xs font-bold">{unreadCount}</Text>
                  </View>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem onPress={() => setPinModalOpen(true)} className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5">
                <View className="w-8 h-8 bg-white/5 rounded-lg items-center justify-center">
                  <ArrowLeftRight size={16} color={colors.label} />
                </View>
                <Text className="text-heading text-sm font-medium flex-1">Switch Account</Text>
              </DropdownMenuItem>

              <View className="h-px bg-border mx-4 my-1" />

              <DropdownMenuItem
                onPress={handleStartBreak}
                disabled={!isClockedIn || isOnBreak}
                className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5"
              >
                <View className={`w-8 h-8 rounded-lg items-center justify-center ${!isClockedIn || isOnBreak ? "bg-white/5" : "bg-amber-500/10"}`}>
                  <Coffee size={16} color={!isClockedIn || isOnBreak ? colors.muted : colors.warning} />
                </View>
                <Text className={`text-sm font-medium flex-1 ${!isClockedIn || isOnBreak ? "text-muted" : "text-heading"}`}>
                  {isOnBreak ? "On Break" : "Start Break"}
                </Text>
              </DropdownMenuItem>

              <View className="h-px bg-border mx-4 my-1" />

              <DropdownMenuItem onPress={handleLogout} className="px-4 py-3 flex-row items-center gap-3 active:bg-white/5">
                <View className="w-8 h-8 bg-red-500/10 rounded-lg items-center justify-center">
                  <LogOut size={16} color={colors.danger} />
                </View>
                <Text className="text-red-400 text-sm font-medium flex-1">Sign out</Text>
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
      </>
    );
  }

  // For non-active employees, show teal circle + name
  return (
    <>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.75} className="flex-row items-center gap-2">
        <View className="relative">
          <View className={`w-7 h-7 rounded-full items-center justify-center ${isOnBreak ? "bg-amber-500/70" : "bg-teal-500/40"}`}>
            <Text className="text-white text-[10px] font-bold">{initials}</Text>
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
  const [isSwitchModalOpen, setSwitchModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Chevron rotation animation
  const rotation = useSharedValue(180); // Start at 180 since expanded by default

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    rotation.value = withTiming(isExpanded ? 0 : 180, { duration: 200 });
  };

  const activeSessionId = Object.keys(sessions).find(
    (id) => sessions[id].employeeId === activeEmployeeId
  );
  const otherSessionIds = Object.keys(sessions).filter(
    (id) => sessions[id].employeeId !== activeEmployeeId
  );

  return (
    <>
      <View className="flex-row items-center gap-3">
        {activeSessionId && <SessionChip sessionId={activeSessionId} />}
        {otherSessionIds.map((id) => (
          <SessionChip key={id} sessionId={id} />
        ))}
      </View>
      <SwitchAccountModal
        isOpen={isSwitchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
      />
    </>
  );
};

export default SessionDock;
