import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface SwapRequestCardProps {
  fromEmployee: string;
  toEmployee: string;
  shift: { role: string; date: string; time: string };
  reason?: string;
  onApprove: () => void;
  onDeny: () => void;
}

const SwapRequestCard: React.FC<SwapRequestCardProps> = ({
  fromEmployee,
  toEmployee,
  shift,
  reason,
  onApprove,
  onDeny,
}) => {
  return (
    <View className="p-4 bg-[#212121] border border-gray-700 rounded-2xl gap-y-3">
      <View className="flex-row items-center justify-between">
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Text className="text-xs text-blue-400">Swap Request</Text>
        </Badge>
        <Text className="text-xs text-gray-500">2 hours ago</Text>
      </View>

      <View className="gap-y-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-gray-400">From:</Text>
          <Text className="font-medium text-white">{fromEmployee}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-gray-400">To:</Text>
          <Text className="font-medium text-white">{toEmployee}</Text>
        </View>
      </View>

      <View className="p-3 rounded-lg bg-[#303030] border border-gray-600">
        <Text className="text-xs text-gray-400 mb-1">Shift Details</Text>
        <Text className="text-sm font-medium text-white">{shift.role}</Text>
        <Text className="text-xs text-gray-400 mt-1">
          {shift.date} • {shift.time}
        </Text>
      </View>

      {reason && (
        <Text className="text-sm text-gray-400">
          <Text className="font-medium">Reason:</Text> {reason}
        </Text>
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

export default SwapRequestCard;
