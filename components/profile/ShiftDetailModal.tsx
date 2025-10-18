// File: /components/profile/ShiftDetailModal.tsx
import { Shift } from "@/lib/types";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Clock,
  Coffee,
  MapPin,
  MessageSquare,
  TrendingUp,
  Users,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import ComplianceBadge from "./ComplianceBadge";

interface ShiftDetailModalProps {
  shift: Shift | null;
  isOpen: boolean;
  onClose: () => void;
}

const StatusBadge = ({
  text,
  color,
}: {
  text: string;
  color: "blue" | "yellow" | "gray" | "green";
}) => {
  const colors = {
    blue: "bg-blue-600/20 text-blue-400",
    yellow: "bg-yellow-600/20 text-yellow-400",
    gray: "bg-gray-600/20 text-gray-300",
    green: "bg-green-600/20 text-green-400",
  };
  return (
    <View className={`px-2 py-1 rounded ${colors[color]}`}>
      <Text className={`text-xs font-semibold ${colors[color]}`}>{text}</Text>
    </View>
  );
};

export const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({
  shift,
  isOpen,
  onClose,
}) => {
  const { addDropRequest, addSwapRequest } = useScheduleStore();
  const [showDropForm, setShowDropForm] = useState(false);
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [swapReason, setSwapReason] = useState("");

  if (!isOpen || !shift) return null;

  const handleDropRequest = () => {
    addDropRequest({
      shift,
      status: "pending",
      submittedAt: new Date().toISOString(),
      note: dropReason,
    });
    toast.success("Drop request submitted for manager approval.", {
      position: ToastPosition.BOTTOM,
    });
    setShowDropForm(false);
    setDropReason("");
    onClose();
  };

  const handleSwapRequest = () => {
    addSwapRequest({
      shift,
      status: "pending",
      submittedAt: new Date().toISOString(),
      direction: "outgoing",
      theirShift: shift, // Placeholder
      note: swapReason,
    });
    toast.success("Swap request sent.", {
      position: ToastPosition.BOTTOM,
    });
    setShowSwapForm(false);
    setSwapReason("");
    onClose();
  };

  const getStatusLabel = () => {
    switch (shift.status) {
      case "confirmed":
        return { label: "Assigned", color: "blue" as const };
      case "pending-swap":
        return { label: "Pending swap", color: "yellow" as const };
      case "dropped":
        return { label: "Dropped (pending)", color: "yellow" as const };
      case "on-shift":
        return { label: "On shift", color: "green" as const };
      default:
        return { label: "Scheduled", color: "gray" as const };
    }
  };

  const getPaceVariant = (
    pace?: "Calm" | "Moderate" | "Busy"
  ): "success" | "default" | "warning" => {
    if (pace === "Calm") return "success";
    if (pace === "Busy") return "warning";
    return "default";
  };

  const getStaffingVariant = (
    level?: "Fully staffed" | "May need help"
  ): "success" | "warning" => {
    if (level === "May need help") return "warning";
    return "success";
  };

  const { label, color } = getStatusLabel();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[600px] bg-[#303030] border-gray-700 p-0 rounded-2xl">
        <DialogHeader className="p-4 border-b border-gray-700 flex-row justify-between items-center">
          <DialogTitle className="text-white text-xl font-bold">
            {format(parseISO(shift.date), "EEEE, MMMM d")}
          </DialogTitle>
          <TouchableOpacity onPress={onClose} className="p-1">
            <X size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </DialogHeader>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View className="p-4 bg-[#212121] rounded-xl border border-gray-700">
            <View className="flex-row items-center gap-3 mb-3">
              <Text className="text-base font-semibold text-white">
                {shift.role}
              </Text>
              <StatusBadge text={label} color={color} />
              {shift.isToday && <StatusBadge text="Today" color="blue" />}
            </View>

            <View className="flex-row items-center gap-2 mb-2">
              <Clock size={16} color="#9CA3AF" />
              <Text className="text-base text-white">
                {shift.startTime} – {shift.endTime}
              </Text>
              {shift.status === "on-shift" && (
                <Text className="text-base text-green-400">
                  (On since {shift.actualClockIn})
                </Text>
              )}
            </View>

            <View className="flex-row items-center gap-2 mb-4">
              <MapPin size={16} color="#9CA3AF" />
              <Text className="text-base text-gray-400">{shift.location}</Text>
            </View>

            {shift.managerNote && (
              <TouchableOpacity className="flex-row items-center gap-2 mb-4 p-2 bg-blue-900/20 rounded-md">
                <MessageSquare size={16} color="#60A5FA" />
                <Text className="text-sm text-blue-300 underline">
                  {shift.managerNote}
                </Text>
              </TouchableOpacity>
            )}

            <View className="flex-row flex-wrap items-center gap-2 mb-4">
              <ComplianceBadge
                icon={<Coffee size={14} color="#9CA3AF" />}
                text={`Meal break ${shift.breakMinutes}m required`}
                variant="default"
              />
              {shift.restRiskHours && (
                <ComplianceBadge
                  icon={<AlertTriangle size={14} color="#f59e0b" />}
                  text={`Risk: ${shift.restRiskHours}h rest`}
                  variant="warning"
                />
              )}
              {shift.expectedPace && (
                <ComplianceBadge
                  icon={<TrendingUp size={14} color="#9CA3AF" />}
                  text={`Expected: ${shift.expectedPace}`}
                  variant={getPaceVariant(shift.expectedPace)}
                />
              )}
              {shift.staffingLevel && (
                <ComplianceBadge
                  icon={<Users size={14} color="#9CA3AF" />}
                  text={shift.staffingLevel}
                  variant={getStaffingVariant(shift.staffingLevel)}
                />
              )}
              {shift.isOvertimeRisk && (
                <ComplianceBadge
                  icon={<AlertTriangle size={14} color="#f59e0b" />}
                  text="OT risk"
                  variant="warning"
                />
              )}
            </View>
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};
