import { colors } from "@/lib/theme";
import { ArrowDownCircle, ArrowRightLeft, CheckCircle2 } from "lucide-react-native";
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
  <View style={{ padding: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
    {icon}
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, marginBottom: 2 }}>{title}</Text>
      <Text style={{ fontSize: 11, color: colors.label, marginBottom: 2 }}>{subtitle}</Text>
      <Text style={{ fontSize: 11, color: colors.muted }}>{time}</Text>
    </View>
  </View>
);

const ActivityFeedTab = () => {
  return (
    <View style={{ gap: 10 }}>
      <ActivityItem
        icon={<ArrowDownCircle size={18} color={colors.warning} />}
        title="Drop request submitted"
        subtitle="Server shift on Jan 16 · Awaiting pickup"
        time="2 hours ago"
      />
      <ActivityItem
        icon={<ArrowRightLeft size={18} color={colors.teal} />}
        title="Swap request submitted"
        subtitle="Requesting to swap Jan 18 shift for Jan 20 shift"
        time="1 day ago"
      />
      <ActivityItem
        icon={<CheckCircle2 size={18} color={colors.success} />}
        title="Drop request picked up"
        subtitle="Your Jan 10 shift was picked up by a coworker"
        time="3 days ago"
      />
    </View>
  );
};

export default ActivityFeedTab;
