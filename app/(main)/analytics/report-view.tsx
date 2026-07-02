import FilterControls from "@/components/analytics/FilterControls";
import KpiTooltip from "@/components/analytics/KpiTooltip";
import ReportChart from "@/components/analytics/ReportChart";
import ReportTable from "@/components/analytics/ReportTable";
import { colors } from "@/lib/theme";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  DollarSign,
  Download,
  Hash,
  Share,
  ShoppingBag,
  TrendingUp
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const ReportViewScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { currentReportData, isLoading, error, fetchReportData, clearError } =
    useAnalyticsStore();

  // Helper function to generate smart date range titles for charts
  const getChartTitle = (baseTitle: string) => {
    if (
      !currentReportData?.salesTrends ||
      currentReportData.salesTrends.length === 0
    ) {
      return baseTitle;
    }

    const dates = currentReportData.salesTrends.map(
      (trend: { date: string }) => new Date(trend.date),
    );
    const startDate = new Date(
      Math.min(...dates.map((d: Date) => d.getTime())),
    );
    const endDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));

    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    if (startYear === endYear) {
      return `${baseTitle} - ${startYear}`;
    } else {
      return `${baseTitle} - ${startYear} - ${endYear}`;
    }
  };

  const [reportType, setReportType] = useState<string | null>(null);
  const [customConfig, setCustomConfig] = useState<any>(
    params.customConfig || null,
  );
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    // Parse navigation parameters only once
    if (!hasInitialized) {
      if (params.reportType) {
        setReportType(params.reportType as string);
        // Set chart type from params or use default
        const paramChartType = params.chartType as string;
        if (paramChartType === "line" || paramChartType === "pie") {
          setChartType(paramChartType);
        } else {
          setChartType("bar");
        }
      } else if (params.customReport) {
        try {
          const parsedConfig = JSON.parse(params.customReport as string);
          setCustomConfig(parsedConfig);
          // Use chart type from custom config or default
          const configChartType = parsedConfig.chartType;
          if (configChartType === "line" || configChartType === "pie") {
            setChartType(configChartType);
          } else {
            setChartType("bar");
          }
        } catch (e) {
          console.error("Failed to parse custom report config:", e);
          Alert.alert("Error", "Invalid report configuration");
          router.back();
          return;
        }
      }
      setHasInitialized(true);
      clearError();
    }
  }, [params, hasInitialized]);

  useEffect(() => {
    // Fetch data when report type or custom config changes
    if (hasInitialized) {
      if (reportType) {
        fetchReportData({ type: reportType });
      } else if (customConfig) {
        fetchReportData({ customConfig });
      }
    }
  }, [reportType, customConfig, hasInitialized]);

  // const handleExportCSV = async () => {
  //     if (!currentReportData?.tableData) {
  //         Alert.alert('Error', 'No data to export');
  //         return;
  //     }

  //     try {
  //         // Convert table data to CSV format
  //         const { headers, rows } = currentReportData.tableData;
  //         const csvContent = [
  //             headers.join(','),
  //             ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  //         ].join('\n');

  //         // Create file
  //         const fileName = `${currentReportData.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  //         const fileUri = FileSystem.documentDirectory + fileName;

  //         await FileSystem.writeAsStringAsync(fileUri, csvContent, {
  //             encoding: FileSystem.EncodingType.UTF8,
  //         });

  //         // Share the file
  //         if (await Sharing.isAvailableAsync()) {
  //             await Sharing.shareAsync(fileUri, {
  //                 mimeType: 'text/csv',
  //                 dialogTitle: `Export ${currentReportData.title}`,
  //             });
  //         } else {
  //             Alert.alert('Success', `File saved as ${fileName}`);
  //         }
  //     } catch (error) {
  //         console.error('Export error:', error);
  //         Alert.alert('Error', 'Failed to export CSV file');
  //     }
  // };

  const handleRefresh = useCallback(() => {
    if (reportType) {
      fetchReportData({ type: reportType });
    } else if (customConfig) {
      fetchReportData({ customConfig });
    }
  }, [reportType, customConfig]);

  const handleDataPointPress = useCallback((dataPoint: any) => {
    // This is where you can add custom logic for handling tooltip interactions
    // For example, logging, analytics tracking, or additional data processing
    console.log("Data point pressed:", dataPoint);
    // console.log('Position:', position);

    // You can add more detailed information processing here
    // For example, if you want to show additional details in a modal
    // or perform some action based on the data point
  }, []);

  if (isLoading && !currentReportData) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.teal} size="small" />
        </View>
        <Text style={{ fontSize: 13, color: colors.label }}>
          Loading report...
        </Text>
      </View>
    );
  }

  // if (error) {
  //     return (
  //         <View className="flex-1 bg-screen p-6">
  //             <View className="flex-row items-center mb-6">
  //                 <TouchableOpacity
  //                     onPress={() => router.back()}
  //                     className="mr-4 p-2"
  //                 >
  //                     <ArrowLeft color={colors.label} size={24} />
  //                 </TouchableOpacity>
  //                 <Text className="text-2xl font-bold text-white">Report Error</Text>
  //             </View>

  //             <View className="bg-red-900/30 border border-red-500 p-6 rounded-2xl">
  //                 <Text className="text-red-400 text-lg font-semibold mb-2">Error Loading Report</Text>
  //                 <Text className="text-red-300 mb-4">{error}</Text>
  //                 <TouchableOpacity
  //                     onPress={handleRefresh}
  //                     className="bg-red-600 px-6 py-3 rounded-xl self-start"
  //                 >
  //                     <Text className="text-white font-semibold">Retry</Text>
  //                 </TouchableOpacity>
  //             </View>
  //         </View>
  //     );
  // }

  if (!currentReportData) {
    return (
      <View className="flex-1 bg-screen items-center justify-center">
        <Text style={{ fontSize: 13, color: colors.label }}>
          No report data available
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-1 bg-screen">
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <View className="flex-row items-center">
          {/* <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <ArrowLeft color={colors.label} size={24} />
          </TouchableOpacity> */}
          <View>
            <Text
              style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}
            >
              {currentReportData.title}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              {isLoading ? "Updating..." : "Last updated: Just now"}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => {}}
            style={{
              padding: 8,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
            }}
          >
            <Download color={colors.label} size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRefresh}
            style={{
              padding: 8,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
            }}
            disabled={isLoading}
          >
            <Share color={colors.label} size={16} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {/* Filter Controls */}
        <FilterControls onFilterChange={handleRefresh} />

        {/* KPIs Section */}
        <View style={{ marginTop: 12 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.heading,
              marginBottom: 8,
            }}
          >
            Key Performance Indicators
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Gross Margin */}
            <View
              style={{
                flex: 1,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: colors.teal + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TrendingUp size={14} color={colors.teal} />
                </View>
                <KpiTooltip definition="Percentage of revenue remaining after subtracting cost of goods sold" />
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {currentReportData.kpis.grossMargin.toFixed(1)}%
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.label,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginTop: 3,
                }}
              >
                Gross Margin
              </Text>
            </View>

            {/* Total Revenue */}
            <View
              style={{
                flex: 1,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: colors.success + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <DollarSign size={14} color={colors.success} />
                </View>
                <KpiTooltip definition="Total sales revenue for the selected period" />
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                ${currentReportData.kpis.totalRevenue.toFixed(0)}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.label,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginTop: 3,
                }}
              >
                Total Revenue
              </Text>
            </View>

            {/* Avg Order Value */}
            <View
              style={{
                flex: 1,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: colors.info + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShoppingBag size={14} color={colors.info} />
                </View>
                <KpiTooltip definition="Average value per order" />
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                ${currentReportData.kpis.averageOrderValue.toFixed(2)}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.label,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginTop: 3,
                }}
              >
                Avg Order Value
              </Text>
            </View>

            {/* Total Orders */}
            <View
              style={{
                flex: 1,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: colors.warning + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Hash size={14} color={colors.warning} />
                </View>
                <KpiTooltip definition="Total number of orders placed" />
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {currentReportData.kpis.totalOrders}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.label,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginTop: 3,
                }}
              >
                Total Orders
              </Text>
            </View>
          </View>
        </View>

        {/* Chart Section */}
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.heading,
              marginBottom: 8,
            }}
          >
            Chart
          </Text>
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <ReportChart
              data={currentReportData.chartData}
              chartType={chartType}
              title={getChartTitle("Data Analysis")}
              onDataPointPress={handleDataPointPress}
            />
          </View>
        </View>

        {/* Table Section */}
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.heading,
              marginBottom: 8,
            }}
          >
            Detailed Data
          </Text>
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <ReportTable data={currentReportData.tableData} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ReportViewScreen;
