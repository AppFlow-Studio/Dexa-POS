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
  <View className="flex-row items-center justify-between py-4 border-b border-gray-100">
    <View>
      <Text className="text-sm text-gray-500 mb-1">{label}</Text>
      <Text className="text-base font-semibold text-gray-800">{value}</Text>
    </View>
    <TouchableOpacity
      onPress={onActionPress}
      className="py-2 px-4 border border-gray-300 rounded-lg"
    >
      <Text className="font-bold text-gray-700">{actionText}</Text>
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
    <View className="space-y-4">
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
