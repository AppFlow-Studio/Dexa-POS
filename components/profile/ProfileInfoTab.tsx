import { MOCK_USER_PROFILE } from "@/lib/mockData";
import React from "react";
import { Text, View } from "react-native";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-1">
    <Text className="text-sm text-gray-500 mb-1">{label}</Text>
    <Text className="text-base font-semibold text-gray-800">{value}</Text>
  </View>
);

const ProfileInfoTab = () => {
  const user = MOCK_USER_PROFILE;
  return (
    <View className="space-y-6">
      <View className="flex-row gap-6">
        <DetailRow label="Full Name" value={user.fullName} />
        <DetailRow label="Date of birth" value={user.dob} />
      </View>
      <View className="flex-row gap-6">
        <DetailRow label="Gender" value={user.gender} />
        <DetailRow label="Country" value={user.country} />
      </View>
      <View className="flex-row gap-6">
        <DetailRow label="Address" value={user.address} />
        <View className="flex-1" />
      </View>
    </View>
  );
};

export default ProfileInfoTab;
