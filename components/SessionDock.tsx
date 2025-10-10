import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import SwitchAccountModal from "./settings/security-and-login/SwitchAccountModal";
import BreakEndedModal from "./timeclock/BreakEndedModal";

const BREAK_DURATION_MIN = 30;

// Countdown component for on-break users
const BreakCountdown = ({ startTime }: { startTime: Date }) => {
  const [displayTime, setDisplayTime] = useState("30:00");
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(startTime).getTime();
      const diff = now - start;
      const breakDurationMs = BREAK_DURATION_MIN * 60 * 1000;

      if (diff >= breakDurationMs) {
        setIsOvertime(true);
        const overtime = diff - breakDurationMs;
        const minutes = Math.floor((overtime / (1000 * 60)) % 60);
        const seconds = Math.floor((overtime / 1000) % 60);
        setDisplayTime(
          `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
            2,
            "0"
          )}`
        );
      } else {
        setIsOvertime(false);
        const remaining = breakDurationMs - diff;
        const minutes = Math.floor((remaining / 1000 / 60) % 60);
        const seconds = Math.floor((remaining / 1000) % 60);
        setDisplayTime(
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
            2,
            "0"
          )}`
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

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
  const { sessions, activeEmployeeId, endBreak } = useTimeclockStore();
  const { employees } = useEmployeeStore();

  const [isPinModalOpen, setPinModalOpen] = useState(false);
  const [isBreakEndedModalOpen, setBreakEndedModalOpen] = useState(false);

  const session = sessions[sessionId];
  const employee = employees.find((e) => e.id === session.employeeId);

  if (!session || !employee) return null;

  const isActive = activeEmployeeId === session.employeeId;
  const isOnBreak = session.status === "onBreak";

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

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        className={`flex-row items-center p-1.5 rounded-full border ${
          isActive
            ? "bg-blue-600 border-blue-400"
            : isOnBreak
            ? "bg-yellow-900/50 border-yellow-600"
            : "bg-gray-700 border-gray-600"
        }`}
      >
        <Image
          source={{ uri: employee.profilePictureUrl }}
          className="w-8 h-8 rounded-full"
        />
        <View className="mx-2">
          <Text
            className={`font-semibold ${
              isActive ? "text-white" : "text-gray-300"
            }`}
          >
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
    (id) => id === activeEmployeeId
  );
  const otherSessionIds = Object.keys(sessions).filter(
    (id) => id !== activeEmployeeId
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
            <TouchableOpacity
              onPress={() => setSwitchModalOpen(true)}
              className="p-2 mx-1 bg-gray-600 rounded-full"
            >
              <Plus size={20} color="white" />
            </TouchableOpacity>
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
