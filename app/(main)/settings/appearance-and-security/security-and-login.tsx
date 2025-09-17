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
import { LogOut } from "lucide-react-native";
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
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-1 gap-y-6">
        <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
          <SettingsHeader
            title="End Screen Lock"
            value={isScreenLockEnabled}
            onValueChange={setScreenLockEnabled}
          />
          {isScreenLockEnabled && (
            <View className="mt-4 bg-[#212121] p-6 rounded-lg flex-row items-center gap-4">
              <Text className="text-2xl font-semibold text-white mb-2">
                Lock After
              </Text>
              {/* 3. Use the correct Select implementation */}
              <Select
                value={lockAfter}
                onValueChange={(option) => option && setLockAfter(option)}
                className="flex-1"
              >
                <SelectTrigger className="flex-grow p-4 bg-[#303030] rounded-lg flex-row items-center border-gray-600">
                  <SelectValue
                    placeholder="Select time..."
                    className="text-2xl text-white"
                  />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {LOCK_AFTER_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        <Text className="text-2xl">{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          )}
        </View>

        <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
          <SettingsHeader
            title="Switch User"
            value={isSwitchUserEnabled}
            onValueChange={setSwitchUserEnabled}
          />
          {isSwitchUserEnabled && (
            <View className="mt-4 flex-row justify-between items-center p-6 bg-[#212121] rounded-lg">
              <View className="flex-row items-center">
                <Image
                  source={require("@/assets/images/tom_hardy.jpg")}
                  className="w-12 h-12 rounded-full"
                />
                <Text className="text-2xl font-bold text-white ml-3">
                  Jessica
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSwitchModalOpen(true)}
                className="flex-row items-center gap-2 py-3 px-6 border border-gray-500 rounded-lg"
              >
                <LogOut color="#9CA3AF" size={24} />
                <Text className="text-2xl font-bold text-gray-300">
                  Switch Account
                </Text>
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
