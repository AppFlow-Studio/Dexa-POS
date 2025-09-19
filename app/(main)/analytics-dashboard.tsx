import FilterControls from "@/components/analytics/FilterControls";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useRouter } from "expo-router";
import { BarChart3, Calendar, FileText, PieChart, Plus, TrendingUp, Users } from "lucide-react-native";
import React from "react";
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
    const { savedCustomReports } = useAnalyticsStore();

    const preBuiltReports = [
        {
            id: 'sales_summary',
            title: 'Sales Summary',
            description: 'Overview of total sales, orders, and key metrics',
            icon: <TrendingUp color="#3b82f6" size={24} />,
        },
        {
            id: 'item_sales',
            title: 'Item Sales',
            description: 'Best selling items and sales performance',
            icon: <BarChart3 color="#3b82f6" size={24} />,
        },
        {
            id: 'sales_by_hour',
            title: 'Sales by Hour',
            description: 'Peak hours and hourly sales patterns',
            icon: <Calendar color="#3b82f6" size={24} />,
        },
        {
            id: 'sales_by_employee',
            title: 'Sales by Employee',
            description: 'Individual employee performance metrics',
            icon: <Users color="#3b82f6" size={24} />,
        },
        {
            id: 'discounts',
            title: 'Discounts',
            description: 'Discount usage and impact on revenue',
            icon: <PieChart color="#3b82f6" size={24} />,
        },
        {
            id: 'payments',
            title: 'Payments',
            description: 'Payment methods and transaction analysis',
            icon: <FileText color="#3b82f6" size={24} />,
        },
    ];

    const handleReportPress = (reportId: string) => {
        router.push({
            pathname: '/analytics/report-view',
            params: { reportType: reportId }
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
                <View className="mb-6">
                    <Text className="text-3xl font-bold text-white mb-2">Analytics & Reports</Text>
                    <Text className="text-lg text-gray-400">
                        Analyze your business performance with detailed reports
                    </Text>
                </View>

                {/* Filter Controls */}
                <FilterControls />

                {/* Pre-built Reports Section */}
                <View className="mt-8">
                    <Text className="text-2xl font-bold text-white mb-4">Pre-built Reports</Text>
                    {preBuiltReports.map((report) => (
                        <ReportCard
                            key={report.id}
                            title={report.title}
                            description={report.description}
                            icon={report.icon}
                            onPress={() => handleReportPress(report.id)}
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
