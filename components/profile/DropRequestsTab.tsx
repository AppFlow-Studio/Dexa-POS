import { MOCK_DROP_REQUESTS } from "@/lib/mockData";
import { format, parseISO } from "date-fns";
import { AlertCircle, Clock, MapPin } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const DropRequestsTab = () => {
  return (
    <View className="gap-y-4">
      {MOCK_DROP_REQUESTS.map((request) => (
        <View
          key={request.id}
          className="p-4 bg-[#303030] rounded-2xl border border-yellow-500/20"
        >
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-row items-start gap-3">
              <AlertCircle size={20} color="#f59e0b" />
              <View>
                <Text className="text-lg font-semibold text-white mb-1">
                  {request.shift.role}
                </Text>
                <Text className="text-sm text-gray-400 mb-2">
                  {format(parseISO(request.shift.date), "EEEE, MMM d, yyyy")}
                </Text>
                <View className="flex-row gap-4">
                  <View className="flex-row items-center gap-2">
                    <Clock size={16} color="#9CA3AF" />
                    <Text className="text-sm text-gray-400">
                      {request.shift.startTime} - {request.shift.endTime}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <MapPin size={16} color="#9CA3AF" />
                    <Text className="text-sm text-gray-400">
                      {request.shift.location}
                    </Text>
                  </View>
                </View>
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

export default DropRequestsTab;
