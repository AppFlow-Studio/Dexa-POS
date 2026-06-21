import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import ActivityFeedTab from "@/components/profile/ActivityFeedTab";
import DropRequestsTab from "@/components/profile/DropRequestsTab";
import SwapRequestsInTab from "@/components/profile/SwapRequestsInTab";
import SwapRequestsOutTab from "@/components/profile/SwapRequestsOutTab";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

const StatCard = ({
  label,
  value,
  icon,
  scale,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  scale: number;
}) => {
  const s = (n: number) => Math.round(n * scale);
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, padding: s(14), borderRadius: s(14), borderWidth: 1, borderColor: colors.border }}>
      <View style={{ marginBottom: s(8) }}>{icon}</View>
      <Text style={{ fontSize: s(22), fontWeight: '700', color: colors.heading }}>{value}</Text>
      <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(2) }}>{label}</Text>
    </View>
  );
};

const TABS = [
  { key: "drops", label: "Drop Requests" },
  { key: "swaps-out", label: "Swaps Out" },
  { key: "swaps-in", label: "Swaps In" },
  { key: "activity", label: "Activity" },
];

const RequestsPage = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { tab } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState((tab as string) || "drops");

  const renderContent = () => {
    switch (activeTab) {
      case "drops": return <DropRequestsTab />;
      case "swaps-out": return <SwapRequestsOutTab />;
      case "swaps-in": return <SwapRequestsInTab />;
      case "activity": return <ActivityFeedTab />;
      default: return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: s(16) }}>
      {/* Stat cards */}
      <View style={{ flexDirection: 'row', gap: s(10), marginBottom: s(16) }}>
        <StatCard label="Drop Requests" value="1" icon={<ArrowDownCircle size={s(18)} color={colors.warning} />} scale={uiScale} />
        <StatCard label="Swap Requests" value="1" icon={<ArrowRightLeft size={s(18)} color={colors.teal} />} scale={uiScale} />
        <StatCard label="Pending" value="2" icon={<AlertCircle size={s(18)} color={colors.warning} />} scale={uiScale} />
        <StatCard label="Completed" value="0" icon={<CheckCircle2 size={s(18)} color={colors.success} />} scale={uiScale} />
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.panel, borderRadius: s(10), borderWidth: 1, borderColor: colors.border, padding: s(4), marginBottom: s(16) }}>
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={{
                flex: 1, paddingVertical: s(7), borderRadius: s(7), alignItems: 'center',
                backgroundColor: isActive ? colors.teal + '20' : 'transparent',
                borderWidth: 1,
                borderColor: isActive ? colors.teal + '40' : 'transparent',
              }}
            >
              <Text style={{ fontSize: s(12), fontWeight: '600', color: isActive ? colors.teal : colors.label }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>{renderContent()}</ScrollView>
    </View>
  );
};

export default RequestsPage;
