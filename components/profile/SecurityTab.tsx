import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { colors } from "@/lib/theme";
import { Mail, Phone, Shield } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const SectionRow = ({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) => (
  <View
    style={{
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.border,
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
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
            fontSize: 10,
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.heading }}>
          {value}
        </Text>
      </View>
    </View>
  </View>
);

const SecurityTab = () => {
  const { employees, activeEmployeeId } = useEmployeeStore();
  const currentEmployee = employees.find((e) => e.id === activeEmployeeId);

  if (!currentEmployee) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>No employee selected.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        Account Security
      </Text>

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <SectionRow
          icon={<Mail size={15} color={colors.teal} />}
          label="Email"
          value={currentEmployee.email || "Not set"}
        />
        <SectionRow
          icon={<Phone size={15} color={colors.teal} />}
          label="Phone Number"
          value={currentEmployee.phone || "Not set"}
        />
        <SectionRow
          icon={<Shield size={15} color={colors.teal} />}
          label="PIN"
          value={currentEmployee.pin ? "••••" : "Not set"}
          last
        />
      </View>

      <Text
        style={{
          fontSize: 11,
          color: colors.muted,
          marginTop: 12,
          textAlign: "center",
        }}
      >
        Contact your manager to update security settings.
      </Text>
    </ScrollView>
  );
};

export default SecurityTab;
