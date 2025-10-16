import { Shift } from "@/lib/types";
import { format, parseISO } from "date-fns";
import {
  ArrowDownCircle,
  ArrowRightLeft,
  Clock,
  Coffee,
  MapPin,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
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

export const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({
  shift,
  isOpen,
  onClose,
}) => {
  const [showDropForm, setShowDropForm] = useState(false);
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [swapReason, setSwapReason] = useState("");

  if (!isOpen || !shift) return null;

  const handleDropRequest = () => {
    console.log("Drop request submitted:", {
      shiftId: shift.id,
      reason: dropReason,
    });
    setShowDropForm(false);
    setDropReason("");
    onClose();
  };

  const handleSwapRequest = () => {
    console.log("Swap request submitted:", {
      shiftId: shift.id,
      reason: swapReason,
    });
    setShowSwapForm(false);
    setSwapReason("");
    onClose();
  };

  const calculateShiftHours = () => {
    const [startHour, startMin] = shift.startTime.split(":").map(Number);
    const [endHour, endMin] = shift.endTime.split(":").map(Number);
    const totalMinutes = endHour * 60 + endMin - (startHour * 60 + startMin);
    return (totalMinutes / 60).toFixed(1);
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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View className="-4 bg-[#212121] rounded-lg border border-gray-600 grid grid-cols-2 gap-4">
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
            <View className="grid grid-cols-2 gap-4">
              <TouchableOpacity className="p-4 bg-[#212121] rounded-lg border border-gray-600 flex-row items-center gap-2">
                <ArrowDownCircle size={20} color="#9CA3AF" />
                <Text className="text-white text-base font-semibold">
                  Request Drop
                </Text>
              </TouchableOpacity>
              <TouchableOpacity className="p-4 bg-[#212121] rounded-lg border border-gray-600 flex-row items-center gap-2">
                <ArrowRightLeft size={20} color="#9CA3AF" />
                <Text className="text-white text-base font-semibold">
                  Request Swap
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Drop Request Form */}
          {showDropForm && (
            <View className="p-4 bg-[#212121] rounded-lg border border-gray-600">
              <Text className="text-lg font-semibold text-white mb-2">
                Request to Drop Shift
              </Text>
              <TextInput
                value={dropReason}
                onChangeText={setDropReason}
                placeholder="Reason (Optional)..."
                placeholderTextColor="#6B7280"
                multiline
                className="p-3 bg-[#303030] border border-gray-500 rounded-lg text-white min-h-[80px] mb-3"
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowDropForm(false)}
                  className="flex-1 py-2 border border-gray-600 rounded-lg items-center"
                >
                  <Text className="text-white font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDropRequest}
                  className="flex-1 py-2 bg-yellow-600 rounded-lg items-center"
                >
                  <Text className="text-black font-semibold">
                    Submit Drop Request
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Swap Request Form */}
          {showSwapForm && (
            <View className="p-4 bg-[#212121] rounded-lg border border-gray-600">
              <Text className="text-lg font-semibold text-white mb-2">
                Request to Swap Shift
              </Text>
              <TextInput
                value={swapReason}
                onChangeText={setSwapReason}
                placeholder="Reason (Optional)..."
                placeholderTextColor="#6B7280"
                multiline
                className="p-3 bg-[#303030] border border-gray-500 rounded-lg text-white min-h-[80px] mb-3"
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowSwapForm(false)}
                  className="flex-1 py-2 border border-gray-600 rounded-lg items-center"
                >
                  <Text className="text-white font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSwapRequest}
                  className="flex-1 py-2 bg-blue-600 rounded-lg items-center"
                >
                  <Text className="text-white font-semibold">
                    Continue to Swap
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          {shift.status === "confirmed" && !showDropForm && !showSwapForm && (
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => setShowDropForm(true)}
                className="flex-1 p-4 bg-[#212121] rounded-lg border border-gray-600 flex-row items-center justify-center gap-2"
              >
                <ArrowDownCircle size={20} color="#9CA3AF" />
                <Text className="text-white text-base font-semibold">
                  Request Drop
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowSwapForm(true)}
                className="flex-1 p-4 bg-[#212121] rounded-lg border border-gray-600 flex-row items-center justify-center gap-2"
              >
                <ArrowRightLeft size={20} color="#9CA3AF" />
                <Text className="text-white text-base font-semibold">
                  Request Swap
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};
