import { useToast } from "@/contexts/ToastContext";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useRouter } from "expo-router";
import {
  ArrowLeftRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Coffee,
  LogOut,
  Plus,
  User,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import SwitchAccountModal from "./settings/security-and-login/SwitchAccountModal";
import BreakEndedModal from "./timeclock/BreakEndedModal";
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
      className={`text-xs font-bold ${isOvertime ? "text-red-400" : "text-yellow-400"
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
  const { isBreakAndSwitchEnabled } = useStoreSettingsStore();
  const { markAllAsRead } = useNotificationStore();
  const router = useRouter();
  const { show } = useToast();

  const openSheet = useNotificationSheetStore((state) => state.openSheet);

  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [isBreakEndedModalOpen, setBreakEndedModalOpen] = useState(false);

  const session = sessions[sessionId];
  const employee = employees.find((e) => e.id === session.employeeId);

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
    }
  };

  const handleLogout = () => {
    useTimeclockStore.getState().clockOut(employee.id);
    router.replace("/pin-login");
  };

  // For active employee, show dropdown menu
  if (isActive) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="flex-row items-center p-1.5 rounded-full border bg-blue-600 border-blue-400">
              <View className="w-8 h-8 bg-blue-500 rounded-full items-center justify-center">
                <Text className="text-white text-sm font-bold">
                  {employee.fullName
                    .split(" ")
                    .map((name: string) => name.charAt(0))
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>
              {unreadCount > 0 && (
                <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-blue-600" />
              )}
              <View className="mx-2">
                <Text className="font-semibold text-white">
                  {employee.fullName.split(" ")[0]}
                </Text>
                {isOnBreak && session.breakStartTime && (
                  <BreakCountdown startTime={session.breakStartTime} />
                )}
              </View>
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[300px] bg-[#181a1f] border border-[#2a2e35] rounded-2xl shadow-2xl mt-4">
            {/* Header row like the design */}
            <View className="flex-row items-center px-4 py-4">
              <View className="w-10 h-10 bg-blue-600 rounded-full items-center justify-center mr-3">
                <Text className="text-white font-bold">
                  {employee.fullName
                    .split(" ")
                    .map((n) => n.charAt(0))
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>
              <Text
                className="text-white text-xl font-semibold flex-1"
                numberOfLines={1}
              >
                {employee.fullName}
              </Text>
              <View className="bg-[#0e3a63] px-3 py-1 rounded-full">
                <Text className="text-[#8bc1ff] text-xs font-semibold">
                  {isOnBreak ? "On Break" : "On Duty"}
                </Text>
              </View>
            </View>

            {/* Items */}
            <View className="px-4">
              <DropdownMenuItem
                onPress={() => router.push("/my-profile")}
                className="py-3"
              >
                <User className="mr-3 h-5 w-5" color="#cbd5e1" />
                <Text className="text-white text-base">My Profile</Text>
              </DropdownMenuItem>

              <DropdownMenuItem
                onPress={handleOpenNotificationPanel}
                className="py-3"
              >
                <View>
                  <Bell size={24} color="#9CA3AF" />
                  {unreadCount > 0 && (
                    <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full items-center justify-center border-2 border-[#303030]">
                      <Text className="text-white text-xs font-bold">
                        {unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-white text-base">Notification</Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onPress={() => setPinModalOpen(true)}
                className="py-3"
              >
                <ArrowLeftRight className="mr-3 h-5 w-5" color="#cbd5e1" />
                <Text className="text-white text-base">Switch Account</Text>
              </DropdownMenuItem>

              <View className="h-px bg-[#2a2e35] my-2" />

              <DropdownMenuItem
                onPress={handleStartBreak}
                disabled={!isClockedIn || isOnBreak}
                className="py-3"
              >
                <Coffee className="mr-3 h-5 w-5" color="#cbd5e1" />
                <Text className="text-white text-base">
                  {isOnBreak ? "On Break" : "Start Break"}
                </Text>
              </DropdownMenuItem>

              <View className="h-px bg-[#2a2e35] my-2" />

              <DropdownMenuItem onPress={handleLogout} className="py-3">
                <LogOut className="mr-3 h-5 w-5" color="#ef4444" />
                <Text className="text-red-400 text-base">Sign out</Text>
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
        {/* <NotificationBottomSheet
          bottomSheetRef={notificationSheetRef}
          onClose={() => notificationSheetRef.current?.close()}
        /> */}
      </>
    );
  }

  // For non-active employees, show regular touchable
  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        className={`flex-row items-center p-1.5 rounded-full border ${isOnBreak
            ? "bg-yellow-900/50 border-yellow-600"
            : "bg-gray-700 border-gray-600"
          }`}
      >
        <View
          className={`w-8 h-8 rounded-full items-center justify-center ${isOnBreak ? "bg-yellow-500" : "bg-gray-500"
            }`}
        >
          <Text className="text-white text-sm font-bold">
            {employee.fullName
              .split(" ")
              .map((name: string) => name.charAt(0))
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </Text>
        </View>
        {unreadCount > 0 && (
          <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-700" />
        )}
        <View className="mx-2">
          <Text className="font-semibold text-gray-300">
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
  const [isExpanded, setIsExpanded] = useState(true);

  const activeSessionId = Object.keys(sessions).find(
    (id) => sessions[id].employeeId === activeEmployeeId
  );
  const otherSessionIds = Object.keys(sessions).filter(
    (id) => sessions[id].employeeId !== activeEmployeeId
  );

  return (
    <>
      <View className="flex-row items-center p-1 bg-[#303030] rounded-full border border-gray-700">
        {isExpanded ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 p-1 items-center"
            >
              {activeSessionId && <SessionChip sessionId={activeSessionId} />}
              {otherSessionIds.map((id) => (
                <SessionChip key={id} sessionId={id} />
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setSwitchModalOpen(true)}
              className="p-2 mx-1 bg-gray-600 rounded-full"
            >
              <Plus size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIsExpanded(false)}
              className="p-2"
            >
              <ChevronLeft size={20} color="white" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {activeSessionId && <SessionChip sessionId={activeSessionId} />}
            {/* <TouchableOpacity
              onPress={() => setSwitchModalOpen(true)}
              className="p-2 mx-1 bg-gray-600 rounded-full"
            >
              <Plus size={20} color="white" />
            </TouchableOpacity> */}
            <TouchableOpacity
              onPress={() => setIsExpanded(true)}
              className="p-2"
            >
              <ChevronRight size={20} color="white" />
            </TouchableOpacity>
          </>
        )}
      </View>
      <SwitchAccountModal
        isOpen={isSwitchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
      />
    </>
  );
};

export default SessionDock;
