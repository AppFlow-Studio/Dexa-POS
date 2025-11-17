import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  XCircle,
} from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const getStatusStyles = (status: string) => {
  switch (status) {
    case "approved":
      return {
        icon: <CheckCircle2 size={20} color="#22c55e" />,
        borderColor: "border-green-500/20",
        textColor: "text-green-400",
        bgColor: "bg-green-500/20",
      };
    case "denied":
      return {
        icon: <XCircle size={20} color="#ef4444" />,
        borderColor: "border-red-500/20",
        textColor: "text-red-400",
        bgColor: "bg-red-500/20",
      };
    default: // pending
      return {
        icon: <AlertCircle size={20} color="#f59e0b" />,
        borderColor: "border-yellow-500/20",
        textColor: "text-yellow-400",
        bgColor: "bg-yellow-500/20",
      };
  }
};

const DropRequestsTab = () => {
  const { loggedInEmployee } = useEmployeeStore();
  const { dropRequests, cancelDropRequest } = useScheduleStore();

  const myDropRequests = dropRequests.filter(
    (r) => r.shift.employeeId === loggedInEmployee?.id
  );

  if (myDropRequests.length === 0) {
    return (
      <View className="p-12 bg-[#303030] border border-gray-700 rounded-2xl items-center justify-center">
        <AlertCircle size={48} color="#6B7280" />
        <Text className="text-lg font-semibold text-white mt-4">
          No Drop Requests
        </Text>
        <Text className="text-sm text-gray-500 mt-2">
          You have not submitted any drop requests.
        </Text>
      </View>
    );
  }
  const formatTime = (time: string): string => {
    if (!time) return "N/A";
    const [hours, minutes] = time.split(":");
    const h = Number.parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <View className="gap-y-4">
      {myDropRequests.map((request) => {
        const styles = getStatusStyles(request.status);
        return (
          <View
            key={request.id}
            className={`p-4 bg-[#303030] rounded-2xl border ${styles.borderColor}`}
          >
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-row items-start gap-3">
                {styles.icon}
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
                        {formatTime(request.shift.startTime)} -{" "}
                        {formatTime(request.shift.endTime)}
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
                <Text
                  className={`text-xs font-medium px-2 py-1 rounded-full ${styles.bgColor} ${styles.textColor}`}
                >
                  {request.status.charAt(0).toUpperCase() +
                    request.status.slice(1)}
                </Text>
                <Text className="text-xs text-gray-500 mt-1">
                  Submitted {format(parseISO(request.submittedAt), "MMM d")}
                </Text>
              </View>
            </View>
            {request.status === "denied" && request.denialReason && (
              <View className="p-3 bg-red-900/30 rounded-lg mb-3 border border-red-700">
                <Text className="text-red-300 font-semibold">
                  Denial Reason:
                </Text>
                <Text className="text-red-300">{request.denialReason}</Text>
              </View>
            )}
            {request.status === "pending" && (
              <TouchableOpacity
                onPress={() => cancelDropRequest(request.id)}
                className="py-2 border border-gray-600 rounded-lg items-center"
              >
                <Text className="text-white font-semibold">Cancel Request</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default DropRequestsTab;
