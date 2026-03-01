import { colors } from "@/lib/theme";
import {
  ArrowDownCircle,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

const ActivityItem = ({
  icon,
  title,
  subtitle,
  time,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  time: string;
}) => (
  <View className="p-4 bg-surface border border-gray-700 rounded-2xl flex-row items-start gap-4">
    {icon}
    <View className="flex-1">
      <Text className="text-sm font-medium text-white mb-1">{title}</Text>
      <Text className="text-xs text-gray-400 mb-2">{subtitle}</Text>
      <Text className="text-xs text-gray-500">{time}</Text>
    </View>
  </View>
);

const ActivityFeedTab = () => {
  return (
    <View className="gap-y-3">
      <ActivityItem
        icon={<ArrowDownCircle size={20} color={colors.warning} />}
        title="Drop request submitted"
        subtitle="Server shift on Jan 16 • Awaiting pickup"
        time="2 hours ago"
      />
      <ActivityItem
        icon={<ArrowRightLeft size={20} color={colors.info} />}
        title="Swap request submitted"
        subtitle="Requesting to swap Jan 18 shift for Jan 20 shift"
        time="1 day ago"
      />
      <ActivityItem
        icon={<CheckCircle2 size={20} color={colors.success} />}
        title="Drop request picked up"
        subtitle="Your Jan 10 shift was picked up by a coworker"
        time="3 days ago"
      />
    </View>
  );
};

export default ActivityFeedTab;
