import AnimatedDonutChart from "@/components/analytics/AnimatedDonutChart";
import SalesLineChart from "@/components/analytics/SalesLineChart";
import StatCard from "@/components/analytics/StatCard";
import TopItemsBarChart from "@/components/analytics/TopItemsBarChart";
import TrackOrderSection from "@/components/analytics/TrackOrderSection";
import { DollarSign, ShoppingBasket, Tag, Trophy } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

const checksData = [
  { value: 77.81, label: "Closed", color: "#3b82f6" }, // Blue
  { value: 22.19, label: "Open", color: "#f97316" }, // Orange
];

const checkStatusData = [
  { value: 56.2, label: "Completed", color: "#22c55e" }, // Green
  { value: 34.5, label: "Pending", color: "#3b82f6" }, // Blue
  { value: 9.3, label: "In Progress", color: "#94a3b8" }, // Gray
];

const DashboardCard: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = "" }) => (
  <View
    className={`bg-white p-6 rounded-2xl border border-gray-200 ${className}`}
  >
    <Text className="text-xl font-bold text-gray-800">{title}</Text>
    <View className="mt-4">{children}</View>
  </View>
);

const AnalyticsScreen = () => {
  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="p-6 pt-0">
        {/* Top Stat Cards */}
        <View className="flex-row gap-4 mt-4">
          <StatCard
            title="Total Earning Today"
            value="$9856"
            change="+2.4%"
            changeType="increase"
            icon={<DollarSign color="#3b82f6" />}
          />
          <StatCard
            title="Items Sold"
            value="546"
            change="+1.8%"
            changeType="increase"
            icon={<ShoppingBasket color="#3b82f6" />}
          />
          <StatCard
            title="Total Discount"
            value="$75.86"
            change="3.8% of revenue"
            changeType="increase"
            icon={<Tag color="#3b82f6" />}
          />
          <StatCard
            title="Top Item"
            value="Deluxe Crispyburger"
            change="+1.8% than yesterday"
            changeType="increase"
            icon={<Trophy color="#3b82f6" />}
          />
        </View>

        {/* Main Charts Row */}
        <View className="flex-row gap-4 mt-4">
          {/* Sales Chart */}
          <DashboardCard title="Today vs Yesterday Sales" className="flex-[2]">
            <SalesLineChart />
          </DashboardCard>
          {/* Open Checks Chart */}
          <DashboardCard title="Open vs Closed Checks" className="flex-1">
            <View className="h-[200px] m-auto">
              <AnimatedDonutChart
                data={checksData}
                size={200}
                strokeWidth={25}
              />
            </View>
            <View className="mt-4 space-y-2">
              {checksData.map((item) => (
                <View
                  key={item.label}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-row items-center">
                    <View
                      className="w-2.5 h-2.5 rounded-full mr-2"
                      style={{ backgroundColor: item.color }}
                    />
                    <Text className="text-gray-600">{item.label}</Text>
                  </View>
                  <Text className="font-semibold text-gray-800">
                    {item.value}%
                  </Text>
                </View>
              ))}
            </View>
          </DashboardCard>
        </View>

        {/* Bottom Charts Row */}
        <View className="flex-row gap-4 mt-4">
          {/* Check Status Chart */}
          <DashboardCard title="Check Status Overview" className="flex-2">
            {/* This parent View is left alone, so the chart renders correctly */}
            <View className="h-[200px]">
              <AnimatedDonutChart
                data={checkStatusData}
                size={200}
                strokeWidth={30}
              />

              {/* 👇 The fix is applied here. This container now fills the parent and centers the text. */}
              <View className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center">
                <Text className="text-5xl font-bold text-gray-800">57%</Text>
              </View>
            </View>

            {/* Legend below the chart */}
            <View className="mt-4 space-y-2">
              {checkStatusData.map((item) => (
                <View
                  key={item.label}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-row items-center">
                    <View
                      className="w-2.5 h-2.5 rounded-full mr-2"
                      style={{ backgroundColor: item.color }}
                    />
                    <Text className="text-gray-600">{item.label}</Text>
                  </View>
                  <Text className="font-semibold text-gray-800">
                    {item.value.toFixed(2)}%
                  </Text>
                </View>
              ))}
            </View>
          </DashboardCard>
          {/* Top Items Chart */}
          <DashboardCard title="Top Selling Items" className="flex-1">
            <TopItemsBarChart />
          </DashboardCard>
        </View>

        {/* Track Order Section */}
        <View className="mt-6">
          <TrackOrderSection />
        </View>
      </ScrollView>
    </View>
  );
};

export default AnalyticsScreen;
