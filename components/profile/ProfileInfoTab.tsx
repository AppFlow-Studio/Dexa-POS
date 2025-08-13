import { MOCK_USER_PROFILE } from "@/lib/mockData";
import React from "react";
import { Text, View } from "react-native";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View className="mb-4">
    <Text className="text-accent-500 mb-1">{label}</Text>
    <Text className="text-base font-medium text-accent-500">{value}</Text>
  </View>
);

const ProfileInfoTab = () => {
  const user = MOCK_USER_PROFILE;
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
