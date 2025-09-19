import FilterControls from "@/components/analytics/FilterControls";
import KpiTooltip from "@/components/analytics/KpiTooltip";
import ReportChart from "@/components/analytics/ReportChart";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useRouter } from "expo-router";
import { BarChart3, Calendar, Package, PieChart, Plus, ShoppingCart, TrendingUp, Users } from "lucide-react-native";
import React, { useEffect } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface ReportCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    onPress: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ title, description, icon, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        className="bg-[#303030] p-6 rounded-2xl border border-gray-600 mb-4"
        activeOpacity={0.8}
    >
        <View className="flex-row items-center mb-3">
            <View className="w-12 h-12 bg-blue-900/30 rounded-xl items-center justify-center mr-4">
                {icon}
            </View>
            <View className="flex-1">
                <Text className="text-xl font-bold text-white">{title}</Text>
                <Text className="text-sm text-gray-400 mt-1">{description}</Text>
            </View>
        </View>
    </TouchableOpacity>
);

const AnalyticsDashboardScreen = () => {
    const router = useRouter();
    const {
        savedCustomReports,
        currentReportData,
        isLoading,
        error,
        fetchReportData,
        filters
    } = useAnalyticsStore();

    // Helper function to generate smart date range titles
    const getDateRangeTitle = (baseTitle: string) => {
        if (!currentReportData?.salesTrends || currentReportData.salesTrends.length === 0) {
            return baseTitle;
        }

        const dates = currentReportData.salesTrends.map(trend => new Date(trend.date));
        const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const endDate = new Date(Math.max(...dates.map(d => d.getTime())));

        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear();

        if (startYear === endYear) {
            return `${baseTitle} - ${startYear}`;
        } else {
            return `${baseTitle} - ${startYear} - ${endYear}`;
        }
    };

    useEffect(() => {
        // Load overview data on mount
        fetchReportData({ type: 'overview' });
    }, []);

    const preBuiltReports = [
        {
            id: 'sales-summary',
            title: 'Sales Summary',
            description: 'Overview of total sales, orders, and key metrics',
            icon: <TrendingUp color="#3b82f6" size={24} />,
            chartType: 'line'
        },
        {
            id: 'item-sales',
            title: 'Item Sales',
            description: 'Best selling items and sales performance',
            icon: <ShoppingCart color="#3b82f6" size={24} />,
            chartType: 'bar'
        },
        {
            id: 'sales-by-hour',
            title: 'Sales by Hour',
            description: 'Peak hours and hourly sales patterns',
            icon: <Calendar color="#3b82f6" size={24} />,
            chartType: 'line'
        },
        {
            id: 'sales-by-employee',
            title: 'Sales by Employee',
            description: 'Individual employee performance metrics',
            icon: <Users color="#3b82f6" size={24} />,
            chartType: 'pie'
        },
        {
            id: 'discounts',
            title: 'Discounts',
            description: 'Discount usage and impact on revenue',
            icon: <PieChart color="#3b82f6" size={24} />,
            chartType: 'pie'
        },
        {
            id: 'payments',
            title: 'Payments',
            description: 'Payment methods and transaction analysis',
            icon: <Package color="#3b82f6" size={24} />,
            chartType: 'pie'
        },
    ];

    const handleReportPress = (reportId: string, chartType?: string) => {
        router.push({
            pathname: '/analytics/report-view',
            params: {
                reportType: reportId,
                chartType: chartType || 'bar'
            }
        });
    };

    const handleCustomReportPress = (report: any) => {
        router.push({
            pathname: '/analytics/report-view',
            params: {
                customReport: JSON.stringify(report)
            }
        });
    };

    const handleCreateCustomReport = () => {
        router.push('/analytics/custom-report-builder');
    };

    return (
        <View className="flex-1 bg-[#212121]">
            <ScrollView contentContainerClassName="p-6">
                {/* Header */}
                {/* <View className="mb-6">
                    <Text className="text-3xl font-bold text-white mb-2">Analytics & Reports</Text>
                    <Text className="text-lg text-gray-400">
                        Analyze your business performance with detailed reports
                    </Text>
                </View> */}

                {/* Filter Controls */}
                <FilterControls />

                {/* KPI Cards */}
                {currentReportData && (
                    <View className="mt-6">
                        <Text className="text-xl font-bold text-white mb-4">Key Performance Indicators</Text>
                        <View className="flex-row flex-wrap gap-4">
                            <View className="bg-[#303030] p-4 rounded-xl border border-gray-600 flex-1 min-w-[150px]">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-sm text-gray-400">Gross Margin</Text>
                                    <KpiTooltip definition="Percentage of revenue remaining after subtracting cost of goods sold" />
                                </View>
                                <Text className="text-2xl font-bold text-white">
                                    {currentReportData.kpis.grossMargin.toFixed(1)}%
                                </Text>
                            </View>

                            <View className="bg-[#303030] p-4 rounded-xl border border-gray-600 flex-1 min-w-[150px]">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-sm text-gray-400">Total Revenue</Text>
                                    <KpiTooltip definition="Total sales revenue for the selected period" />
                                </View>
                                <Text className="text-2xl font-bold text-white">
                                    ${currentReportData.kpis.totalRevenue.toFixed(0)}
                                </Text>
                            </View>

                            <View className="bg-[#303030] p-4 rounded-xl border border-gray-600 flex-1 min-w-[150px]">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-sm text-gray-400">Avg Order Value</Text>
                                    <KpiTooltip definition="Average value per order" />
                                </View>
                                <Text className="text-2xl font-bold text-white">
                                    ${currentReportData.kpis.averageOrderValue.toFixed(2)}
                                </Text>
                            </View>

                            <View className="bg-[#303030] p-4 rounded-xl border border-gray-600 flex-1 min-w-[150px]">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-sm text-gray-400">Total Orders</Text>
                                    <KpiTooltip definition="Total number of orders placed" />
                                </View>
                                <Text className="text-2xl font-bold text-white">
                                    {currentReportData.kpis.totalOrders}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Sales Trend Chart */}
                {currentReportData && (
                    <View className="mt-8">
                        <Text className="text-xl font-bold text-white mb-4">Sales Trend</Text>
                        <ReportChart
                            data={currentReportData.chartData}
                            chartType="line"
                            title={getDateRangeTitle("Revenue Over Time")}
                        />
                    </View>
                )}

                {/* Fast & Slow Movers */}
                {currentReportData && (
                    <View className="mt-8">
                        <Text className="text-xl font-bold text-white mb-4">Inventory Analysis</Text>
                        <View className="flex-row gap-4">
                            <View className="flex-1">
                                <Text className="text-lg font-semibold text-white mb-3">Top 5 Fast Movers</Text>
                                <View className="bg-[#303030] rounded-xl border border-gray-600 p-4">
                                    {currentReportData.inventoryAnalysis.fastMovers.map((item, index) => (
                                        <View key={index} className="flex-row justify-between items-center py-2 border-b border-gray-600 last:border-b-0">
                                            <Text className="text-white text-sm flex-1">{item.itemName}</Text>
                                            <Text className="text-blue-400 text-sm font-semibold">{item.totalSold}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <View className="flex-1">
                                <Text className="text-lg font-semibold text-white mb-3">Top 5 Slow Movers</Text>
                                <View className="bg-[#303030] rounded-xl border border-gray-600 p-4">
                                    {currentReportData.inventoryAnalysis.slowMovers.map((item, index) => (
                                        <View key={index} className="flex-row justify-between items-center py-2 border-b border-gray-600 last:border-b-0">
                                            <Text className="text-white text-sm flex-1">{item.itemName}</Text>
                                            <Text className="text-red-400 text-sm font-semibold">{item.totalSold}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* Pre-built Reports Section */}
                <View className="mt-8">
                    <Text className="text-2xl font-bold text-white mb-4">Pre-built Reports</Text>
                    {preBuiltReports.map((report) => (
                        <ReportCard
                            key={report.id}
                            title={report.title}
                            description={report.description}
                            icon={report.icon}
                            onPress={() => handleReportPress(report.id, report.chartType)}
                        />
                    ))}
                </View>

                {/* Custom Reports Section */}
                <View className="mt-8">
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-2xl font-bold text-white">Custom Reports</Text>
                        <TouchableOpacity
                            onPress={handleCreateCustomReport}
                            className="flex-row items-center bg-blue-600 px-4 py-2 rounded-xl"
                            activeOpacity={0.8}
                        >
                            <Plus color="white" size={20} />
                            <Text className="text-white font-semibold ml-2">Create</Text>
                        </TouchableOpacity>
                    </View>

                    {savedCustomReports.length > 0 ? (
                        savedCustomReports.map((report) => (
                            <ReportCard
                                key={report.id}
                                title={report.name}
                                description={`Metrics: ${report.metrics.join(', ')} | Breakdown: ${report.breakdown}`}
                                icon={<BarChart3 color="#3b82f6" size={24} />}
                                onPress={() => handleCustomReportPress(report)}
                            />
                        ))
                    ) : (
                        <View className="bg-[#303030] p-8 rounded-2xl border border-gray-600 items-center">
                            <BarChart3 color="#6b7280" size={48} />
                            <Text className="text-lg text-gray-400 mt-4 text-center">
                                No custom reports yet
                            </Text>
                            <Text className="text-sm text-gray-500 mt-2 text-center">
                                Create your first custom report to get started
                            </Text>
                            <TouchableOpacity
                                onPress={handleCreateCustomReport}
                                className="mt-4 bg-blue-600 px-6 py-3 rounded-xl"
                                activeOpacity={0.8}
                            >
                                <Text className="text-white font-semibold">Create Report</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

export default AnalyticsDashboardScreen;
