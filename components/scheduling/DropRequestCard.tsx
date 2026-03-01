import { colors } from "@/lib/theme";
import { ShiftRequest } from "@/lib/types";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  Check,
  Clock,
  MapPin,
  User,
  X,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { Button } from "../ui/button";

interface DropRequestCardProps {
  request: ShiftRequest;
  employeeName: string;
  onApprove: () => void;
  onDeny: () => void;
}

const formatTime = (time: string): string => {
  if (!time) return "N/A";
  const [hours, minutes] = time.split(":");
  const h = Number.parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const DropRequestCard: React.FC<DropRequestCardProps> = ({
  request,
  employeeName,
  onApprove,
  onDeny,
}) => {
  return (
    <View className="p-4 bg-panel rounded-2xl border border-yellow-500/20">
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-row items-start gap-3">
          <AlertCircle size={20} color={colors.warning} className="mt-1" />
          <View>
            <Text className="text-lg font-semibold text-white mb-1">
              {request.shift.role} - Drop Request
            </Text>
            <View className="flex-row items-center gap-2 mb-1">
              <User size={14} color={colors.label} />
              <Text className="text-sm text-gray-300 font-medium">
                {employeeName}
              </Text>
            </View>
            <Text className="text-sm text-gray-400 mb-2">
              {format(parseISO(request.shift.date), "EEEE, MMM d, yyyy")}
            </Text>
            <View className="flex-row gap-4">
              <View className="flex-row items-center gap-2">
                <Clock size={16} color={colors.label} />
                <Text className="text-sm text-gray-400">
                  {formatTime(request.shift.startTime)} -{" "}
                  {formatTime(request.shift.endTime)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <MapPin size={16} color={colors.label} />
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
      {request.note && (
        <View className="p-3 bg-screen border border-border rounded-lg mb-3">
          <Text className="text-gray-300 italic">Reason: {request.note}</Text>
        </View>
      )}
      <View className="flex-row gap-2">
        <Button
          onPress={onApprove}
          className="flex-1 bg-green-600 flex-row gap-2"
        >
          <Check size={16} color={colors.heading} />
          <Text className="text-white font-semibold">Approve</Text>
        </Button>
        <Button
          onPress={onDeny}
          variant="destructive"
          className="flex-1 flex-row gap-2"
        >
          <X size={16} color={colors.heading} />
          <Text className="text-white font-semibold">Deny</Text>
        </Button>
      </View>
    </View>
  );
};

export default DropRequestCard;
