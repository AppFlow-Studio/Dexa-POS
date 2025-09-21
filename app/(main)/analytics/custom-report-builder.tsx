import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useRouter } from "expo-router";
import { ArrowLeft, BarChart3, PieChart, Save, TrendingUp } from "lucide-react-native";
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
    id: "revenue",
    label: "Revenue",
    description: "Total sales revenue (salePrice × quantitySold)",
  },
  {
    id: "cost_of_goods",
    label: "Cost of Goods",
    description: "Total cost of goods sold",
  },
  {
    id: "gross_margin",
    label: "Gross Margin",
    description: "Revenue minus cost of goods",
  },
  {
    id: "order_count",
    label: "Order Count",
    description: "Number of unique orders"
  },
  {
    id: "item_quantity",
    label: "Item Quantity",
    description: "Total items sold",
  },
  {
    id: "average_order_value",
    label: "Average Order Value",
    description: "Average revenue per order",
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
  {
    id: "date",
    label: "Date",
    description: "Break down by date",
  },
];

const dateRangeOptions = [
  { id: "last_7_days", label: "Last 7 Days", days: 7 },
  { id: "last_30_days", label: "Last 30 Days", days: 30 },
  { id: "last_90_days", label: "Last 90 Days", days: 90 },
  { id: "this_month", label: "This Month", days: 0, isMonth: true },
  { id: "last_month", label: "Last Month", days: 0, isMonth: true, isLastMonth: true },
  { id: "this_year", label: "This Year", days: 0, isYear: true },
  { id: "custom", label: "Custom Range", days: 0, isCustom: true },
];

const CustomReportBuilderScreen = () => {
  const router = useRouter();
  const { saveCustomReport } = useAnalyticsStore();

  const [reportName, setReportName] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedBreakdown, setSelectedBreakdown] = useState<string>("");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [selectedDateRange, setSelectedDateRange] = useState<string>("last_30_days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId)
        ? prev.filter((id) => id !== metricId)
        : [...prev, metricId]
    );
  };

  // Helper function to calculate date range
  const calculateDateRange = () => {
    const now = new Date();
    const option = dateRangeOptions.find(opt => opt.id === selectedDateRange);

    if (!option) {
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      };
    }

    if (option.isCustom) {
      const startDate = customStartDate ? new Date(customStartDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = customEndDate ? new Date(customEndDate) : new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Validate that dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn('📊 Custom Report Builder: Invalid custom dates, using fallback');
        return {
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() + 24 * 60 * 60 * 1000)
        };
      }

      return { start: startDate, end: endDate };
    }

    if (option.isMonth) {
      const year = now.getFullYear();
      const month = option.isLastMonth ? now.getMonth() - 1 : now.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59);
      return { start: startDate, end: endDate };
    }

    if (option.isYear) {
      const year = now.getFullYear();
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      return { start: startDate, end: endDate };
    }

    // Default to days
    const startDate = new Date(now.getTime() - option.days * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Include today

    // Final validation to ensure we always return valid dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn('📊 Custom Report Builder: Invalid calculated dates, using fallback');
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      };
    }

    return { start: startDate, end: endDate };
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

    // Validate custom date range
    if (selectedDateRange === "custom") {
      if (!customStartDate || !customEndDate) {
        Alert.alert("Error", "Please enter both start and end dates for custom range");
        return;
      }

      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        Alert.alert("Error", "Please enter valid dates in YYYY-MM-DD format");
        return;
      }

      if (startDate >= endDate) {
        Alert.alert("Error", "Start date must be before end date");
        return;
      }
    }

    const dateRange = calculateDateRange();
    console.log('📊 Custom Report Builder: Calculated date range:', {
      start: dateRange.start?.toISOString(),
      end: dateRange.end?.toISOString(),
      startValid: dateRange.start instanceof Date,
      endValid: dateRange.end instanceof Date
    });

    const customConfig = {
      name: reportName,
      metrics: selectedMetrics,
      breakdown: selectedBreakdown,
      chartType,
      filters: {
        dateRange,
      },
    };

    // Save the report first
    saveCustomReport(customConfig);

    // Navigate to view the report
    router.push({
      pathname: '/analytics/report-view',
      params: {
        customReport: JSON.stringify(customConfig)
      }
    });
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

    // Validate custom date range
    if (selectedDateRange === "custom") {
      if (!customStartDate || !customEndDate) {
        Alert.alert("Error", "Please enter both start and end dates for custom range");
        return;
      }

      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        Alert.alert("Error", "Please enter valid dates in YYYY-MM-DD format");
        return;
      }

      if (startDate >= endDate) {
        Alert.alert("Error", "Start date must be before end date");
        return;
      }
    }

    const dateRange = calculateDateRange();
    console.log('📊 Custom Report Builder (Save): Calculated date range:', {
      start: dateRange.start?.toISOString(),
      end: dateRange.end?.toISOString(),
      startValid: dateRange.start instanceof Date,
      endValid: dateRange.end instanceof Date
    });

    const customConfig = {
      name: reportName,
      metrics: selectedMetrics,
      breakdown: selectedBreakdown,
      chartType,
      filters: {
        dateRange,
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
          <View className="bg-[#303030] border border-gray-600 h-26 rounded-xl p-4">
            <TextInput
              value={reportName}
              onChangeText={setReportName}
              placeholder="Enter report name..."
              placeholderTextColor="#9CA3AF"
              textAlignVertical="center"
              className="text-white text-2xl "
            />
          </View>
        </View>

        {/* Date Range Selection */}
        <View className="mb-8">
          <Text className="text-xl font-bold text-white mb-4">Date Range</Text>
          <Text className="text-gray-400 mb-4">
            Choose the time period for your report
          </Text>

          <View className="gap-y-3">
            {dateRangeOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                onPress={() => setSelectedDateRange(option.id)}
                className={`p-4 rounded-xl border ${selectedDateRange === option.id
                  ? "bg-blue-900/30 border-blue-500"
                  : "bg-[#303030] border-gray-600"
                  }`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={`text-lg font-semibold ${selectedDateRange === option.id
                        ? "text-blue-400"
                        : "text-white"
                        }`}
                    >
                      {option.label}
                    </Text>
                  </View>
                  <View
                    className={`w-6 h-6 rounded-full border-2 ${selectedDateRange === option.id
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-400"
                      }`}
                  >
                    {selectedDateRange === option.id && (
                      <View className="w-full h-full rounded-full bg-blue-500" />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Date Inputs */}
          {selectedDateRange === "custom" && (
            <View className="mt-4 gap-y-4">
              <View>
                <Text className="text-white text-lg mb-2">Start Date</Text>
                <TextInput
                  value={customStartDate}
                  onChangeText={setCustomStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  className="bg-[#303030] border border-gray-600 rounded-xl p-4 text-white text-lg"
                />
              </View>
              <View>
                <Text className="text-white text-lg mb-2">End Date</Text>
                <TextInput
                  value={customEndDate}
                  onChangeText={setCustomEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  className="bg-[#303030] border border-gray-600 rounded-xl p-4 text-white text-lg"
                />
              </View>
            </View>
          )}
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
                className={`p-4 rounded-xl border ${selectedMetrics.includes(metric.id)
                  ? "bg-blue-900/30 border-blue-500"
                  : "bg-[#303030] border-gray-600"
                  }`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={`text-lg font-semibold ${selectedMetrics.includes(metric.id)
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
                    className={`w-6 h-6 rounded-full border-2 ${selectedMetrics.includes(metric.id)
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
                className={`p-4 rounded-xl border ${selectedBreakdown === dimension.id
                  ? "bg-blue-900/30 border-blue-500"
                  : "bg-[#303030] border-gray-600"
                  }`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={`text-lg font-semibold ${selectedBreakdown === dimension.id
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
                    className={`w-6 h-6 rounded-full border-2 ${selectedBreakdown === dimension.id
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
              className={`flex-1 p-4 rounded-xl border ${chartType === "bar"
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
                  className={`text-lg font-semibold mt-2 ${chartType === "bar" ? "text-blue-400" : "text-white"
                    }`}
                >
                  Bar Chart
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setChartType("line")}
              className={`flex-1 p-4 rounded-xl border ${chartType === "line"
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
                  className={`text-lg font-semibold mt-2 ${chartType === "line" ? "text-blue-400" : "text-white"
                    }`}
                >
                  Line Chart
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setChartType("pie")}
              className={`flex-1 p-4 rounded-xl border ${chartType === "pie"
                ? "bg-blue-900/30 border-blue-500"
                : "bg-[#303030] border-gray-600"
                }`}
              activeOpacity={0.8}
            >
              <View className="items-center">
                <PieChart
                  color={chartType === "pie" ? "#60A5FA" : "#9CA3AF"}
                  size={32}
                />
                <Text
                  className={`text-lg font-semibold mt-2 ${chartType === "pie" ? "text-blue-400" : "text-white"
                    }`}
                >
                  Pie Chart
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Report Preview */}
        {reportName && selectedMetrics.length > 0 && selectedBreakdown && (
          <View className="mb-8">
            <Text className="text-xl font-bold text-white mb-4">Report Preview</Text>
            <View className="bg-[#303030] border border-gray-600 rounded-xl p-4">
              <Text className="text-lg font-semibold text-blue-400 mb-2">{reportName}</Text>
              <Text className="text-gray-400 mb-2">
                <Text className="text-white">Date Range:</Text> {dateRangeOptions.find(d => d.id === selectedDateRange)?.label}
              </Text>
              <Text className="text-gray-400 mb-2">
                <Text className="text-white">Metrics:</Text> {selectedMetrics.map(m =>
                  availableMetrics.find(metric => metric.id === m)?.label
                ).join(', ')}
              </Text>
              <Text className="text-gray-400 mb-2">
                <Text className="text-white">Breakdown:</Text> {availableDimensions.find(d => d.id === selectedBreakdown)?.label}
              </Text>
              <Text className="text-gray-400">
                <Text className="text-white">Chart Type:</Text> {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart
              </Text>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View className="flex-row gap-4 mt-8">
          <TouchableOpacity
            onPress={handleRunReport}
            className="flex-1 bg-blue-600 py-4 rounded-xl items-center"
            activeOpacity={0.8}
            disabled={!reportName || selectedMetrics.length === 0 || !selectedBreakdown}
            style={{ opacity: (!reportName || selectedMetrics.length === 0 || !selectedBreakdown) ? 0.5 : 1 }}
          >
            <Text className="text-white text-lg font-semibold">Run Report</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSaveReport}
            className="flex-1 bg-[#303030] border border-gray-600 py-4 rounded-xl items-center"
            activeOpacity={0.8}
            disabled={!reportName || selectedMetrics.length === 0 || !selectedBreakdown}
            style={{ opacity: (!reportName || selectedMetrics.length === 0 || !selectedBreakdown) ? 0.5 : 1 }}
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
