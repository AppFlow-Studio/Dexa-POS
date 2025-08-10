import Header from "@/components/Header";
import SettingsHeader from "@/components/settings/SettingsHeader";
// 1. Import the Select primitives correctly
import SwitchAccountModal from "@/components/settings/security-and-login/SwitchAccountModal";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, LogOut } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Define the type for the select options
type SelectOption = { label: string; value: string };

const LOCK_AFTER_OPTIONS: SelectOption[] = [
  { label: "1 Minute", value: "1" },
  { label: "5 Minutes", value: "5" },
  { label: "15 Minutes", value: "15" },
  { label: "Never", value: "0" },
];

const SecurityAndLoginScreen = () => {
  const [isScreenLockEnabled, setScreenLockEnabled] = useState(true);
  // 2. State now correctly holds the SelectOption object
  const [lockAfter, setLockAfter] = useState<SelectOption>(
    LOCK_AFTER_OPTIONS[0]
  );
  const [isSwitchUserEnabled, setSwitchUserEnabled] = useState(true);
  const [isSwitchModalOpen, setSwitchModalOpen] = useState(false);

  // Get insets for the dropdown menu
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <Header />
      <Text className="text-3xl font-bold text-gray-800 my-4">
        Security and Login
      </Text>

      <View className="flex-1 space-y-6">
        <View className="bg-white p-6 rounded-2xl border border-gray-200">
          <SettingsHeader
            title="End Screen Lock"
            value={isScreenLockEnabled}
            onValueChange={setScreenLockEnabled}
          />
          {isScreenLockEnabled && (
            <View className="mt-4">
              <Text className="font-semibold text-gray-700 mb-2">
                Lock After
              </Text>
              {/* 3. Use the correct Select implementation */}
              <Select
                value={lockAfter}
                onValueChange={(option) => option && setLockAfter(option)}
              >
                <SelectTrigger className="w-full p-3 bg-gray-100 rounded-lg flex-row justify-between items-center">
                  <SelectValue
                    placeholder="Select time..."
                    className="text-base text-gray-800"
                  />
                  <ChevronDown color="#6b7280" size={20} />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {LOCK_AFTER_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          )}
        </View>

        {/* ... Switch User Card is unchanged ... */}
        <View className="bg-white p-6 rounded-2xl border border-gray-200">
          <SettingsHeader
            title="Switch User"
            value={isSwitchUserEnabled}
            onValueChange={setSwitchUserEnabled}
          />
          {isSwitchUserEnabled && (
            <View className="mt-4 flex-row justify-between items-center p-4 bg-gray-50 rounded-lg">
              <View className="flex-row items-center">
                <Image
                  source={require("@/assets/images/tom_hardy.jpg")}
                  className="w-10 h-10 rounded-full"
                />
                <Text className="font-bold text-gray-800 ml-3">Jessica</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSwitchModalOpen(true)}
                className="flex-row items-center space-x-2 py-2 px-4 border border-gray-300 rounded-lg"
              >
                <LogOut color="#4b5563" size={16} />
                <Text className="font-bold text-gray-700">Switch Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <SwitchAccountModal
        isOpen={isSwitchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
      />
    </View>
  );
};

export default SecurityAndLoginScreen;
