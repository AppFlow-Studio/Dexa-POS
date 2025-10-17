import { MOCK_SWAP_REQUESTS } from "@/lib/mockData";
import { Shift } from "@/lib/types";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowRightLeft,
  Clock,
  MapPin,
} from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const ShiftInfoCard = ({ shift }: { shift?: Shift }) => {
  // Add a guard clause to handle cases where the shift might be undefined.
  if (!shift) {
    return null;
  }

  return (
    <View className="p-4 bg-[#212121] rounded-xl border border-gray-700">
      <Text className="text-base font-semibold text-white mb-1">
        {shift.role}
      </Text>
      <Text className="text-sm text-gray-400 mb-2">
        {format(parseISO(shift.date), "EEEE, MMM d")}
      </Text>
      <View className="flex-row gap-4">
        <View className="flex-row items-center gap-2">
          <Clock size={16} color="#9CA3AF" />
          <Text className="text-sm text-gray-400">
            {shift.startTime} - {shift.endTime}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <MapPin size={16} color="#9CA3AF" />
          <Text className="text-sm text-gray-400">{shift.location}</Text>
        </View>
      </View>
    </View>
  );
};

const SwapRequestsOutTab = () => {
  return (
    <View className="gap-y-4">
      {MOCK_SWAP_REQUESTS.map((request) => (
        <View
          key={request.id}
          className="p-4 bg-[#303030] rounded-2xl border border-yellow-500/20"
        >
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-row items-start gap-3">
              <AlertCircle size={20} color="#f59e0b" />
              <View className="flex-1">
                <Text className="text-sm text-gray-400 mb-2">
                  You're offering
                </Text>
                <ShiftInfoCard shift={request.shift} />
                <View className="items-center my-4">
                  <ArrowRightLeft size={20} color="#3b82f6" />
                </View>
                <Text className="text-sm text-gray-400 mb-2">
                  In exchange for
                </Text>
                {/* --- REMOVED the non-null assertion (!) --- */}
                <ShiftInfoCard shift={request.theirShift} />
              </View>
            </View>
            <View className="items-end">
              <Text className="text-xs font-medium px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                Pending
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                Submitted {format(parseISO(request.submittedAt), "MMM d")}
              </Text>
            </View>
          </View>
          <TouchableOpacity className="py-2 border border-gray-600 rounded-lg items-center">
            <Text className="text-white font-semibold">Cancel Request</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

export default SwapRequestsOutTab;
