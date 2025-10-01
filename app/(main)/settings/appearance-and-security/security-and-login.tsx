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
    <View className="flex-1 p-4 bg-[#212121]">
      <View className="flex-1 gap-y-4">
        <View className="bg-[#303030] p-4 rounded-2xl border border-gray-600">
          <SettingsHeader
            title="End Screen Lock"
            value={isScreenLockEnabled}
            onValueChange={setScreenLockEnabled}
          />
          {isScreenLockEnabled && (
            <View className="mt-3 bg-[#212121] p-4 rounded-lg flex-row items-center gap-3">
              <Text className="text-xl font-semibold text-white mb-2">
                Lock After
              </Text>
              <Select
                value={lockAfter}
                onValueChange={(option) => option && setLockAfter(option)}
                className="flex-1"
              >
                <SelectTrigger className="flex-grow p-3 bg-[#303030] rounded-lg flex-row items-center border-gray-600">
                  <SelectValue
                    placeholder="Select..."
                    className="text-xl text-white h-7"
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
                        <Text className="text-xl text-white">{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          )}
        </View>

        <View className="bg-[#303030] p-4 rounded-2xl border border-gray-600">
          <SettingsHeader
            title="Switch User"
            value={isSwitchUserEnabled}
            onValueChange={setSwitchUserEnabled}
          />
          {isSwitchUserEnabled && (
            <View className="mt-3 flex-row justify-between items-center p-4 bg-[#212121] rounded-lg">
              <View className="flex-row items-center">
                <Image
                  source={require("@/assets/images/tom_hardy.jpg")}
                  className="w-10 h-10 rounded-full"
                />
                <Text className="text-xl font-bold text-white ml-2">
                  Jessica
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSwitchModalOpen(true)}
                className="flex-row items-center gap-1.5 py-2 px-4 border border-gray-500 rounded-lg"
              >
                <LogOut color="#9CA3AF" size={20} />
                <Text className="text-xl font-bold text-gray-300">Switch</Text>
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
