import { PTORequest } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface PTOHistoryCardProps {
  request: PTORequest;
}

const getStatusStyles = (status: PTORequest["status"]) => {
  switch (status) {
    case "approved":
      return {
        icon: <CheckCircle2 size={20} color="#22c55e" />,
        bg: "bg-green-500/10",
        border: "border-green-500/20",
        text: "text-green-400",
      };
    case "denied":
      return {
        icon: <XCircle size={20} color="#ef4444" />,
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        text: "text-red-400",
      };
    case "pending":
      return {
        icon: <AlertCircle size={20} color="#f59e0b" />,
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/20",
        text: "text-yellow-400",
      };
  }
};

const PTOHistoryCard: React.FC<PTOHistoryCardProps> = ({ request }) => {
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
          </View>
        </View>
        <Text
          className={`text-xs font-medium px-2 py-1 rounded-full ${styles.bg} ${styles.text}`}
        >
          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </Text>
      </View>
    </View>
  );
};

export default PTOHistoryCard;
