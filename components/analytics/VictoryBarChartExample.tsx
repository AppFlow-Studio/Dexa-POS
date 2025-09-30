import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import VictoryBarChart from './VictoryBarChart';

// Example usage with different data formats
const VictoryBarChartExample = () => {
    // Example 1: Monthly data
    const monthlyData = Array.from({ length: 6 }, (_, index) => ({
        month: index + 1,
        listenCount: Math.floor(Math.random() * (100 - 50 + 1)) + 50,
    }));

    // Example 2: Category data
    const categoryData = [
        { category: 'Food', revenue: 1500 },
        { category: 'Drinks', revenue: 800 },
        { category: 'Desserts', revenue: 600 },
        { category: 'Appetizers', revenue: 400 }
    ];

    // Example 3: Employee performance
    const employeeData = [
        { name: 'John', sales: 2500 },
        { name: 'Sarah', sales: 1800 },
        { name: 'Mike', sales: 2200 },
        { name: 'Lisa', sales: 1900 }
    ];

    console.log('📊 VictoryBarChartExample: Sample data:', { monthlyData, categoryData, employeeData });

    return (
        <ScrollView className="bg-[#212121]">
            <View className="p-4">
                <Text className="text-white text-2xl font-bold mb-6">VictoryBarChart Examples</Text>

                {/* Monthly Data Example */}
                <View className="mb-8">
                    <Text className="text-white text-lg font-semibold mb-4">Monthly Listen Count</Text>
                    <VictoryBarChart
                        data={monthlyData}
                        title="Monthly Listen Count"
                        height={300}
                        labelKey="month"
                        valueKey="listenCount"
                        valueType="listens"
                        unit="listens"
                        barColor="#60a5fa"
                        selectedBarColor="#3b82f6"
                        onDataPointPress={(dataPoint, position) => {
                            console.log('Monthly data point pressed:', dataPoint, 'at position:', position);
                        }}
                    />
                </View>

                {/* Category Data Example */}
                <View className="mb-8">
                    <Text className="text-white text-lg font-semibold mb-4">Revenue by Category</Text>
                    <VictoryBarChart
                        data={categoryData}
                        title="Revenue by Category"
                        height={300}
                        labelKey="category"
                        valueKey="revenue"
                        valueType="revenue"
                        unit="$"
                        barColor="#10b981"
                        selectedBarColor="#059669"
                        onDataPointPress={(dataPoint, position) => {
                            console.log('Category data point pressed:', dataPoint, 'at position:', position);
                        }}
                    />
                </View>

                {/* Employee Data Example */}
                <View className="mb-8">
                    <Text className="text-white text-lg font-semibold mb-4">Employee Sales Performance</Text>
                    <VictoryBarChart
                        data={employeeData}
                        title="Employee Sales Performance"
                        height={300}
                        labelKey="name"
                        valueKey="sales"
                        valueType="sales"
                        unit="$"
                        barColor="#f59e0b"
                        selectedBarColor="#d97706"
                        showValueLabels={true}
                        showTooltips={true}
                        onDataPointPress={(dataPoint, position) => {
                            console.log('Employee data point pressed:', dataPoint, 'at position:', position);
                        }}
                    />
                </View>
            </View>
        </ScrollView>
    );
};

export default VictoryBarChartExample;
