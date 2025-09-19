import FilterControls from "@/components/analytics/FilterControls";
import KpiTooltip from "@/components/analytics/KpiTooltip";
import ReportChart from "@/components/analytics/ReportChart";
import ReportTable from "@/components/analytics/ReportTable";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Download, Share } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

const ReportViewScreen = () => {
    const router = useRouter();
    const params = useLocalSearchParams();
    const {
        currentReportData,
        isLoading,
        error,
        fetchReportData,
        clearError
    } = useAnalyticsStore();

    const [reportConfig, setReportConfig] = useState<{
        type?: string;
        customConfig?: any;
    }>({});

    useEffect(() => {
        // Parse navigation parameters
        if (params.reportType) {
            setReportConfig({ type: params.reportType as string });
        } else if (params.customReport) {
            try {
                const customConfig = JSON.parse(params.customReport as string);
                setReportConfig({ customConfig });
            } catch (e) {
                console.error('Failed to parse custom report config:', e);
                Alert.alert('Error', 'Invalid report configuration');
                router.back();
                return;
            }
        }

        // Clear any previous errors
        clearError();
    }, [params]);

    useEffect(() => {
        // Fetch data when report config changes
        if (reportConfig.type || reportConfig.customConfig) {
            fetchReportData(reportConfig);
        }
    }, [reportConfig]);

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

    const handleRefresh = () => {
        if (reportConfig.type || reportConfig.customConfig) {
            fetchReportData(reportConfig);
        }
    };

    if (isLoading && !currentReportData) {
        return (
            <View className="flex-1 bg-[#212121] items-center justify-center">
                <Text className="text-xl text-white">Loading report...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View className="flex-1 bg-[#212121] p-6">
                <View className="flex-row items-center mb-6">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mr-4 p-2"
                    >
                        <ArrowLeft color="#9CA3AF" size={24} />
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-white">Report Error</Text>
                </View>

                <View className="bg-red-900/30 border border-red-500 p-6 rounded-2xl">
                    <Text className="text-red-400 text-lg font-semibold mb-2">Error Loading Report</Text>
                    <Text className="text-red-300 mb-4">{error}</Text>
                    <TouchableOpacity
                        onPress={handleRefresh}
                        className="bg-red-600 px-6 py-3 rounded-xl self-start"
                    >
                        <Text className="text-white font-semibold">Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!currentReportData) {
        return (
            <View className="flex-1 bg-[#212121] items-center justify-center">
                <Text className="text-xl text-white">No report data available</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#212121]">
            {/* Header */}
            <View className="flex-row items-center justify-between p-6 border-b border-gray-700">
                <View className="flex-row items-center">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="mr-4 p-2"
                    >
                        <ArrowLeft color="#9CA3AF" size={24} />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-2xl font-bold text-white">{currentReportData.title}</Text>
                        <Text className="text-sm text-gray-400">
                            {isLoading ? 'Updating...' : 'Last updated: Just now'}
                        </Text>
                    </View>
                </View>

                <View className="flex-row gap-2">
                    <TouchableOpacity
                        onPress={() => { }}
                        className="p-3 bg-[#303030] border border-gray-600 rounded-xl"
                    >
                        <Download color="#9CA3AF" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleRefresh}
                        className="p-3 bg-[#303030] border border-gray-600 rounded-xl"
                        disabled={isLoading}
                    >
                        <Share color="#9CA3AF" size={20} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerClassName="p-6">
                {/* Filter Controls */}
                <FilterControls />

                {/* KPIs Section */}
                <View className="mt-6">
                    <Text className="text-xl font-bold text-white mb-4">Key Performance Indicators</Text>
                    <View className="flex-row flex-wrap gap-4">
                        {currentReportData.kpis.map((kpi, index) => (
                            <View key={index} className="bg-[#303030] p-4 rounded-xl border border-gray-600 flex-1 min-w-[200px]">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-sm text-gray-400">{kpi.label}</Text>
                                    <KpiTooltip definition={kpi.definition} />
                                </View>
                                <Text className="text-2xl font-bold text-white">{kpi.value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Chart Section */}
                <View className="mt-8">
                    <Text className="text-xl font-bold text-white mb-4">Chart</Text>
                    <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
                        <ReportChart
                            data={currentReportData.chartData}
                            chartType={reportConfig.customConfig?.chartType || 'bar'}
                        />
                    </View>
                </View>

                {/* Table Section */}
                <View className="mt-8">
                    <Text className="text-xl font-bold text-white mb-4">Detailed Data</Text>
                    <View className="bg-[#303030] rounded-2xl border border-gray-600 overflow-hidden">
                        <ReportTable data={currentReportData.tableData} />
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default ReportViewScreen;
