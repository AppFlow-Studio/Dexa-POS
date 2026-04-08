import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  BarChart3,
  PieChart,
  Save,
  TrendingUp,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
    description: "Number of unique orders",
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
  { id: "vendor", label: "Vendor", description: "Break down by vendor" },
];

const dateRangeOptions = [
  { id: "last_7_days", label: "Last 7 Days", days: 7 },
  { id: "last_30_days", label: "Last 30 Days", days: 30 },
  { id: "last_90_days", label: "Last 90 Days", days: 90 },
  { id: "this_month", label: "This Month", days: 0, isMonth: true },
  {
    id: "last_month",
    label: "Last Month",
    days: 0,
    isMonth: true,
    isLastMonth: true,
  },
  { id: "this_year", label: "This Year", days: 0, isYear: true },
  { id: "custom", label: "Custom Range", days: 0, isCustom: true },
];

const CustomReportBuilderScreen = () => {
  const router = useRouter();
  const { saveCustomReport, generateCustomReport, salesData } =
    useAnalyticsStore();

  const [reportName, setReportName] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedBreakdown, setSelectedBreakdown] = useState<string>("");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [selectedDateRange, setSelectedDateRange] =
    useState<string>("last_30_days");
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
    const option = dateRangeOptions.find((opt) => opt.id === selectedDateRange);

    if (!option) {
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      };
    }

    if (option.isCustom) {
      const startDate = customStartDate
        ? new Date(customStartDate)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = customEndDate
        ? new Date(customEndDate)
        : new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Validate that dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn(
          "📊 Custom Report Builder: Invalid custom dates, using fallback"
        );
        return {
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() + 24 * 60 * 60 * 1000),
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
    const startDate = new Date(
      now.getTime() - option.days * 24 * 60 * 60 * 1000
    );
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Include today

    // Final validation to ensure we always return valid dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn(
        "📊 Custom Report Builder: Invalid calculated dates, using fallback"
      );
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() + 24 * 60 * 60 * 1000),
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
        Alert.alert(
          "Error",
          "Please enter both start and end dates for custom range"
        );
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
    console.log("📊 Custom Report Builder: Calculated date range:", {
      start: dateRange.start?.toISOString(),
      end: dateRange.end?.toISOString(),
      startValid: dateRange.start instanceof Date,
      endValid: dateRange.end instanceof Date,
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

    console.log(
      generateCustomReport(
        { ...customConfig, chartType, id: "1", createdAt: new Date() },
        salesData
      )
    );

    // Save the report first
    saveCustomReport(customConfig);

    // Navigate to view the report
    router.push({
      pathname: "/analytics/report-view",
      params: {
        customReport: JSON.stringify(customConfig),
      },
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
        Alert.alert(
          "Error",
          "Please enter both start and end dates for custom range"
        );
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
    console.log("📊 Custom Report Builder (Save): Calculated date range:", {
      start: dateRange.start?.toISOString(),
      end: dateRange.end?.toISOString(),
      startValid: dateRange.start instanceof Date,
      endValid: dateRange.end instanceof Date,
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

  const isFormValid = !!(reportName && selectedMetrics.length > 0 && selectedBreakdown);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <View className="flex-1 bg-screen">
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.panel
          }}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                marginRight: 10,
                padding: 6,
                backgroundColor: colors.teal + '10',
                borderRadius: 10
              }}
            >
              <ArrowLeft color={colors.teal} size={16} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
              Custom Report Builder
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14 }}>
          {/* Report Name */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
              Report Name
            </Text>
            <TextInput
              value={reportName}
              onChangeText={setReportName}
              placeholder="Enter report name..."
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: colors.heading,
                fontSize: 13
              }}
            />
          </View>

          {/* Date Range Selection */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 4 }}>
              Date Range
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
              Choose the time period for your report
            </Text>

            <View className="gap-y-2">
              {dateRangeOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => setSelectedDateRange(option.id)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selectedDateRange === option.id ? colors.teal + '50' : colors.border,
                    backgroundColor: selectedDateRange === option.id ? colors.teal + '15' : colors.panel
                  }}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: selectedDateRange === option.id ? colors.teal : colors.heading
                        }}
                      >
                        {option.label}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: selectedDateRange === option.id ? colors.teal : colors.border,
                        backgroundColor: selectedDateRange === option.id ? colors.teal : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Date Inputs */}
            {selectedDateRange === "custom" && (
              <View style={{ marginTop: 12, gap: 10 }}>
                <View>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Start Date</Text>
                  <TextInput
                    value={customStartDate}
                    onChangeText={setCustomStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      color: colors.heading,
                      fontSize: 13
                    }}
                  />
                </View>
                <View>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>End Date</Text>
                  <TextInput
                    value={customEndDate}
                    onChangeText={setCustomEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      color: colors.heading,
                      fontSize: 13
                    }}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Metrics Selection */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 4 }}>
              Select Metrics ({selectedMetrics.length} selected)
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
              Choose the data points you want to analyze
            </Text>

            <View className="gap-y-2">
              {availableMetrics.map((metric) => (
                <TouchableOpacity
                  key={metric.id}
                  onPress={() => handleMetricToggle(metric.id)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selectedMetrics.includes(metric.id) ? colors.teal + '50' : colors.border,
                    backgroundColor: selectedMetrics.includes(metric.id) ? colors.teal + '15' : colors.panel
                  }}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: selectedMetrics.includes(metric.id) ? colors.teal : colors.heading
                        }}
                      >
                        {metric.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {metric.description}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: selectedMetrics.includes(metric.id) ? colors.teal : colors.border,
                        backgroundColor: selectedMetrics.includes(metric.id) ? colors.teal : 'transparent'
                      }}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Breakdown Selection */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 4 }}>
              Breakdown Dimension
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
              Choose how to group and analyze your data
            </Text>

            <View className="gap-y-2">
              {availableDimensions.map((dimension) => (
                <TouchableOpacity
                  key={dimension.id}
                  onPress={() => setSelectedBreakdown(dimension.id)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selectedBreakdown === dimension.id ? colors.teal + '50' : colors.border,
                    backgroundColor: selectedBreakdown === dimension.id ? colors.teal + '15' : colors.panel
                  }}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: selectedBreakdown === dimension.id ? colors.teal : colors.heading
                        }}
                      >
                        {dimension.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {dimension.description}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: selectedBreakdown === dimension.id ? colors.teal : colors.border,
                        backgroundColor: selectedBreakdown === dimension.id ? colors.teal : 'transparent'
                      }}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Chart Type Selection */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
              Chart Type
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setChartType("bar")}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: chartType === "bar" ? colors.teal + '50' : colors.border,
                  backgroundColor: chartType === "bar" ? colors.teal + '15' : colors.panel
                }}
                activeOpacity={0.8}
              >
                <View className="items-center">
                  <BarChart3
                    color={chartType === "bar" ? colors.teal : colors.label}
                    size={20}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 6,
                      color: chartType === "bar" ? colors.teal : colors.heading
                    }}
                  >
                    Bar Chart
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setChartType("line")}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: chartType === "line" ? colors.teal + '50' : colors.border,
                  backgroundColor: chartType === "line" ? colors.teal + '15' : colors.panel
                }}
                activeOpacity={0.8}
              >
                <View className="items-center">
                  <TrendingUp
                    color={chartType === "line" ? colors.teal : colors.label}
                    size={20}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 6,
                      color: chartType === "line" ? colors.teal : colors.heading
                    }}
                  >
                    Line Chart
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setChartType("pie")}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: chartType === "pie" ? colors.teal + '50' : colors.border,
                  backgroundColor: chartType === "pie" ? colors.teal + '15' : colors.panel
                }}
                activeOpacity={0.8}
              >
                <View className="items-center">
                  <PieChart
                    color={chartType === "pie" ? colors.teal : colors.label}
                    size={20}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 6,
                      color: chartType === "pie" ? colors.teal : colors.heading
                    }}
                  >
                    Pie Chart
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Report Preview */}
          {reportName && selectedMetrics.length > 0 && selectedBreakdown && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
                Report Preview
              </Text>
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 12
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal, marginBottom: 6 }}>
                  {reportName}
                </Text>
                <Text style={{ fontSize: 12, color: colors.label, marginBottom: 4 }}>
                  <Text style={{ color: colors.heading }}>Date Range:</Text>{" "}
                  {
                    dateRangeOptions.find((d) => d.id === selectedDateRange)
                      ?.label
                  }
                </Text>
                <Text style={{ fontSize: 12, color: colors.label, marginBottom: 4 }}>
                  <Text style={{ color: colors.heading }}>Metrics:</Text>{" "}
                  {selectedMetrics
                    .map(
                      (m) =>
                        availableMetrics.find((metric) => metric.id === m)
                          ?.label
                    )
                    .join(", ")}
                </Text>
                <Text style={{ fontSize: 12, color: colors.label, marginBottom: 4 }}>
                  <Text style={{ color: colors.heading }}>Breakdown:</Text>{" "}
                  {
                    availableDimensions.find((d) => d.id === selectedBreakdown)
                      ?.label
                  }
                </Text>
                <Text style={{ fontSize: 12, color: colors.label }}>
                  <Text style={{ color: colors.heading }}>Chart Type:</Text>{" "}
                  {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-3" style={{ marginTop: 8, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={handleRunReport}
              style={{
                flex: 1,
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                opacity: isFormValid ? 1 : 0.5
              }}
              activeOpacity={0.8}
              disabled={!isFormValid}
            >
              <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>
                Run Report
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSaveReport}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                opacity: isFormValid ? 1 : 0.5
              }}
              activeOpacity={0.8}
              disabled={!isFormValid}
            >
              <View className="flex-row items-center">
                <Save color={colors.label} size={14} />
                <Text style={{ color: colors.label, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>
                  Save Report
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

export default CustomReportBuilderScreen;
