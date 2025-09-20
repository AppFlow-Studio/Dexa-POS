import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useRouter } from "expo-router";
import { ArrowLeft, BarChart3, Save, TrendingUp } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface MetricOption {
  id: string;
  label: string;
  description: string;
}

interface DimensionOption {
  id: string;
  label: string;
  description: string;
}

const availableMetrics: MetricOption[] = [
  {
    id: "gross_sales",
    label: "Gross Sales",
    description: "Total sales before discounts",
  },
  { id: "net_sales", label: "Net Sales", description: "Sales after discounts" },
  {
    id: "discount_amount",
    label: "Discount Amount",
    description: "Total discount value",
  },
  { id: "tax_amount", label: "Tax Amount", description: "Total tax collected" },
  { id: "order_count", label: "Order Count", description: "Number of orders" },
  {
    id: "item_quantity",
    label: "Item Quantity",
    description: "Total items sold",
  },
  {
    id: "average_order_value",
    label: "Average Order Value",
    description: "Average value per order",
  },
];

const availableDimensions: DimensionOption[] = [
  { id: "item", label: "Item", description: "Break down by menu items" },
  {
    id: "category",
    label: "Category",
    description: "Break down by item categories",
  },
  {
    id: "employee",
    label: "Employee",
    description: "Break down by staff members",
  },
  { id: "hour", label: "Hour", description: "Break down by hour of day" },
  { id: "day", label: "Day", description: "Break down by day of week" },
  {
    id: "payment_method",
    label: "Payment Method",
    description: "Break down by payment type",
  },
];

const CustomReportBuilderScreen = () => {
  const router = useRouter();
  const { saveCustomReport } = useAnalyticsStore();

  const [reportName, setReportName] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedBreakdown, setSelectedBreakdown] = useState<string>("");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId)
        ? prev.filter((id) => id !== metricId)
        : [...prev, metricId]
    );
  };

  const handleRunReport = () => {
    if (!reportName.trim()) {
      Alert.alert("Error", "Please enter a report name");
      return;
    }

    if (selectedMetrics.length === 0) {
      Alert.alert("Error", "Please select at least one metric");
      return;
    }

    if (!selectedBreakdown) {
      Alert.alert("Error", "Please select a breakdown dimension");
      return;
    }

    const customConfig = {
      name: reportName,
      metrics: selectedMetrics,
      breakdown: selectedBreakdown,
      chartType,
    };
  };

  const handleSaveReport = () => {
    if (!reportName.trim()) {
      Alert.alert("Error", "Please enter a report name");
      return;
    }

    if (selectedMetrics.length === 0) {
      Alert.alert("Error", "Please select at least one metric");
      return;
    }

    if (!selectedBreakdown) {
      Alert.alert("Error", "Please select a breakdown dimension");
      return;
    }

    const customConfig = {
      name: reportName,
      metrics: selectedMetrics,
      breakdown: selectedBreakdown,
      chartType,
      filters: {
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
    };

    saveCustomReport(customConfig);
    Alert.alert("Success", "Report saved successfully!", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <ArrowLeft color="#9CA3AF" size={24} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-white">
            Custom Report Builder
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="p-6">
        {/* Report Name */}
        <View className="mb-8">
          <Text className="text-xl font-bold text-white mb-4">Report Name</Text>
          <View className="bg-[#303030] border border-gray-600 rounded-xl p-4">
            <TextInput
              value={reportName}
              onChangeText={setReportName}
              placeholder="Enter report name..."
              placeholderTextColor="#9CA3AF"
              className="text-white text-lg px-6 py-4"
            />
          </View>
        </View>

        {/* Metrics Selection */}
        <View className="mb-8">
          <Text className="text-xl font-bold text-white mb-4">
            Select Metrics ({selectedMetrics.length} selected)
          </Text>
          <Text className="text-gray-400 mb-4">
            Choose the data points you want to analyze
          </Text>

          <View className="gap-y-3">
            {availableMetrics.map((metric) => (
              <TouchableOpacity
                key={metric.id}
                onPress={() => handleMetricToggle(metric.id)}
                className={`p-4 rounded-xl border ${
                  selectedMetrics.includes(metric.id)
                    ? "bg-blue-900/30 border-blue-500"
                    : "bg-[#303030] border-gray-600"
                }`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={`text-lg font-semibold ${
                        selectedMetrics.includes(metric.id)
                          ? "text-blue-400"
                          : "text-white"
                      }`}
                    >
                      {metric.label}
                    </Text>
                    <Text className="text-sm text-gray-400 mt-1">
                      {metric.description}
                    </Text>
                  </View>
                  <View
                    className={`w-6 h-6 rounded-full border-2 ${
                      selectedMetrics.includes(metric.id)
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-400"
                    }`}
                  >
                    {selectedMetrics.includes(metric.id) && (
                      <View className="w-full h-full rounded-full bg-blue-500" />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Breakdown Selection */}
        <View className="mb-8">
          <Text className="text-xl font-bold text-white mb-4">
            Breakdown Dimension
          </Text>
          <Text className="text-gray-400 mb-4">
            Choose how to group and analyze your data
          </Text>

          <View className="gap-y-3">
            {availableDimensions.map((dimension) => (
              <TouchableOpacity
                key={dimension.id}
                onPress={() => setSelectedBreakdown(dimension.id)}
                className={`p-4 rounded-xl border ${
                  selectedBreakdown === dimension.id
                    ? "bg-blue-900/30 border-blue-500"
                    : "bg-[#303030] border-gray-600"
                }`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={`text-lg font-semibold ${
                        selectedBreakdown === dimension.id
                          ? "text-blue-400"
                          : "text-white"
                      }`}
                    >
                      {dimension.label}
                    </Text>
                    <Text className="text-sm text-gray-400 mt-1">
                      {dimension.description}
                    </Text>
                  </View>
                  <View
                    className={`w-6 h-6 rounded-full border-2 ${
                      selectedBreakdown === dimension.id
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-400"
                    }`}
                  >
                    {selectedBreakdown === dimension.id && (
                      <View className="w-full h-full rounded-full bg-blue-500" />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chart Type Selection */}
        <View className="mb-8">
          <Text className="text-xl font-bold text-white mb-4">Chart Type</Text>
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={() => setChartType("bar")}
              className={`flex-1 p-4 rounded-xl border ${
                chartType === "bar"
                  ? "bg-blue-900/30 border-blue-500"
                  : "bg-[#303030] border-gray-600"
              }`}
              activeOpacity={0.8}
            >
              <View className="items-center">
                <BarChart3
                  color={chartType === "bar" ? "#60A5FA" : "#9CA3AF"}
                  size={32}
                />
                <Text
                  className={`text-lg font-semibold mt-2 ${
                    chartType === "bar" ? "text-blue-400" : "text-white"
                  }`}
                >
                  Bar Chart
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setChartType("line")}
              className={`flex-1 p-4 rounded-xl border ${
                chartType === "line"
                  ? "bg-blue-900/30 border-blue-500"
                  : "bg-[#303030] border-gray-600"
              }`}
              activeOpacity={0.8}
            >
              <View className="items-center">
                <TrendingUp
                  color={chartType === "line" ? "#60A5FA" : "#9CA3AF"}
                  size={32}
                />
                <Text
                  className={`text-lg font-semibold mt-2 ${
                    chartType === "line" ? "text-blue-400" : "text-white"
                  }`}
                >
                  Line Chart
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-4 mt-8">
          <TouchableOpacity
            onPress={handleRunReport}
            className="flex-1 bg-blue-600 py-4 rounded-xl items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white text-lg font-semibold">Run Report</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSaveReport}
            className="flex-1 bg-[#303030] border border-gray-600 py-4 rounded-xl items-center"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center">
              <Save color="#9CA3AF" size={20} />
              <Text className="text-white text-lg font-semibold ml-2">
                Save Report
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default CustomReportBuilderScreen;
