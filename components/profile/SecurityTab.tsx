import { MOCK_USER_PROFILE } from "@/lib/mockData";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Reusable component for each row in the security tab
const SecurityDetailRow = ({
  label,
  value,
  actionText,
  onActionPress,
}: {
  label: string;
  value: string;
  actionText: string;
  onActionPress: () => void;
}) => (
  <View className="flex-row items-center justify-between py-4 border-b border-gray-700">
    <View>
      <Text className="text-xl text-gray-300 mb-1">{label}</Text>
      <Text className="text-2xl font-semibold text-white">{value}</Text>
    </View>
    <TouchableOpacity
      onPress={onActionPress}
      className="py-3 px-6 border border-gray-600 rounded-lg bg-[#212121]"
    >
      <Text className="font-bold text-xl text-gray-300">{actionText}</Text>
    </TouchableOpacity>
  </View>
);

const SecurityTab = () => {
  const user = MOCK_USER_PROFILE;

  // Placeholder functions for the "Change" buttons
  const handleChangeEmail = () => alert("Change Email Clicked");
  const handleChangePhone = () => alert("Change Phone Clicked");
  const handleChangePassword = () => alert("Change Password Clicked");

  return (
    <View className="space-y-6">
      <SecurityDetailRow
        label="Full Name" // Note: The design shows "Full Name", but it's likely meant to be "Email"
        value={user.email}
        actionText="Change Email"
        onActionPress={handleChangeEmail}
      />
      <SecurityDetailRow
        label="Phone Number"
        value={user.phone}
        actionText="Change Phone Number"
        onActionPress={handleChangePhone}
      />
      <SecurityDetailRow
        label="Pin"
        value={"●".repeat(user.pin.length)} // Use dots for security
        actionText="Change Password" // The button says "Password", not "Pin"
        onActionPress={handleChangePassword}
      />
    </View>
  );
};

export default SecurityTab;
