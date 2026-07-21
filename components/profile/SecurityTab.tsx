import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { Mail, Phone, Shield } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const SectionRow = ({
  icon,
  label,
  value,
  last,
  scale,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
  scale: number;
}) => {
  const s = (n: number) => Math.round(n * scale);
  return (
  <View
    style={{
      paddingHorizontal: s(14),
      paddingVertical: s(12),
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.border,
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
      <View
        style={{
          width: s(32),
          height: s(32),
          borderRadius: s(8),
          backgroundColor: colors.teal + "15",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: s(10),
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: s(2),
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: s(13), fontWeight: "500", color: colors.heading }}>
          {value}
        </Text>
      </View>
    </View>
  </View>
  );
};

const SecurityTab = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { employees, activeEmployeeId } = useEmployeeStore();
  const currentEmployee = employees.find((e) => e.id === activeEmployeeId);

  if (!currentEmployee) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted, fontSize: s(13) }}>No employee selected.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: s(16), paddingTop: s(16), paddingBottom: s(24) }}
    >
      <Text
        style={{
          fontSize: s(11),
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: s(10),
        }}
      >
        Account Security
      </Text>

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <SectionRow
          icon={<Mail size={s(15)} color={colors.teal} />}
          label="Email"
          value={currentEmployee.email || "Not set"}
          scale={uiScale}
        />
        <SectionRow
          icon={<Phone size={s(15)} color={colors.teal} />}
          label="Phone Number"
          value={currentEmployee.phone || "Not set"}
          scale={uiScale}
        />
        <SectionRow
          icon={<Shield size={s(15)} color={colors.teal} />}
          label="PIN"
          value={currentEmployee.pin ? "••••" : "Not set"}
          last
          scale={uiScale}
        />
      </View>

      <Text
        style={{
          fontSize: s(11),
          color: colors.muted,
          marginTop: s(12),
          textAlign: "center",
        }}
      >
        Contact your manager to update security settings.
      </Text>
    </ScrollView>
  );
};

export default SecurityTab;
