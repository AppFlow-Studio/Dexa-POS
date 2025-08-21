// src/screens/SalesSummaryScreen.tsx

import OrderAcceptanceChart from "@/components/settings/end-of-day/OrderAcceptanceChart";
import TotalItemsSoldChart from "@/components/settings/end-of-day/TotalItemsSoldChart";
import { Briefcase, DollarSign, FileText } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const StatCard = ({
  title,
  value,
  change,
  icon,
}: {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
}) => (
  <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
    <View className="flex-row justify-between items-center">
      <Text className="text-gray-600">{title}</Text>
      <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center">
        {icon}
      </View>
    </View>
    <Text className="text-3xl font-bold text-gray-800 mt-2">{value}</Text>
    <Text className="text-sm text-green-600">{change}</Text>
  </View>
);
const DashboardCard: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = "" }) => (
  <View
    className={`bg-white p-6 rounded-2xl border border-gray-200 shadow-sm ${className}`}
  >
    <Text className="text-xl font-bold text-gray-800">{title}</Text>
    <View className="mt-4">{children}</View>
  </View>
);
// ---

const SalesSummaryScreen = () => {
  return (
    <View className="flex-1 bg-background-300">
      <ScrollView contentContainerClassName="p-6">
        {/* Top Stat Cards */}
        <View className="flex-row gap-4">
          <StatCard
            title="Total Earning"
            value="$9856"
            change="+2.4% than yesterday"
            icon={<DollarSign size={16} color="#3b82f6" />}
          />
          <StatCard
            title="Items Sold"
            value="546"
            change="+1.8% than yesterday"
            icon={<Briefcase size={16} color="#3b82f6" />}
          />
          <StatCard
            title="Total Order"
            value="23"
            change="-1.5% than yesterday"
            icon={<FileText size={16} color="#3b82f6" />}
          />
        </View>

        {/* Main Charts Row */}
        <View className="flex-row gap-4 mt-4">
          <DashboardCard title="Order Acceptance" className="flex-[2]">
            <OrderAcceptanceChart />
          </DashboardCard>
          <DashboardCard title="Total Items Sold" className="flex-1">
            <TotalItemsSoldChart />
          </DashboardCard>
        </View>
      </ScrollView>
    </View>
  );
};

export default SalesSummaryScreen;
