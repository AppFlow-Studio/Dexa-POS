// File: /components/profile/ShiftDetailModal.tsx
import { Shift } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { Clock, Coffee, MapPin, X } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface ShiftDetailModalProps {
  shift: Shift | null;
  isOpen: boolean;
  onClose: () => void;
}

const DetailRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <View>
    <Text className="text-sm text-gray-400 mb-1">{label}</Text>
    <View className="flex-row items-center gap-2">
      {icon}
      <Text className="text-lg font-semibold text-white">{value}</Text>
    </View>
  </View>
);

// --- HELPER to parse 12-hour time format ---
const parseTime = (timeStr: string) => {
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours < 12) {
    hours += 12;
  }
  if (modifier === "AM" && hours === 12) {
    hours = 0;
  }
  return { hours, minutes };
};

export const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({
  shift,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !shift) return null;

  const calculateShiftHours = () => {
    if (!shift.startTime || !shift.endTime) return "N/A";

    const start = parseTime(shift.startTime);
    const end = parseTime(shift.endTime);

    const startTotalMinutes = start.hours * 60 + start.minutes;
    let endTotalMinutes = end.hours * 60 + end.minutes;

    // Handle overnight shifts
    if (endTotalMinutes < startTotalMinutes) {
      endTotalMinutes += 24 * 60; // Add 24 hours in minutes
    }

    const totalMinutes = endTotalMinutes - startTotalMinutes;
    const hours = totalMinutes / 60;

    return hours.toFixed(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[550px] bg-[#303030] border-gray-700 p-0 rounded-2xl">
        <DialogHeader className="p-4 border-b border-gray-700 flex-row justify-between items-center">
          <DialogTitle className="text-white text-xl font-bold">
            Shift Details
          </DialogTitle>
          <TouchableOpacity onPress={onClose} className="p-1">
            <X size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </DialogHeader>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View className="p-4 bg-[#212121] rounded-lg border border-gray-600 grid grid-cols-2 gap-4">
            <DetailRow icon={<></>} label="Role" value={shift.role} />
            <DetailRow
              icon={<></>}
              label="Date"
              value={format(parseISO(shift.date), "EEEE, MMM d, yyyy")}
            />
            <DetailRow
              icon={<Clock size={20} color="#9CA3AF" />}
              label="Time"
              value={`${shift.startTime} - ${shift.endTime}`}
            />
            <DetailRow
              icon={<MapPin size={20} color="#9CA3AF" />}
              label="Location"
              value={shift.location}
            />
            <DetailRow
              icon={<Clock size={20} color="#9CA3AF" />}
              label="Shift Duration"
              value={`${calculateShiftHours()} hours`}
            />
            <DetailRow
              icon={<Coffee size={20} color="#9CA3AF" />}
              label="Break Time"
              value={`${shift.breakMinutes} minutes`}
            />
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};
