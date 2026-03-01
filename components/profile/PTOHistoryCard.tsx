import { colors } from "@/lib/theme";
import { PTORequest } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react-native";
import React from "react";
import { Text, View, TouchableOpacity } from "react-native";

interface PTOHistoryCardProps {
  request: PTORequest;
  onCancelRequest: (requestId: string) => void;
}

const getStatusStyles = (status: PTORequest["status"]) => {
  switch (status) {
    case "approved":
      return {
        icon: <CheckCircle2 size={20} color={colors.success} />,
        bg: "bg-green-500/10",
        border: "border-green-500/20",
        text: "text-green-400",
      };
    case "denied":
      return {
        icon: <XCircle size={20} color={colors.danger} />,
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        text: "text-red-400",
      };
    case "pending":
      return {
        icon: <AlertCircle size={20} color={colors.warning} />,
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/20",
        text: "text-yellow-400",
      };
  }
};

const PTOHistoryCard: React.FC<PTOHistoryCardProps> = ({ request, onCancelRequest }) => {
  const styles = getStatusStyles(request.status);

  return (
    <View className={`p-4 rounded-2xl border ${styles.bg} ${styles.border}`}>
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-start gap-3">
          {styles.icon}
          <View>
            <Text className="text-lg font-semibold text-white mb-1">
              {format(parseISO(request.startDate), "MMM d")} -{" "}
              {format(parseISO(request.endDate), "MMM d, yyyy")}
            </Text>
            <Text className="text-sm text-gray-400 mb-2">
              {request.hours} hours requested
            </Text>
            <Text className="text-xs text-gray-500">
              Submitted{" "}
              {format(parseISO(request.submittedAt), "MMM d, yyyy 'at' h:mm a")}
            </Text>
            {request.status === "denied" && request.denialReason && (
              <Text className="text-xs text-red-400 mt-1">
                Reason: {request.denialReason}
              </Text>
            )}
          </View>
        </View>
        <View className="items-end">
          <Text
            className={`text-xs font-medium px-2 py-1 rounded-full ${styles.bg} ${styles.text} mb-2`}
          >
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Text>
          {request.status === "pending" && (
            <TouchableOpacity
              onPress={() => onCancelRequest(request.id)}
              className="px-3 py-1 bg-red-600/20 border-2 border-red-500 rounded-lg"
            >
              <Text className="text-sm font-semibold text-red-300">
                Cancel Request
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default PTOHistoryCard;
