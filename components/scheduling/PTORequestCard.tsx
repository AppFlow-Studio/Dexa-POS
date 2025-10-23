import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface PTORequestCardProps {
  employee: string;
  startDate: string;
  endDate: string;
  reason?: string;
  onApprove: () => void;
  onDeny: () => void;
}

const PTORequestCard: React.FC<PTORequestCardProps> = ({
  employee,
  startDate,
  endDate,
  reason,
  onApprove,
  onDeny,
}) => {
  const isSingleDay = startDate === endDate;

  return (
    <View className="p-4 bg-[#212121] border border-gray-700 rounded-2xl gap-y-3">
      <View className="flex-row items-center justify-between">
        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
          <Text className="text-purple-400">PTO Request</Text>
        </Badge>
        <Text className="text-xs text-gray-500">1 day ago</Text>
      </View>

      <View>
        <Text className="text-sm font-medium text-white mb-1">{employee}</Text>
        <Text className="text-xs text-gray-400">
          {isSingleDay ? startDate : `${startDate} - ${endDate}`}
        </Text>
      </View>

      {reason && (
        <View className="p-3 rounded-lg bg-[#303030] border border-gray-600">
          <Text className="text-xs text-gray-400 mb-1">Reason</Text>
          <Text className="text-sm text-white">{reason}</Text>
        </View>
      )}

      <View className="flex-row gap-2 pt-2">
        <Button
          onPress={onApprove}
          className="flex-1 gap-2 bg-green-600 hover:bg-green-700 flex-row"
        >
          <CheckCircle2 size={16} color="#FFFFFF" />
          <Text className="text-white font-semibold">Approve</Text>
        </Button>
        <Button
          onPress={onDeny}
          variant="outline"
          className="flex-1 gap-2 bg-transparent border-gray-600 flex-row"
        >
          <X size={16} color="#FFFFFF" />
          <Text className="text-white font-semibold">Deny</Text>
        </Button>
      </View>
    </View>
  );
};

export default PTORequestCard;
