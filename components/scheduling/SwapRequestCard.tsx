import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shift } from "@/lib/types";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  MapPin,
  X,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface SwapRequestCardProps {
  ownerName: string;
  peerName: string;
  myShift: Shift;
  peerShift: Shift;
  submittedAt: string;
  onApprove: () => void;
  onDeny: () => void;
}
const formatTime = (time: string): string => {
  if (!time) return "N/A";
  // Create a dummy date to parse the time correctly with parseISO
  return format(parseISO(time), "h:mm a");
};

const formatTimeAgo = (dateString: string): string => {
  if (!dateString) return "";
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch (error) {
    console.warn(`Invalid date string passed to formatTimeAgo: ${dateString}`);
    return "";
  }
};

const ShiftInfoCard = ({ shift }: { shift: Shift }) => (
  <View className="p-3 rounded-lg bg-[#303030] border border-gray-600">
    <Text className="text-sm font-medium text-white">{shift.role}</Text>
    <Text className="text-xs text-gray-400 mt-1 mb-2">
      {format(parseISO(shift.date), "EEEE, MMM d")}
    </Text>
    <View className="flex-row gap-4">
      <View className="flex-row items-center gap-2">
        <Clock size={16} color="#9CA3AF" />
        <Text className="text-sm text-gray-400">
          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <MapPin size={16} color="#9CA3AF" />
        <Text className="text-sm text-gray-400">{shift.location}</Text>
      </View>
    </View>
  </View>
);

const SwapRequestCard: React.FC<SwapRequestCardProps> = ({
  ownerName,
  peerName,
  myShift,
  peerShift,
  submittedAt,
  onApprove,
  onDeny,
}) => {
  return (
    <View className="p-4 bg-[#212121] border border-gray-700 rounded-2xl gap-y-3">
      <View className="flex-row items-center justify-between">
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Text className="text-xs text-blue-400">Swap Request</Text>
        </Badge>
        <Text className="text-xs text-gray-500">{formatTimeAgo(submittedAt)}</Text>
      </View>

      <View className="gap-y-2">
        <Text className="text-sm text-gray-300">
          <Text className="font-bold text-white">{ownerName}</Text> wants to
          swap with <Text className="font-bold text-white">{peerName}</Text>.
        </Text>
      </View>

      <View className="gap-y-2">
        <Text className="text-xs text-gray-400 font-semibold">
          {ownerName} offers:
        </Text>
        <ShiftInfoCard shift={myShift} />
        <View className="items-center my-1">
          <ArrowRightLeft size={20} color="#3b82f6" />
        </View>
        <Text className="text-xs text-gray-400 font-semibold">
          For {peerName}'s shift:
        </Text>
        <ShiftInfoCard shift={peerShift} />
      </View>

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
          variant="destructive"
          className="flex-1 gap-2 border-gray-600 flex-row"
        >
          <X size={16} color="#FFFFFF" />
          <Text className="text-white font-semibold">Deny</Text>
        </Button>
      </View>
    </View>
  );
};

export default SwapRequestCard;
