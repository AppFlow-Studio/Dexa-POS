import { colors } from "@/lib/theme";
import { Role, TemplateShift } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react-native";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface OverlayShiftChipProps {
  shift: TemplateShift;
  isConflicting: boolean;
}

const roleColors: Record<Role, { bg: string; border: string }> = {
  Cashier: { bg: "bg-blue-500/20", border: "border-blue-500/50" },
  Barista: { bg: "bg-purple-500/20", border: "border-purple-500/50" },
  "Line Cook": { bg: "bg-yellow-500/20", border: "border-yellow-500/50" },
  Prep: { bg: "bg-green-500/20", border: "border-green-500/50" },
  Supervisor: { bg: "bg-pink-500/20", border: "border-pink-500/50" },
  Manager: { bg: "bg-amber-500/20", border: "border-amber-500/50" },
};

const textColors: Record<Role, string> = {
  Cashier: "#60a5fa",
  Barista: "#c084fc",
  "Line Cook": "#facc15",
  Prep: "#4ade80",
  Supervisor: "#f472b6",
  Manager: "#fbbf24",
};

const OverlayShiftChip: React.FC<OverlayShiftChipProps> = ({
  shift,
  isConflicting,
}) => {
  const startTime = format(parseISO(shift.startTime), "h:mm a");
  const endTime = format(parseISO(shift.endTime), "h:mm a");

  const roleColor =
    roleColors[shift.role] || {
      bg: "bg-gray-500/20",
      border: "border-gray-500/50",
    };
  const roleTextColor = textColors[shift.role] || colors.label;

  const containerClasses = isConflicting
    ? "p-2 rounded-lg bg-red-900/30 border-2 border-dashed border-red-500/50 mb-2"
    : `p-2 rounded-lg border-2 border-dashed mb-2 ${roleColor.bg} ${roleColor.border}`;

  const textColor = isConflicting ? colors.danger : roleTextColor;

  const opacity = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0.6, { duration: 1000 })
      ),
      -1,
      true
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View className={containerClasses} style={animatedStyle}>
      <View className="flex-row justify-between items-center">
        <Text style={{ color: textColor }} className="text-xs font-bold">
          {shift.role}
        </Text>
        {isConflicting && <AlertTriangle size={14} color={colors.danger} />}
      </View>
      <Text style={{ color: textColor }} className="text-xs">
        {startTime} - {endTime}
      </Text>
    </Animated.View>
  );
};

export default OverlayShiftChip;
