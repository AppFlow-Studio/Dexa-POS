import React from 'react';
import { Text, View } from 'react-native';
import VictoryBarChart from './VictoryBarChart';

// Test component to verify the fix with category data
const VictoryBarChartTest = () => {
    // Sample category data that matches the table structure
    const categoryData = [
        { category: 'Sides', revenue: 2083.00, itemsSold: 468, orders: 219, percentage: 10.9 },
        { category: 'Burgers', revenue: 5511.00, itemsSold: 411, orders: 207, percentage: 28.7 },
        { category: 'Salads', revenue: 2340.00, itemsSold: 234, orders: 112, percentage: 12.2 },
        { category: 'Wraps', revenue: 2772.00, itemsSold: 252, orders: 122, percentage: 14.5 },
        { category: 'Beverages', revenue: 630.00, itemsSold: 252, orders: 115, percentage: 3.3 },
        { category: 'Breakfast', revenue: 4692.00, itemsSold: 449, orders: 219, percentage: 24.5 },
        { category: 'Desserts', revenue: 1152.00, itemsSold: 192, orders: 96, percentage: 6.0 }
    ];

    console.log('📊 VictoryBarChartTest: Category data:', categoryData);

    return (
        <View className="p-4 bg-[#212121]">
            <Text className="text-white text-xl font-bold mb-4">Category Revenue Analysis</Text>
            <VictoryBarChart
                data={categoryData}
                title="Revenue by Category"
                height={400}
                labelKey="category"
                valueKey="revenue"
                valueType="revenue"
                unit="$"
                barColor="#60a5fa"
                selectedBarColor="#3b82f6"
                showValueLabels={true}
                showTooltips={true}
                onDataPointPress={(dataPoint, position) => {
                    console.log('Category data point pressed:', dataPoint, 'at position:', position);
                }}
            />
        </View>
    );
};

export default VictoryBarChartTest;
