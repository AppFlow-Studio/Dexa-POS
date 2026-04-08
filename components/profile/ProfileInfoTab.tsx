import { MOCK_USER_PROFILE } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Calendar, MapPin, User, Users, Globe } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const Field = ({
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
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.border,
      gap: 12,
    }}
  >
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
      <Text
        style={{ fontSize: 13, fontWeight: "500", color: colors.heading }}
        numberOfLines={2}
      >
        {value || "—"}
      </Text>
    </View>
  </View>
);

const ProfileInfoTab = () => {
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
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16, paddingTop: 16 }}>
      {/* Section header */}
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
        Personal Details
      </Text>

      {/* Card */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <Field
          icon={<User size={15} color={colors.teal} />}
          label="Full Name"
          value={user.fullName}
        />
        <Field
          icon={<Calendar size={15} color={colors.teal} />}
          label="Date of Birth"
          value={user.dob}
        />
        <Field
          icon={<Users size={15} color={colors.teal} />}
          label="Gender"
          value={user.gender}
        />
        <Field
          icon={<Globe size={15} color={colors.teal} />}
          label="Country"
          value={user.country}
        />
        <Field
          icon={<MapPin size={15} color={colors.teal} />}
          label="Address"
          value={user.address}
          last
        />
      </View>
    </ScrollView>
  );
};

export default ProfileInfoTab;
