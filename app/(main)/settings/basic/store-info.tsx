import SettingsSidebar from "@/components/settings/SettingsSidebar";
import {
  Building2,
  Database,
  Receipt,
  Settings,
  User,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

const StoreInfo = () => {
  const basicSubsections = [
    {
      id: "store-info",
      title: "Store Info",
      subtitle: "Business Details",
      route: "/settings/basic/store-info",
      icon: <Building2 color="#3b82f6" size={24} />,
    },
    {
      id: "my-profile",
      title: "My Profile",
      subtitle: "Personal Settings",
      route: "/settings/basic/my-profile",
      icon: <User color="#3b82f6" size={24} />,
    },
    {
      id: "category",
      title: "Categories",
      subtitle: "Menu Categories",
      route: "/settings/basic/category",
      icon: <Database color="#3b82f6" size={24} />,
    },
    {
      id: "modifiers",
      title: "Modifiers",
      subtitle: "Item Customizations",
      route: "/settings/basic/modifiers",
      icon: <Settings color="#3b82f6" size={24} />,
    },
    {
      id: "taxes",
      title: "Taxes",
      subtitle: "Tax Configuration",
      route: "/settings/basic/taxes",
      icon: <Receipt color="#3b82f6" size={24} />,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Basic Settings"
          subsections={basicSubsections}
          currentRoute="/settings/basic/store-info"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-6">
          <Text className="text-3xl font-bold text-white">
            Store Information
          </Text>
          <Text className="text-xl text-gray-300 mt-2">
            Configure your business details and store information.
          </Text>
        </View>
      </View>
    </View>
  );
};

export default StoreInfo;
