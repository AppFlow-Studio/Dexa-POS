import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { Building2, Database, Receipt, Settings, User } from "lucide-react-native";
import React from 'react';
import { Text, View } from 'react-native';

const Modifiers = () => {
  const basicSubsections = [
    {
      id: "store-info",
      title: "Store Info",
      subtitle: "Business Details",
      route: "/settings/basic/store-info",
      icon: <Building2 color="#3b82f6" size={20} />,
    },
    {
      id: "my-profile",
      title: "My Profile",
      subtitle: "Personal Settings",
      route: "/settings/basic/my-profile",
      icon: <User color="#3b82f6" size={20} />,
    },
    {
      id: "category",
      title: "Categories",
      subtitle: "Menu Categories",
      route: "/settings/basic/category",
      icon: <Database color="#3b82f6" size={20} />,
    },
    {
      id: "modifiers",
      title: "Modifiers",
      subtitle: "Item Customizations",
      route: "/settings/basic/modifiers",
      icon: <Settings color="#3b82f6" size={20} />,
    },
    {
      id: "taxes",
      title: "Taxes",
      subtitle: "Tax Configuration",
      route: "/settings/basic/taxes",
      icon: <Receipt color="#3b82f6" size={20} />,
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Basic Settings"
          subsections={basicSubsections}
          currentRoute="/settings/basic/modifiers"
        />

        {/* Main Content */}
        <View className="flex-1 bg-white rounded-2xl border border-gray-200 p-6">
          <Text className="text-xl font-bold text-gray-800">Item Modifiers</Text>
          <Text className="text-gray-600 mt-2">Configure item customizations and modifiers.</Text>
        </View>
      </View>
    </View>
  )
}

export default Modifiers