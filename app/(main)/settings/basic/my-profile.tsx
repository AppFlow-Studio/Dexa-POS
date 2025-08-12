import HistoryTab from "@/components/profile/HistoryTab";
import ProfileCard from "@/components/profile/ProfileCard";
import ProfileInfoTab from "@/components/profile/ProfileInfoTab";
import SecurityTab from "@/components/profile/SecurityTab";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type TabName = "Profile Info" | "Security" | "History";
const TABS: TabName[] = ["Profile Info", "Security", "History"];

const MyProfileScreen = () => {
  const [activeTab, setActiveTab] = useState<TabName>("Profile Info");

  const renderContent = () => {
    switch (activeTab) {
      case "Profile Info":
        return <ProfileInfoTab />;
      case "Security":
        return <SecurityTab />;
      case "History":
        return <HistoryTab />;
      default:
        return <ProfileInfoTab />;
    }
  };

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <View className="flex-1 bg-white p-6 rounded-2xl border border-gray-200">
        {/* Tab Bar */}
        <View className="bg-gray-100 p-1 rounded-xl flex-row self-start">
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`py-2 px-6 rounded-lg ${activeTab === tab ? "bg-white" : ""}`}
            >
              <Text
                className={`font-semibold ${activeTab === tab ? "text-primary-400" : "text-gray-500"}`}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content Area */}
        <View className="flex-row flex-1 mt-6">
          {/* Left: Shared Profile Card */}
          <ProfileCard />

          {/* Right: Tab-Specific Content */}
          <View className="flex-1 ml-6">{renderContent()}</View>
        </View>

        {/* Footer */}
        <View className="flex-row justify-end gap-2 pt-4 border-t border-gray-200">
          <TouchableOpacity className="px-6 py-3 border border-gray-300 rounded-lg">
            <Text className="font-bold text-gray-700">Close</Text>
          </TouchableOpacity>
          {activeTab === "Profile Info" && (
            <TouchableOpacity className="px-8 py-3 bg-primary-400 rounded-lg">
              <Text className="font-bold text-white">Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default MyProfileScreen;
