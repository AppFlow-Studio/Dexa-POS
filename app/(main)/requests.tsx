import ActivityFeedTab from "@/components/profile/ActivityFeedTab";
import DropRequestsTab from "@/components/profile/DropRequestsTab";
import SwapRequestsInTab from "@/components/profile/SwapRequestsInTab";
import SwapRequestsOutTab from "@/components/profile/SwapRequestsOutTab";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const StatCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) => (
  <View className="flex-1 bg-[#303030] p-4 rounded-2xl border border-gray-700">
    <View className="flex-row items-center gap-3 mb-2">{icon}</View>
    <Text className="text-2xl font-bold text-white">{value}</Text>
    <Text className="text-sm text-gray-400 mt-1">{label}</Text>
  </View>
);

const RequestsPage = () => {
  const [activeTab, setActiveTab] = useState("drops");

  const renderContent = () => {
    switch (activeTab) {
      case "drops":
        return <DropRequestsTab />;
      case "swaps-out":
        return <SwapRequestsOutTab />;
      case "swaps-in":
        return <SwapRequestsInTab />;
      case "activity":
        return <ActivityFeedTab />;
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row gap-4 mb-6">
        <StatCard
          label="Drop Requests"
          value="1"
          icon={<ArrowDownCircle size={20} color="#f59e0b" />}
        />
        <StatCard
          label="Swap Requests"
          value="1"
          icon={<ArrowRightLeft size={20} color="#3b82f6" />}
        />
        <StatCard
          label="Pending"
          value="2"
          icon={<AlertCircle size={20} color="#f59e0b" />}
        />
        <StatCard
          label="Completed"
          value="0"
          icon={<CheckCircle2 size={20} color="#22c55e" />}
        />
      </View>

      <View className="flex-row p-1 bg-[#303030] rounded-xl border border-gray-700 mb-6">
        <TouchableOpacity
          onPress={() => setActiveTab("drops")}
          className={`flex-1 py-2 rounded-lg items-center ${activeTab === "drops" ? "bg-blue-600" : ""}`}
        >
          <Text
            className={`font-semibold ${activeTab === "drops" ? "text-white" : "text-gray-400"}`}
          >
            Drop Requests
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("swaps-out")}
          className={`flex-1 py-2 rounded-lg items-center ${activeTab === "swaps-out" ? "bg-blue-600" : ""}`}
        >
          <Text
            className={`font-semibold ${activeTab === "swaps-out" ? "text-white" : "text-gray-400"}`}
          >
            Swap Requests (Out)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("swaps-in")}
          className={`flex-1 py-2 rounded-lg items-center ${activeTab === "swaps-in" ? "bg-blue-600" : ""}`}
        >
          <Text
            className={`font-semibold ${activeTab === "swaps-in" ? "text-white" : "text-gray-400"}`}
          >
            Swap Requests (In)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("activity")}
          className={`flex-1 py-2 rounded-lg items-center ${activeTab === "activity" ? "bg-blue-600" : ""}`}
        >
          <Text
            className={`font-semibold ${activeTab === "activity" ? "text-white" : "text-gray-400"}`}
          >
            Activity Feed
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView>{renderContent()}</ScrollView>
    </View>
  );
};

export default RequestsPage;
