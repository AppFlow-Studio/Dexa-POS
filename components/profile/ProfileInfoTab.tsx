import { MOCK_USER_PROFILE } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Calendar, MapPin, User, Users, Globe } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const Field = ({
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
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: s(12),
      paddingHorizontal: s(14),
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.border,
      gap: s(12),
    }}
  >
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
      <Text
        style={{ fontSize: s(13), fontWeight: "500", color: colors.heading }}
        numberOfLines={2}
      >
        {value || "—"}
      </Text>
    </View>
  </View>
  );
};

const ProfileInfoTab = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { employees, activeEmployeeId } = useEmployeeStore();
  const emp =
    employees.find((e) => e.id === activeEmployeeId) ||
    employees.find((e) => e.shiftStatus === "clocked_in");

  const user = emp
    ? {
        fullName: emp.fullName,
        dob: emp.dob || "—",
        gender: emp.gender
          ? emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1)
          : "—",
        country: emp.country || "—",
        address: emp.address || "—",
      }
    : MOCK_USER_PROFILE;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: s(24), paddingHorizontal: s(16), paddingTop: s(16) }}>
      {/* Section header */}
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
        Personal Details
      </Text>

      {/* Card */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <Field
          icon={<User size={s(15)} color={colors.teal} />}
          label="Full Name"
          value={user.fullName}
          scale={uiScale}
        />
        <Field
          icon={<Calendar size={s(15)} color={colors.teal} />}
          label="Date of Birth"
          value={user.dob}
          scale={uiScale}
        />
        <Field
          icon={<Users size={s(15)} color={colors.teal} />}
          label="Gender"
          value={user.gender}
          scale={uiScale}
        />
        <Field
          icon={<Globe size={s(15)} color={colors.teal} />}
          label="Country"
          value={user.country}
          scale={uiScale}
        />
        <Field
          icon={<MapPin size={s(15)} color={colors.teal} />}
          label="Address"
          value={user.address}
          last
          scale={uiScale}
        />
      </View>
    </ScrollView>
  );
};

export default ProfileInfoTab;
