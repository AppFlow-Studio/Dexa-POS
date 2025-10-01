import { MOCK_USER_PROFILE } from "@/lib/mockData";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import React from "react";
import { Text, View } from "react-native";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View className="mb-3">
    <Text className="text-lg text-accent-100 mb-0.5">{label}</Text>
    <Text className="text-xl font-medium text-accent-100">{value}</Text>
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
    <View className="space-y-4">
      <DetailRow label="Full Name" value={user.fullName} />
      <DetailRow label="Date of birth" value={user.dob} />
      <DetailRow label="Gender" value={user.gender} />
      <DetailRow label="Country" value={user.country} />
      <DetailRow label="Address" value={user.address} />
    </View>
  );
};

export default ProfileInfoTab;
