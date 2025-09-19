// components/analytics/ReportChart.tsx

import React from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';

interface ChartData {
    labels: string[];
    datasets: {
        data: number[];
        color?: (opacity: number) => string;
        strokeWidth?: number;
    }[];
}

interface ReportChartProps {
    data: any[];
    chartType: 'bar' | 'line' | 'pie';
    title?: string;
    height?: number;
}

const screenWidth = Dimensions.get('window').width;

const chartConfig = {
    backgroundColor: '#212121',
    backgroundGradientFrom: '#212121',
    backgroundGradientTo: '#212121',
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // Blue
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
        borderRadius: 16,
    },
    propsForDots: {
        r: '6',
        strokeWidth: '2',
        stroke: '#3b82f6',
    },
    propsForBackgroundLines: {
        strokeDasharray: '',
        stroke: '#374151',
        strokeWidth: 1,
    },
};

export default function ReportChart({ data, chartType, title, height = 250 }: ReportChartProps) {
    if (!data || data.length === 0) {
        return (
            <View className="h-56 bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    const formatDataForChart = (): ChartData => {
        switch (chartType) {
            case 'bar':
                return {
                    labels: data.map(item => item.name || item?.date?.replace('/2025', '') || item.hour || item.employee || item.method || ''),
                    datasets: [{
                        data: data.map(item => item.value || item.quantity || item.revenue || item.orders || 0),
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    }]
                };

            case 'line':
                return {
                    labels: data.map(item => item?.date?.replace('/2025', '') || item.name || ''),
                    datasets: [{
                        data: data.map(item => item.value || item.revenue || item.orders || 0),
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                        strokeWidth: 2,
                    }]
                };

            case 'pie':
                return {
                    labels: data.map(item => item.name || item.method || item.employee || ''),
                    datasets: [{
                        data: data.map(item => item.value || item.revenue || item.orders || 0),
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    }]
                };

            default:
                return {
                    labels: [],
                    datasets: [{ data: [] }]
                };
        }
    };

    const chartData = formatDataForChart();

    const renderChart = () => {
        const chartWidth = screenWidth * 2; // Account for padding

        switch (chartType) {
            case 'bar':
                return (
                    <ScrollView horizontal={true} className={`w-full`} contentContainerClassName='w-fit'>
                        <BarChart
                            data={chartData}
                            width={chartWidth}
                            height={height}
                            chartConfig={chartConfig}
                            verticalLabelRotation={30}
                            showValuesOnTopOfBars={true}
                            fromZero={true}
                            yAxisLabel="$"
                            yAxisSuffix=""
                            style={{
                                marginVertical: 8,
                                borderRadius: 16,
                            }}
                        />
                    </ScrollView>
                );

            case 'line':
                return (
                    <ScrollView horizontal={true} className={`w-full`} contentContainerClassName='w-fit'>
                        <LineChart
                            data={chartData}
                            width={chartWidth}
                            height={height}
                            chartConfig={chartConfig}
                            bezier
                            yAxisLabel="$"
                            yAxisSuffix=""
                            style={{
                                marginBottom: 8,
                                borderRadius: 16,
                            }}
                        />
                    </ScrollView>
                );

            case 'pie':
                return (
                    <PieChart
                        data={chartData.labels.map((label, index) => ({
                            name: label,
                            population: chartData.datasets[0].data[index],
                            color: `hsl(${(index * 137.5) % 360}, 70%, 50%)`,
                            legendFontColor: '#FFFFFF',
                            legendFontSize: 12,
                        }))}
                        width={chartWidth / 2}
                        height={height}
                        chartConfig={chartConfig}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="15"
                        style={{
                            marginVertical: 8,
                            borderRadius: 16,
                        }}
                    />
                );

            default:
                return (
                    <View className="h-56 items-center justify-center">
                        <Text className="text-gray-400">Unsupported chart type</Text>
                    </View>
                );
        }
    };

    return (
        <View className="bg-[#303030] rounded-2xl border border-gray-600 p-4">
            {title && (
                <Text className="text-white text-lg font-semibold mb-4">{title}</Text>
            )}
            {renderChart()}
        </View>
    );
}